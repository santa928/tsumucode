import hashlib
import gzip
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import tarfile
import tempfile
import unittest
from unittest.mock import patch

MODULE = Path(__file__).resolve().parents[4] / 'scripts/release/v2/anchor-control/verify_checkout_bytes.py'
spec = importlib.util.spec_from_file_location('verify_checkout_bytes', MODULE)
verifier = importlib.util.module_from_spec(spec)
spec.loader.exec_module(verifier)
COMMIT, TREE = 'a' * 40, 'b' * 40
CONTENT = b'hello\n'
OID = hashlib.sha1(b'blob 6\0' + CONTENT).hexdigest()


class CheckoutBytesTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.base = Path(os.path.realpath(self.tmp.name))
        self.root = self.base / 'checkout'
        (self.root / 'dir').mkdir(parents=True)
        (self.root / 'dir' / 'file.txt').write_bytes(CONTENT)
        self.tree = self.base / 'tree.json'
        self.archive = self.base / 'archive.tar.gz'
        self.tree_data = {'sha': TREE, 'truncated': False, 'tree': [
            {'path': 'dir', 'type': 'tree', 'mode': '040000', 'sha': 'c' * 40},
            {'path': 'dir/file.txt', 'type': 'blob', 'mode': '100644', 'sha': OID},
        ]}
        self.write_tree()

    def write_tree(self):
        self.tree.write_text(json.dumps(self.tree_data))

    def write_archive(self, extra=None, content=CONTENT, file_type=tarfile.REGTYPE, pax=None):
        prefix = 'tsumucode-' + COMMIT
        with tarfile.open(self.archive, 'w:gz', format=tarfile.PAX_FORMAT) as archive:
            root = tarfile.TarInfo(prefix)
            root.type, root.mode = tarfile.DIRTYPE, 0o775
            archive.addfile(root)
            directory = tarfile.TarInfo(prefix + '/dir')
            directory.type, directory.mode = tarfile.DIRTYPE, 0o775
            archive.addfile(directory)
            file = tarfile.TarInfo(prefix + '/dir/file.txt')
            file.type, file.mode = file_type, 0o664
            file.size = len(content) if file_type == tarfile.REGTYPE else 0
            if pax:
                file.pax_headers = pax
            archive.addfile(file, io.BytesIO(content) if file.size else None)
            if extra:
                archive.addfile(extra)

    def verify(self):
        return verifier.compare_checkout(str(self.root), COMMIT, TREE, str(self.tree), str(self.archive))

    def test_matching_archive_tree_and_checkout(self):
        self.write_archive()
        self.assertEqual(self.verify(), 2)

    def test_rejects_changed_bytes_and_checkout_links(self):
        self.write_archive(content=b'HELLO\n')
        with self.assertRaises(ValueError):
            self.verify()
        self.write_archive()
        (self.root / 'dir' / 'file.txt').unlink()
        (self.root / 'dir' / 'file.txt').symlink_to('../outside')
        with self.assertRaises((ValueError, OSError)):
            self.verify()

    def test_rejects_truncated_tree_duplicate_path_and_special_entries(self):
        self.write_archive()
        self.tree_data['truncated'] = True
        self.write_tree()
        with self.assertRaises(ValueError):
            self.verify()
        self.tree_data['truncated'] = False
        self.write_tree()
        duplicate = tarfile.TarInfo('tsumucode-' + COMMIT + '/dir/file.txt')
        duplicate.mode = 0o664
        self.write_archive(extra=duplicate)
        with self.assertRaises(ValueError):
            self.verify()
        self.write_archive(file_type=tarfile.SYMTYPE)
        with self.assertRaises(ValueError):
            self.verify()

    def test_rejects_unsafe_path_and_unrecognized_pax(self):
        self.write_archive(pax={'unknown': 'value'})
        with self.assertRaises(ValueError):
            self.verify()
        self.write_archive()
        self.tree_data['tree'][1]['path'] = 'dir/../file.txt'
        self.write_tree()
        with self.assertRaises(ValueError):
            self.verify()

    def test_rejects_extra_paths_links_and_special_files(self):
        self.write_archive()
        extra = self.root / 'extra'
        extra.write_bytes(b'extra')
        with self.assertRaises(ValueError):
            self.verify()
        extra.unlink()
        extra.mkdir()
        with self.assertRaises(ValueError):
            self.verify()
        extra.rmdir()
        os.link(self.root / 'dir' / 'file.txt', extra)
        with self.assertRaises(ValueError):
            self.verify()
        extra.unlink()
        extra.symlink_to('missing')
        with self.assertRaises(ValueError):
            self.verify()
        extra.unlink()
        os.mkfifo(extra)
        with self.assertRaises(ValueError):
            self.verify()

    def test_rejects_hardlinked_expected_file(self):
        self.write_archive()
        os.link(self.root / 'dir' / 'file.txt', self.base / 'external-link')
        with self.assertRaises(ValueError):
            self.verify()

    def test_rejects_corrupt_gzip_trailer(self):
        self.write_archive()
        data = bytearray(self.archive.read_bytes())
        data[-8] ^= 1
        self.archive.write_bytes(data)
        with self.assertRaises((ValueError, OSError, EOFError)):
            self.verify()

    def test_rejects_nonzero_trailing_stream_and_expansion_limit(self):
        self.write_archive()
        self.archive.write_bytes(self.archive.read_bytes() + gzip.compress(b'unexpected'))
        with self.assertRaises(ValueError):
            self.verify()
        self.write_archive()
        with patch.object(verifier, 'MAX_UNPACKED', 1024):
            with self.assertRaises(ValueError):
                self.verify()

    def test_fifo_input_fails_without_blocking(self):
        self.write_archive()
        for file in (self.tree, self.archive):
            with self.subTest(file=file.name):
                original = file.read_bytes()
                file.unlink()
                os.mkfifo(file)
                result = subprocess.run(['/usr/bin/python3', '-I', str(MODULE), str(self.root),
                                         COMMIT, TREE, str(self.tree), str(self.archive)], timeout=2,
                                        capture_output=True, check=False)
                self.assertNotEqual(result.returncode, 0)
                file.unlink()
                file.write_bytes(original)


if __name__ == '__main__':
    unittest.main()
