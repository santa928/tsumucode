"""Validate the unconnected checkout verifier against one immutable public fixture."""
import gzip
import hashlib
import importlib.util
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import time
import unittest
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
MODULE = ROOT / 'scripts/release/v2/anchor-control/verify_checkout_bytes.py'
spec = importlib.util.spec_from_file_location('checkout_verifier', MODULE)
verifier = importlib.util.module_from_spec(spec)
spec.loader.exec_module(verifier)
COMMIT = '052cf97e23bbe4adb5e9b5685e1d4af5af3d4aba'
TREE = 'b09411aec2571b013c730ad2419cf404b0355b4c'
BASE = 'https://api.github.com/repos/santa928/tsumucode/git/trees/'
ARCHIVE = 'https://codeload.github.com/santa928/tsumucode/tar.gz/'
TREE_SHA256 = '294f0d6ff844d3f0bb40a5a21bc3045f4ec52fca6fcfe7e36e4d81b172e4ea0c'
ARCHIVE_SHA256 = '5c1492f96cba5a564ab580a0c312a5d7158c5814eae41e28153337439d4465f9'


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError('redirect rejected')


def download(url, destination, maximum, expected):
    opener = urllib.request.build_opener(NoRedirect())
    request = urllib.request.Request(url, headers={
        'User-Agent': 'TsumuCode-public-source-check', 'Accept': 'application/vnd.github+json',
    })
    total, digest, deadline = 0, hashlib.sha256(), time.monotonic() + 90
    with opener.open(request, timeout=30) as response, destination.open('xb') as out:
        if response.geturl() != url:
            raise ValueError('unexpected source')
        while True:
            if time.monotonic() > deadline:
                raise TimeoutError('download deadline')
            part = response.read(65536)
            if not part:
                break
            total += len(part)
            if total > maximum:
                raise ValueError('download exceeds limit')
            digest.update(part)
            out.write(part)
    if digest.hexdigest() != expected:
        raise ValueError('fixture digest differs')


class PublicFixtureTest(unittest.TestCase):
    def test_fixed_checkout_and_corrupted_archives(self):
        checkout = Path(os.environ['ANCHOR_PUBLIC_CHECKOUT']).resolve(strict=True)
        for revision, expected in [('HEAD', COMMIT), ('HEAD^{tree}', TREE)]:
            observed = subprocess.check_output(['git', '-C', str(checkout), 'rev-parse', revision], text=True).strip()
            self.assertEqual(observed, expected)
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            tree, archive = root / 'tree.json', root / 'original.tar.gz'
            download(BASE + TREE + '?recursive=1', tree, 8 * 1024 * 1024, TREE_SHA256)
            download(ARCHIVE + COMMIT, archive, 64 * 1024 * 1024, ARCHIVE_SHA256)
            args = (str(checkout), COMMIT, TREE, str(tree))
            self.assertEqual(verifier.compare_checkout(*args, str(archive)), 9306)
            crc, truncated = root / 'crc.tar.gz', root / 'truncated.tar.gz'
            shutil.copyfile(archive, crc)
            shutil.copyfile(archive, truncated)
            with crc.open('r+b') as stream:
                stream.seek(-8, os.SEEK_END)
                byte = stream.read(1)
                stream.seek(-8, os.SEEK_END)
                stream.write(bytes([byte[0] ^ 1]))
            with truncated.open('r+b') as stream:
                stream.truncate(os.fstat(stream.fileno()).st_size - 4)
            with self.assertRaises(gzip.BadGzipFile):
                verifier.compare_checkout(*args, str(crc))
            with self.assertRaises(EOFError):
                verifier.compare_checkout(*args, str(truncated))


if __name__ == '__main__':
    unittest.main()
