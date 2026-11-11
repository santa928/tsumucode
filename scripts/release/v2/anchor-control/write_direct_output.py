#!/usr/bin/env python3
"""Disabled-job prototype: package an already verified observation, not authenticate it.

Only invoke after a successful producer exit in the same job. Job/needs identity,
privacy approval and authenticity remain the caller's separate responsibilities.
"""
import base64
import hashlib
import os
import re
import stat
import sys

LIMIT = 16 * 1024


def main(args):
    if len(args) != 3 or not re.fullmatch(r"[a-f0-9]{64}", args[1]):
        raise ValueError("invalid arguments")
    evidence_path, expected_hash, output_path = args
    if not all(os.path.isabs(p) for p in (evidence_path, output_path)):
        raise ValueError("absolute paths required")
    fd = os.open(evidence_path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        before = os.fstat(fd)
        if not stat.S_ISREG(before.st_mode) or before.st_nlink != 1 or not 0 < before.st_size <= LIMIT:
            raise ValueError("invalid evidence")
        data = b""
        while len(data) <= LIMIT:
            part = os.read(fd, LIMIT + 1 - len(data))
            if not part:
                break
            data += part
        after = os.fstat(fd)
        if (len(data) != before.st_size or before.st_size != after.st_size or
                before.st_mtime_ns != after.st_mtime_ns or before.st_ctime_ns != after.st_ctime_ns or
                hashlib.sha256(data).hexdigest() != expected_hash):
            raise ValueError("evidence changed or digest mismatch")
    finally:
        os.close(fd)
    payload = ("evidenceBase64=" + base64.b64encode(data).decode("ascii") +
               "\nevidenceSha256=" + expected_hash + "\n").encode("ascii")
    out = os.open(output_path, os.O_WRONLY | os.O_APPEND | os.O_NOFOLLOW)
    try:
        st = os.fstat(out)
        if not stat.S_ISREG(st.st_mode) or st.st_nlink != 1:
            raise ValueError("invalid output")
        view = memoryview(payload)
        while view:
            n = os.write(out, view)
            if n <= 0:
                raise OSError("output write failed")
            view = view[n:]
    finally:
        os.close(out)


if __name__ == "__main__":
    try:
        main(sys.argv[1:])
    except (OSError, ValueError):
        print("anchor output rejected", file=sys.stderr)
        sys.exit(1)
