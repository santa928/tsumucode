"""実controllerと既存の受入順序を作者CIで1回観測し、原因の証拠だけを残す。"""

import json
import os
import re
import subprocess
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


def learner_location(identifier, owner):
    """同じlearnerのPIDとcgroupを結び、終了済み・再利用されたPIDは未確認にする。"""
    result = {"containerId": identifier, "timeNs": time.time_ns()}
    inspected = json.loads(
        subprocess.check_output(["docker", "inspect", identifier], text=True, timeout=5)
    )[0]
    labels = inspected["Config"]["Labels"]
    if (
        inspected["Id"] != identifier
        or labels.get("app.tsumucode.owner") != owner
        or labels.get("app.tsumucode.role") != "learner"
    ):
        raise RuntimeError("Learner identity mismatch")
    pid = inspected["State"]["Pid"]
    result["pid"] = pid
    result["running"] = inspected["State"]["Running"]
    if pid <= 0:
        result["unavailable"] = "Learner had already exited"
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
        result["memory"] = {
            field: read_metadata(cgroup / field)
            for field in ["memory.events", "memory.current", "memory.max"]
        }
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
                    identifier = event.get("Actor", {}).get("ID", "")
                    action = event.get("Action", "").split(":", 1)[0]
                    record = {
                        "type": event.get("Type"),
                        "action": action,
                        "containerId": identifier,
                        "timeNano": event.get("timeNano"),
                    }
                    attributes = event.get("Actor", {}).get("Attributes", {})
                    record["termination"] = {
                        key: attributes[key] for key in ["signal", "exitCode"] if key in attributes
                    }
                    events.write(json.dumps(record) + "\n")
                    events.flush()
                    labels = attributes
                    if action != "start" or labels.get("app.tsumucode.role") != "learner":
                        continue
                    try:
                        location = learner_location(identifier, owner)
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
        "kernel": ["journalctl", "--kernel"],
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
                    with (OUTPUT / f"{role}-{suffix}.log").open("wb") as output:
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


def main():
    """通常判定を変えず、Nodeの先行実行と元Python受入を各1回だけ通す。"""
    owner = os.environ["TSUMUCODE_OBSERVATION_OWNER"]
    if re.fullmatch(r"tsumucode-cpython-observe-\d+-\d+", owner) is None:
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
            "--filter", f"label=app.tsumucode.owner={owner}", "--filter", "type=container",
            "--format", "{{json .}}",
        ],
        stdout=subprocess.PIPE, stderr=event_stderr, text=True,
    )
    reader = threading.Thread(target=observe_events, args=(events, owner, event_errors), daemon=True)
    reader.start()
    identifier = None
    web = None
    network = None
    result = {"status": "incomplete", "sourceCommit": os.environ["GITHUB_SHA"], "acceptances": []}
    try:
        network = subprocess.check_output([
            "docker", "network", "create", "--internal", "--label",
            f"app.tsumucode.owner={owner}", owner + "-internal",
        ], text=True, timeout=10).strip()
        identifier = subprocess.check_output(
            [
                "docker", "run", "--detach", "--init", "--pull", "never",
                "--name", owner + "-controller", "--label", f"app.tsumucode.owner={owner}",
                "--label", "app.tsumucode.role=controller", "--network", network,
                "--network-alias", "controller",
                "--user", "0:1000", "--read-only", "--memory", "512m", "--cpus", "1",
                "--pids-limit", "128", "--cap-drop", "ALL", "--security-opt", "no-new-privileges:true",
                "--env", f"TSUMUCODE_LOCAL_OWNER={owner}",
                "--env", "TSUMUCODE_TERMINATION_DIAGNOSTICS=1",
                "--mount", "type=bind,src=/var/run/docker.sock,dst=/var/run/docker.sock",
                owner + "-controller:author",
            ],
            text=True, timeout=20,
        ).strip()
        web = subprocess.check_output([
            "docker", "run", "--detach", "--init", "--pull", "never",
            "--name", owner + "-web", "--label", f"app.tsumucode.owner={owner}",
            "--label", "app.tsumucode.role=web", "--network", network,
            "--network-alias", "web", "--user", "1000:1000", "--read-only",
            "--memory", "256m", "--cpus", "1", "--pids-limit", "128",
            "--cap-drop", "ALL", "--security-opt", "no-new-privileges:true",
            owner + "-web:author",
        ], text=True, timeout=20).strip()
        # 元Node受入は実web proxyを使う。認証値を出力せず接続開始だけ待つ。
        readiness = """
        import { setTimeout as sleep } from 'node:timers/promises';
        for (let attempt = 0; attempt < 50; attempt += 1) {
          try {
            const response = await fetch('http://web:4173/api/session', {
              method: 'POST',
              headers: { host: '127.0.0.1:4173', origin: 'http://127.0.0.1:4173' },
            });
            if (response.status !== 200) throw new Error('Unexpected readiness status');
            await response.arrayBuffer();
            break;
          } catch (error) {
            if (attempt === 49) throw error;
            await sleep(100);
          }
        }
        """
        subprocess.run([
            "docker", "exec", identifier, "node", "--input-type=module", "--eval", readiness,
        ], check=True, timeout=10)
        for name in ["acceptance.mjs", "python-acceptance.mjs"]:
            with (OUTPUT / (name + ".log")).open("wb") as output:
                accepted = subprocess.run(
                    ["docker", "exec", "-i", identifier, "node", "--input-type=module"],
                    input=Path("scripts/local", name).read_bytes(), stdout=output,
                    stderr=subprocess.STDOUT, timeout=60,
                )
            result["acceptances"].append({"name": name, "returnCode": accepted.returncode})
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
        if web:
            result["cleanup"]["web"] = {}
            cleanup_container(web, owner, "web", result["cleanup"]["web"])
        if identifier:
            result["cleanup"]["controller"] = {}
            cleanup_container(identifier, owner, "controller", result["cleanup"]["controller"])
        if network:
            try:
                removed = subprocess.run(["docker", "network", "rm", network], capture_output=True, text=True, timeout=10)
                result["cleanup"]["network"] = {"returnCode": removed.returncode, "stderr": removed.stderr}
            except Exception as error:
                result["cleanup"]["network"] = {"error": str(error)}
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
    main()
