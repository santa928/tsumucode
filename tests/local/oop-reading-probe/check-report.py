"""Produce fixed-count results only; raw test reports never leave the runner."""

import json
import os
import stat
import sys
from pathlib import Path

RESULTS = Path("probe-results")
OUTPUT = Path("bounded-oop-reading.json")
FILES = (("reading", "python-oop-acceptance-summary.json", 2), ("horizontal", "oop-horizontal-summary.json", 1))


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
    if len(sys.argv) != 2 or sys.argv[1] not in ("0", "1"):
        raise ValueError()
    result = {name: read_counts(file, target) for name, file, target in FILES}
    result["process"] = "passed" if sys.argv[1] == "0" else "failed"
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
