"""作者専用CIで固定CPythonのOOM状態通知を観測する。受入判定は変更しない。"""

import calendar
import datetime
import http.client
import json
import re
import socket
import subprocess
import threading
import time
import urllib.parse
from pathlib import Path


NODE_IMAGE = (
    "node:24.18.0-bookworm-slim@sha256:"
    "cb4e8f7c443347358b7875e717c29e27bf9befc8f5a26cf18af3c3dec80e58c5"
)
PYTHON_IMAGE = (
    "python:3.14.2-slim-bookworm@sha256:"
    "e87711ef5c86aaeaa7031718a69db79d334d94c545c709583f651b8185870941"
)
OWNER = "tsumucode-cpython-memory-observation"
OUTPUT = Path("test-results/python-memory-observation")
MEMORY_SOURCE = (
    "blocks = []\n"
    "for index in range(128):\n"
    "    blocks.append(bytearray(4 * 1024 * 1024))\n"
)


class DockerConnection(http.client.HTTPConnection):
    """既存Docker接続のUnix socketだけを使う。TCP接続や認証設定を追加しない。"""

    def connect(self):
        """ホスト名を解決せず、事前確認したsocketへ接続する。"""
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.settimeout(self.timeout)
        self.sock.connect(SOCKET_PATH)


def docker_api(method, path, body=None, raw=False):
    """固定APIの応答を2MiB以内に制限し、通信・JSON異常は成功にしない。"""
    connection = DockerConnection("localhost", timeout=10)
    try:
        payload = None if body is None else json.dumps(body).encode()
        headers = {} if payload is None else {"content-type": "application/json"}
        connection.request(method, "/v1.47" + path, payload, headers)
        response = connection.getresponse()
        data = response.read(2 * 1024 * 1024 + 1)
        if response.status >= 300 or len(data) > 2 * 1024 * 1024:
            message = data[:1024].decode("utf-8", errors="replace")
            raise RuntimeError(
                f"Docker API {method} {path}: {response.status}: {message}"
            )
        return data if raw else json.loads(data) if data else None
    finally:
        connection.close()


def event_timestamp(created):
    """DockerのUTC生成日時を、APIが要求するUnix秒.9桁小数へ損失なく変換する。"""
    match = re.fullmatch(
        r"(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?Z", created
    )
    if match is None:
        raise ValueError("Unexpected Docker creation timestamp")
    date = datetime.datetime.strptime(match.group(1), "%Y-%m-%dT%H:%M:%S")
    seconds = calendar.timegm(date.timetuple())
    fraction = (match.group(2) or "").ljust(9, "0")
    return f"{seconds}.{fraction}"


def inspect_owned(identifier):
    """今回作成したIDと所有labelを照合し、別作業の資源へ操作を広げない。"""
    observed = docker_api("GET", f"/containers/{identifier}/json")
    labels = observed["Config"]["Labels"]
    if observed["Id"] != identifier:
        raise RuntimeError("Container ID mismatch")
    if labels.get("app.tsumucode.owner") != OWNER:
        raise RuntimeError("Container owner mismatch")
    if labels.get("app.tsumucode.role") != "learner":
        raise RuntimeError("Container role mismatch")
    return observed


def observe_case(name, config):
    """製品と同じcontainer設定でwait直後からの状態とdaemonイベントを保存する。"""
    if (
        config["Image"] != PYTHON_IMAGE
        or config["User"] != "1000:1000"
        or config["HostConfig"]["Memory"] != 268435456
        or config["HostConfig"]["MemorySwap"] != 268435456
        or config["HostConfig"]["PidsLimit"] != 64
        or config["HostConfig"]["NetworkMode"] != "none"
        or config["HostConfig"].get("Binds")
        or config.get("Mounts")
    ):
        raise RuntimeError("Fixed learner profile mismatch")
    created = docker_api("POST", "/containers/create", config)
    identifier = created["Id"]
    record = {"case": name, "containerId": identifier, "states": []}
    deadline_fired = threading.Event()
    watchdog_errors = []
    watchdog_started = False

    def expire():
        """5秒を超えた今回の実行だけを止め、OOM通知の証拠とは混同しない。"""
        deadline_fired.set()
        try:
            if inspect_owned(identifier)["State"]["Running"]:
                docker_api("POST", f"/containers/{identifier}/kill")
        except Exception as error:
            watchdog_errors.append(str(error))

    watchdog = threading.Timer(5, expire)
    watchdog.daemon = True
    try:
        initial = inspect_owned(identifier)
        docker_api("POST", f"/containers/{identifier}/start")
        watchdog.start()
        watchdog_started = True
        record["wait"] = docker_api(
            "POST", f"/containers/{identifier}/wait?condition=not-running"
        )
        watchdog.cancel()
        waited_at = time.monotonic()
        for offset_ms in [0, 25, 100, 500]:
            remaining = waited_at + offset_ms / 1000 - time.monotonic()
            if remaining > 0:
                time.sleep(remaining)
            state = inspect_owned(identifier)["State"]
            record["states"].append(
                {
                    "targetAfterWaitMs": offset_ms,
                    "afterWaitMs": round((time.monotonic() - waited_at) * 1000, 3),
                    "state": state,
                }
            )
        now = time.time_ns()
        parameters = {
            "since": event_timestamp(initial["Created"]),
            "until": f"{now // 1000000000}.{now % 1000000000:09d}",
            "filters": json.dumps({"container": [identifier]}),
        }
        record["eventsQuery"] = parameters
        query = urllib.parse.urlencode(parameters)
        events = docker_api("GET", "/events?" + query, raw=True)
        record["events"] = [
            {
                "type": event.get("Type"),
                "actorId": event.get("Actor", {}).get("ID"),
                "action": event.get("Action"),
                "timeNano": event.get("timeNano"),
            }
            for event in map(json.loads, events.splitlines())
        ]
    except Exception as error:
        record["observationError"] = str(error)
        raise
    finally:
        try:
            watchdog.cancel()
            if watchdog_started:
                watchdog.join(timeout=11)
                if watchdog.is_alive():
                    raise RuntimeError("Probe watchdog did not finish")
            observed = inspect_owned(identifier)
            if observed["State"]["Running"]:
                docker_api("POST", f"/containers/{identifier}/stop?t=1")
            docker_api("DELETE", f"/containers/{identifier}")
            record["ownedContainerRemoved"] = True
        except Exception as error:
            record["cleanupError"] = str(error)
            raise
        finally:
            record["watchdogFired"] = deadline_fired.is_set()
            record["watchdogErrors"] = watchdog_errors
            (OUTPUT / f"{name}.json").write_text(json.dumps(record, indent=2) + "\n")
    return record


if __name__ == "__main__":
    OUTPUT.mkdir(parents=True, exist_ok=True)
    endpoint = subprocess.check_output(
        ["docker", "context", "inspect", "--format", "{{.Endpoints.docker.Host}}"],
        text=True,
    ).strip()
    if not endpoint.startswith("unix://"):
        raise RuntimeError("Existing Unix Docker connection required")
    SOCKET_PATH = endpoint.removeprefix("unix://")
    cases = [
        {"name": f"memory-{index}", "source": MEMORY_SOURCE}
        for index in range(3)
    ]
    cases.append({"name": "explicit-exit-137", "source": "import os\nos._exit(137)\n"})
    generator = """
import { containerConfig } from './scripts/local/docker-engine.mjs';
const cases = JSON.parse(process.argv[1]);
const configurations = cases.map(({ source }) =>
  containerConfig({ 'main.py': source }, process.argv[2], true),
);
console.log(JSON.stringify(configurations));
"""
    configs = json.loads(
        subprocess.check_output(
            [
                "docker", "run", "--pull", "never", "--network", "none",
                "--label", f"app.tsumucode.owner={OWNER}",
                "--label", "app.tsumucode.role=config-generator",
                "--read-only", "--memory", "256m", "--memory-swap", "256m",
                "--cpus", "1", "--pids-limit", "64", "--cap-drop", "ALL",
                "--security-opt", "no-new-privileges:true",
                "--mount", f"type=bind,src={Path.cwd()},dst=/workspace,readonly",
                "--workdir", "/workspace", NODE_IMAGE, "node", "--input-type=module",
                "-e", generator, json.dumps(cases), OWNER,
            ],
            text=True, timeout=30,
        )
    )
    if len(configs) != len(cases):
        raise RuntimeError("Fixed observation case count mismatch")
    server = json.loads(
        subprocess.check_output(
            ["docker", "version", "--format", "{{json .Server}}"], text=True
        )
    )
    records = [observe_case(case["name"], config) for case, config in zip(cases, configs)]
    summary = {
        "status": "observations-complete-not-acceptance",
        "server": server,
        "sourceCommit": subprocess.check_output(
            ["git", "rev-parse", "HEAD"], text=True
        ).strip(),
        "cases": records,
        "normalRuntimeOrPublicationPassed": False,
    }
    (OUTPUT / "summary.json").write_text(json.dumps(summary, indent=2) + "\n")
    print(json.dumps({"status": summary["status"], "cases": len(records)}))
