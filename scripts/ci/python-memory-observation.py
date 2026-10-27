"""実controllerと既存の受入順序を作者CIで1回観測し、原因の証拠だけを残す。"""

import json
import os
import re
import subprocess
import sys
import threading
import time
from pathlib import Path, PurePosixPath


OUTPUT = Path("test-results/python-memory-observation")


def read_metadata(path):
    """読み取れない資源値をゼロにせず、欠測として記録する。"""
    try:
        return {"value": Path(path).read_text()[:8192]}
    except OSError as error:
        return {"unavailable": str(error)}


def host_snapshot(name):
    """ホストのメモリと自分のcgroup情報だけを固定pathから取得する。"""
    value = {
        "timeNs": time.time_ns(),
        "meminfo": read_metadata("/proc/meminfo"),
        "selfCgroup": read_metadata("/proc/self/cgroup"),
        "rootMemoryEvents": read_metadata("/sys/fs/cgroup/memory.events"),
        "rootMemoryPressure": read_metadata("/sys/fs/cgroup/memory.pressure"),
    }
    (OUTPUT / name).write_text(json.dumps(value, indent=2) + "\n")


def container_location(identifier, owner, role="learner"):
    """同じ所有containerのPID・cgroup・祖先の資源を読み、欠測は明示する。"""
    result = {"containerId": identifier, "timeNs": time.time_ns()}
    inspected = json.loads(
        subprocess.check_output(["docker", "inspect", identifier], text=True, timeout=5)
    )[0]
    labels = inspected["Config"]["Labels"]
    if (
        inspected["Id"] != identifier
        or labels.get("app.tsumucode.owner") != owner
        or labels.get("app.tsumucode.role") != role
    ):
        raise RuntimeError("Container identity mismatch")
    pid = inspected["State"]["Pid"]
    result["owner"] = owner
    result["role"] = role
    result["pid"] = pid
    result["running"] = inspected["State"]["Running"]
    if pid <= 0:
        result["unavailable"] = "Container had already exited"
        return result
    membership = read_metadata(f"/proc/{pid}/cgroup")
    result["membership"] = membership
    for line in membership.get("value", "").splitlines():
        if not line.startswith("0::"):
            continue
        relative = PurePosixPath(line[3:])
        if ".." in relative.parts or identifier not in str(relative):
            result["unavailable"] = "PID cgroup identity was not confirmed"
            continue
        cgroup = Path("/sys/fs/cgroup") / str(relative).lstrip("/")
        result["memory"] = {}
        while True:
            result["memory"][str(cgroup)] = {
                field: read_metadata(cgroup / field)
                for field in ["memory.events", "memory.current", "memory.max", "memory.pressure"]
            }
            if cgroup == Path("/sys/fs/cgroup"):
                break
            cgroup = cgroup.parent
    return result


def observe_events(process, owner, errors):
    """開始前からの履歴とliveイベントを読み、認証値や全設定は保存しない。"""
    try:
        with (OUTPUT / "events.jsonl").open("w") as events, (
            OUTPUT / "learner-locations.jsonl"
        ).open("w") as locations:
            for line in process.stdout:
                try:
                    event = json.loads(line)
                    attributes = event.get("Actor", {}).get("Attributes", {})
                    actual_owner = attributes.get("app.tsumucode.owner")
                    if actual_owner not in observation_owners(owner):
                        continue
                    identifier = event.get("Actor", {}).get("ID", "")
                    action = event.get("Action", "").split(":", 1)[0]
                    record = {
                        "type": event.get("Type"),
                        "action": action,
                        "containerId": identifier,
                        "timeNano": event.get("timeNano"),
                    }
                    record["owner"] = actual_owner
                    record["role"] = attributes.get("app.tsumucode.role")
                    record["termination"] = {
                        key: attributes[key] for key in ["signal", "exitCode"] if key in attributes
                    }
                    events.write(json.dumps(record) + "\n")
                    events.flush()
                    labels = attributes
                    if action != "start" or labels.get("app.tsumucode.role") != "learner":
                        continue
                    try:
                        location = container_location(identifier, actual_owner)
                    except Exception as error:
                        location = {"containerId": identifier, "unavailable": str(error)}
                    locations.write(json.dumps(location) + "\n")
                    locations.flush()
                except Exception as error:
                    errors.append(str(error))
    except Exception as error:
        errors.append(f"Event reader: {error}")


def record_journal(started_seconds):
    """関連サービスのOOM・kill行だけを残し、権限不足と一致なしを区別する。"""
    commands = {
        "kernel": ["journalctl", "--dmesg"],
        "daemon": [
            "journalctl", "--unit", "docker", "--unit", "containerd",
            "--unit", "systemd-oomd",
        ],
    }
    for name, command in commands.items():
        try:
            observed = subprocess.run(
                command + ["--since", f"@{started_seconds}", "--no-pager", "--output", "short-iso"],
                capture_output=True, text=True, timeout=10,
            )
            matching = [
                line[:2048] for line in observed.stdout.splitlines()
                if re.search(r"oom|out of memory|killed process|memory cgroup|kill.*(?:task|container)", line, re.I)
            ]
            result = {
                "returnCode": observed.returncode, "matchingLines": matching[:1000],
                "stderr": observed.stderr[:4096],
                "completeness": "not-established; no match is not absence of OOM",
            }
        except Exception as error:
            result = {"unavailable": str(error)}
        (OUTPUT / f"{name}-journal.json").write_text(json.dumps(result, indent=2) + "\n")


def cleanup_container(identifier, owner, role, result):
    """作成した同一ID・owner・roleを再確認し、通常停止と個別回収の結果を残す。"""
    try:
        inspected = json.loads(subprocess.check_output(
            ["docker", "inspect", identifier], text=True, timeout=5,
        ))[0]
        labels = inspected["Config"]["Labels"]
        if (inspected["Id"] != identifier
                or labels.get("app.tsumucode.owner") != owner
                or labels.get("app.tsumucode.role") != role):
            raise RuntimeError("Cleanup identity mismatch")
        for action in ["logs", "stop", "logs", "rm"]:
            try:
                if action == "logs":
                    suffix = "after-stop" if "stop" in result else "before-stop"
                    with (OUTPUT / f"{role}-{identifier[:12]}-{suffix}.log").open("wb") as output:
                        captured = subprocess.run(
                            ["docker", "logs", identifier], stdout=output,
                            stderr=subprocess.STDOUT, timeout=10,
                        )
                else:
                    command = ["docker", action]
                    if action == "stop":
                        command.extend(["--timeout", "30"])
                    captured = subprocess.run(
                        command + [identifier], capture_output=True, text=True, timeout=35,
                    )
                result[action] = {"returnCode": captured.returncode}
                if captured.returncode != 0:
                    result.setdefault("errors", []).append(f"{action}: exit {captured.returncode}")
            except Exception as error:
                result.setdefault("errors", []).append(f"{action}: {error}")

    except Exception as error:
        result.setdefault("errors", []).append(str(error))


def observation_owners(owner):
    """元の受入が作る固定4ownerだけを対象にし、他作業を含めない。"""
    return [owner, owner + "-grade-sentinel", owner + "-sentinel", owner + "-diagnostic"]


def compose_command():
    """元Composeへ観測flagと所有labelだけのoverrideを重ねる。"""
    return ["./scripts/docker-compose.sh", "-p", os.environ["TSUMUCODE_OBSERVATION_OWNER"],
            "-f", "compose.learning.yaml", "-f", str(OUTPUT / "compose-observation.yaml")]


def prepare_compose():
    """既存6targetを通常手順でbuildし、元の設定やfixtureは変更しない。"""
    owner = os.environ["TSUMUCODE_OBSERVATION_OWNER"]
    if re.fullmatch(r"tsumucode-learning-cpython-observe-\d+-\d+", owner) is None:
        raise RuntimeError("Fixed CI observation owner required")
    OUTPUT.mkdir(parents=True, exist_ok=True)
    labels = {"app.tsumucode.owner": owner}
    services = {
        name: {"build": {"labels": labels}, "labels": {**labels, "app.tsumucode.role": name}}
        for name in ["project", "next-project", "grader", "web", "controller", "preview"]
    }
    services["controller"]["environment"] = {"TSUMUCODE_TERMINATION_DIAGNOSTICS": "1"}
    override = {"services": services, "networks": {name: {"labels": labels} for name in ["web", "learning"]}}
    (OUTPUT / "compose-observation.yaml").write_text(json.dumps(override, indent=2) + "\n")
    with (OUTPUT / "build.log").open("wb") as output:
        subprocess.run(compose_command() + ["--profile", "build-project", "build"],
                       stdout=output, stderr=subprocess.STDOUT, check=True, timeout=180)


def snapshot_resources(name, owner):
    """前処理の区切りで所有containerと祖先の資源を保存し、欠測なら先へ進まない。"""
    host_snapshot(name + "-host.json")
    records = []
    for observed_owner in observation_owners(owner):
        identifiers = subprocess.check_output([
            "docker", "ps", "-aq", "--no-trunc", "--filter",
            f"label=app.tsumucode.owner={observed_owner}",
        ], text=True, timeout=10).split()
        for identifier in identifiers:
            inspected = json.loads(subprocess.check_output(["docker", "inspect", identifier], text=True, timeout=5))[0]
            role = inspected["Config"]["Labels"].get("app.tsumucode.role")
            record = container_location(identifier, observed_owner, role)
            records.append(record)
    (OUTPUT / (name + "-resources.json")).write_text(json.dumps(records, indent=2) + "\n")
    running_services = {record["role"] for record in records if record.get("running") and record["owner"] == owner}
    if not {"web", "controller", "preview"}.issubset(running_services):
        raise RuntimeError("Original Compose services were not running")
    for record in records:
        if not record.get("running"):
            continue
        memory = record.get("memory", {})
        leaf = next(iter(memory.values()), {})
        if record.get("unavailable") or any("value" not in leaf.get(field, {}) for field in ["memory.events", "memory.current", "memory.max"]):
            raise RuntimeError("Running container resource observation was unavailable")


def main():
    """元Compose・Browser・採点・常駐・Node・Pythonの前処理を各1回観測する。"""
    owner = os.environ["TSUMUCODE_OBSERVATION_OWNER"]
    if re.fullmatch(r"tsumucode-learning-cpython-observe-\d+-\d+", owner) is None:
        raise RuntimeError("Fixed CI observation owner required")
    OUTPUT.mkdir(parents=True, exist_ok=True)
    started_ns = time.time_ns()
    host_snapshot("host-before.json")
    server = subprocess.check_output(
        ["docker", "version", "--format", "{{json .Server}}"], text=True
    )
    (OUTPUT / "server.json").write_text(server)
    event_errors = []
    event_stderr = (OUTPUT / "events.stderr").open("w")
    events = subprocess.Popen(
        [
            "docker", "events", "--since", f"{started_ns // 1000000000}.{started_ns % 1000000000:09d}",
            "--filter", "label=app.tsumucode.owner", "--filter", "type=container",
            "--format", "{{json .}}",
        ],
        stdout=subprocess.PIPE, stderr=event_stderr, text=True,
    )
    reader = threading.Thread(target=observe_events, args=(events, owner, event_errors), daemon=True)
    reader.start()
    identifier = None
    result = {"status": "incomplete", "sourceCommit": os.environ["GITHUB_SHA"], "acceptances": []}
    try:
        compose = compose_command()
        with (OUTPUT / "start.log").open("wb") as output:
            subprocess.run(compose + ["up", "--no-build", "-d", "web", "controller", "preview"],
                           stdout=output, stderr=subprocess.STDOUT, check=True, timeout=30)
        identifier = subprocess.check_output(compose + ["ps", "-q", "controller"], text=True, timeout=10).strip()
        if re.fullmatch(r"[0-9a-f]{64}", identifier) is None:
            raise RuntimeError("Controller ID was not confirmed")
        # 元Node受入は実web proxyを使う。認証値を出力せず接続開始だけ待つ。
        readiness = """
        import { request } from 'node:http';
        import { setTimeout as sleep } from 'node:timers/promises';
        for (let attempt = 0; attempt < 50; attempt += 1) {
          try {
            await new Promise((resolve, reject) => {
              const req = request({
                hostname: 'web',
                port: 4173,
                path: '/api/session',
                method: 'POST',
                headers: {
                  host: '127.0.0.1:4173',
                  origin: 'http://127.0.0.1:4173',
                  'content-type': 'application/json',
                  'content-length': 2,
                },
              }, (response) => {
                response.on('error', reject);
                response.on('end', () => {
                  if (response.statusCode === 200) resolve();
                  else reject(new Error(`Readiness HTTP ${response.statusCode}`));
                });
                response.resume();
              });
              req.setTimeout(1000, () => req.destroy(new Error('Readiness timeout')));
              req.on('error', reject);
              req.end('{}');
            });
            break;
          } catch (error) {
            if (error.code !== 'ECONNREFUSED' || attempt === 49) throw error;
            await sleep(100);
          }
        }
        """
        subprocess.run([
            "docker", "exec", identifier, "node", "--input-type=module", "--eval", readiness,
        ], check=True, timeout=10)
        snapshot_resources("before-browser", owner)
        with (OUTPUT / "browser-prefix.log").open("wb") as output:
            browser = subprocess.run([
                "docker", "run", "--rm", "--init", "--network", owner + "_web",
                "--label", f"app.tsumucode.owner={owner}", "--label", "app.tsumucode.role=browser",
                "--cpus", "2", "--memory", "1g", "--pids-limit", "256",
                "--cap-drop", "ALL", "--security-opt", "no-new-privileges:true",
                owner + "-grader:local",
            ], stdout=output, stderr=subprocess.STDOUT, timeout=60)
        result["acceptances"].append({"name": "original-browser-prefix", "returnCode": browser.returncode})
        snapshot_resources("after-browser", owner)
        if browser.returncode != 0:
            raise RuntimeError("Original Browser prefix failed")
        for name in ["project-grade-acceptance.mjs", "resident-acceptance.mjs", "acceptance.mjs", "python-acceptance.mjs"]:
            with (OUTPUT / (name + ".log")).open("wb") as output:
                accepted = subprocess.run(
                    ["docker", "exec", "-i", identifier, "node", "--input-type=module"],
                    input=Path("scripts/local", name).read_bytes(), stdout=output,
                    stderr=subprocess.STDOUT, timeout=60,
                )
            result["acceptances"].append({"name": name, "returnCode": accepted.returncode})
            snapshot_resources("after-" + name, owner)
            if accepted.returncode != 0:
                raise RuntimeError(f"Original acceptance failed: {name}")
        result["status"] = "controller-observation-complete-not-full-runtime-acceptance"
    except Exception as error:
        result["observationError"] = str(error)
        raise
    finally:
        try:
            host_snapshot("host-after.json")
        except Exception as error:
            event_errors.append(f"Host snapshot: {error}")
        result["cleanup"] = {}
        for observed_owner in observation_owners(owner):
            try:
                identifiers = subprocess.check_output([
                    "docker", "ps", "-aq", "--no-trunc", "--filter",
                    f"label=app.tsumucode.owner={observed_owner}",
                ], text=True, timeout=10).split()
                for current in identifiers:
                    inspected = json.loads(subprocess.check_output(["docker", "inspect", current], text=True, timeout=5))[0]
                    role = inspected["Config"]["Labels"].get("app.tsumucode.role")
                    if role not in {"learner", "grader", "web", "controller", "preview", "browser"}:
                        raise RuntimeError("Unexpected owned cleanup role")
                    result["cleanup"][current] = {}
                    cleanup_container(current, observed_owner, role, result["cleanup"][current])
            except Exception as error:
                result["cleanup"][observed_owner] = {"error": str(error)}
        try:
            down = subprocess.run(compose_command() + ["down", "--timeout", "30"], capture_output=True, text=True, timeout=40)
            result["cleanup"]["compose"] = {"returnCode": down.returncode, "stderr": down.stderr}
        except Exception as error:
            result["cleanup"]["compose"] = {"error": str(error)}
        result["eventsExitBeforeStop"] = events.poll()
        if result["eventsExitBeforeStop"] is not None:
            event_errors.append("Event stream exited before the observation ended")
        try:
            events.terminate()
            events.wait(timeout=10)
            result["eventsFinalExit"] = events.returncode
        except Exception as error:
            event_errors.append(str(error))
        finally:
            reader.join(timeout=10)
            event_stderr.close()
        result["eventsReaderStopped"] = not reader.is_alive()
        result["eventsErrors"] = event_errors
        record_journal(started_ns // 1000000000)
        result["normalRuntimeOrPublicationPassed"] = False
        (OUTPUT / "summary.json").write_text(json.dumps(result, indent=2) + "\n")
        print(json.dumps(result))
        if event_errors or reader.is_alive() or any(
            item.get("errors") or item.get("error") or item.get("returnCode", 0) != 0
            for item in result["cleanup"].values()
        ):
            raise RuntimeError("Observation or cleanup was incomplete; inspect saved evidence")


if __name__ == "__main__":
    if sys.argv[1:] == ["--prepare"]:
        prepare_compose()
    elif len(sys.argv) == 1:
        main()
    else:
        raise RuntimeError("Unsupported observation arguments")
