"""Compare the rebuilt preview bytes with the saved #370 PR preview, not a release receipt."""

import hashlib
import os
from pathlib import Path

EXPECTED_FILES = 604
EXPECTED_MANIFEST = "640d1ca7ea7c26b9c5c6391f81d14ee9b5071ae9806ff94ac08d60c6d8f760c6"


def main():
    root = Path("dist")
    if not root.is_dir() or root.is_symlink():
        raise ValueError("preview root unavailable")
    rows = []
    for directory, subdirs, files in os.walk(root, followlinks=False):
        for name in subdirs + files:
            item = Path(directory) / name
            if item.is_symlink():
                raise ValueError("preview symlink rejected")
        for name in files:
            item = Path(directory) / name
            if not item.is_file():
                raise ValueError("preview non-file rejected")
            relative = item.relative_to(root).as_posix()
            if not relative.isascii() or any(ord(character) < 32 for character in relative):
                raise ValueError("preview path rejected")
            content = item.read_bytes()
            rows.append((relative, len(content), hashlib.sha256(content).hexdigest()))
    rows.sort()
    manifest = "".join(f"{name}\0{size}\0{digest}\n" for name, size, digest in rows).encode()
    if len(rows) != EXPECTED_FILES or hashlib.sha256(manifest).hexdigest() != EXPECTED_MANIFEST:
        raise ValueError("preview bytes differ")
    print("preview-bytes=matched; files=604; scope=pr-preview-not-release")


try:
    main()
except Exception:
    raise SystemExit("preview-byte-check=failed") from None
