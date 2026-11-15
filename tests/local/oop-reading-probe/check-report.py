"""Produce fixed-count results only; raw test reports never leave the runner."""

import json
import os
import stat
import sys
from pathlib import Path

RESULTS = Path("probe-results")
OUTPUT = Path("bounded-oop-reading.json")
FILES = (("reading", "python-oop-acceptance-summary.json", 2), ("horizontal", "oop-horizontal-summary.json", 1))
STAGES = (
    "container-ready",
    "dependencies",
    "list-reading",
    "list-horizontal",
    "server-start",
    "server-ready",
    "test-reading",
    "test-horizontal",
    "complete",
)


def diagnostic(path):
    try:
        fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
        with os.fdopen(fd, "rb") as handle:
            if not stat.S_ISREG(os.fstat(handle.fileno()).st_mode):
                raise ValueError()
            data = handle.read(1024 * 1024 + 1)
        if len(data) > 1024 * 1024:
            return {"stage": "unknown", "kind": "diagnostic-overflow"}
        lines = data.decode("utf-8", errors="replace").splitlines()
        stage = "container-start"
        for line in lines:
            for fixed in STAGES:
                if line == "PROBE_STAGE=" + fixed:
                    stage = fixed
        text = "\n".join(lines).lower()
        kinds = (
            ("mount-read-only", ("read-only file system", "readonly file system")),
            ("bind-source-missing", ('invalid mount config for type "bind": bind source path does not exist',)),
            ("bind-config", ('invalid mount config for type "bind"',)),
            ("volume-readonly-anonymous", ('invalid mount config for type "volume": must not set readonly mode when using anonymous volumes',)),
            ("volume-config", ('invalid mount config for type "volume"',)),
            ("tmpfs-config", ('invalid mount config for type "tmpfs"',)),
            ("mount-invalid", ("invalid mount config", "invalid mount specification")),
            ("permission", ("permission denied", "eacces", "eperm")),
            ("command-missing", ("command not found", "executable file not found")),
            ("config-import", ("cannot find module", "cannot find package", "err_module_not_found", "syntaxerror")),
            ("dependencies", ("dependency-check=failed",)),
            ("browser-missing", ("executable doesn't exist", "browser has not been installed")),
            ("no-tests", ("no tests found",)),
            ("server-unavailable", ("server-unavailable", "timed out waiting for the config.webserver")),
            ("assertion", ("expect(", "assertionerror")),
        )
        kind = next((name for name, patterns in kinds if any(pattern in text for pattern in patterns)), "other")
        return {"stage": stage, "kind": kind}
    except Exception:
        return {"stage": "unknown", "kind": "diagnostic-unavailable"}


def read_counts(name, target):
    try:
        if RESULTS.is_symlink() or not RESULTS.is_dir():
            raise ValueError()
        fd = os.open(RESULTS / name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
        with os.fdopen(fd, "rb") as handle:
            if not stat.S_ISREG(os.fstat(handle.fileno()).st_mode):
                raise ValueError()
            data = handle.read(1024 * 1024 + 1)
        if len(data) > 1024 * 1024:
            raise ValueError()
        stats = json.loads(data)["stats"]
        counts = [stats[key] for key in ("expected", "unexpected", "skipped", "flaky")]
        if any(type(value) is not int or value < 0 or value > 1000 for value in counts):
            raise ValueError()
        passed, failed, skipped, flaky = counts
        return {
            "state": "passed" if (passed, failed, skipped, flaky) == (target, 0, 0, 0) else "failed",
            "passed": passed,
            "failed": failed,
            "skipped": skipped,
            "flaky": flaky,
        }
    except Exception:
        return {"state": "unavailable"}


def main():
    if len(sys.argv) != 3 or sys.argv[1] not in ("0", "1"):
        raise ValueError()
    result = {name: read_counts(file, target) for name, file, target in FILES}
    result["process"] = "passed" if sys.argv[1] == "0" else "failed"
    if sys.argv[1] != "0":
        result["diagnostic"] = diagnostic(sys.argv[2])
    ok = result["process"] == "passed" and all(result[name]["state"] == "passed" for name, _, _ in FILES)
    data = json.dumps(result, sort_keys=True, separators=(",", ":")) + "\n"
    fd = os.open(OUTPUT, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as output:
        output.write(data)
    print(data, end="")
    return ok


try:
    if not main():
        raise SystemExit(1)
except Exception:
    raise SystemExit("reading-result=failed") from None
