import hashlib
import os
import subprocess
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path('scripts/release/v2/anchor-control/write_direct_output.py').resolve()


class DirectOutput(unittest.TestCase):
    def test_output_only_after_valid_bounded_file_and_digest(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            evidence, output = root / 'evidence', root / 'out'
            evidence.write_bytes(b'abc')
            output.touch()
            good = hashlib.sha256(b'abc').hexdigest()

            def run(path, digest):
                return subprocess.run(['/usr/bin/python3', '-I', str(SCRIPT), str(path), digest,
                                       str(output)], capture_output=True, check=False)

            self.assertNotEqual(run(evidence, '0' * 64).returncode, 0)
            self.assertEqual(output.read_bytes(), b'')
            self.assertNotEqual(run(evidence, 'not-a-digest').returncode, 0)
            self.assertNotEqual(run(root / 'missing', good).returncode, 0)
            hardlink = root / 'hardlink'
            os.link(evidence, hardlink)
            self.assertNotEqual(run(evidence, good).returncode, 0)
            hardlink.unlink()
            self.assertEqual(output.read_bytes(), b'')
            link = root / 'link'
            link.symlink_to(evidence)
            self.assertNotEqual(run(link, good).returncode, 0)
            self.assertEqual(output.read_bytes(), b'')
            evidence.write_bytes(b'x' * (16 * 1024 + 1))
            self.assertNotEqual(run(evidence, hashlib.sha256(evidence.read_bytes()).hexdigest()).returncode, 0)
            self.assertEqual(output.read_bytes(), b'')
            evidence.write_bytes(b'abc')
            result = run(evidence, good)
            self.assertEqual(result.returncode, 0)
            self.assertEqual(result.stdout, b'')
            self.assertEqual(output.read_text(), 'evidenceBase64=YWJj\nevidenceSha256=' + good + '\n')

    def test_output_symlink_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            evidence, target, output = root / 'evidence', root / 'target', root / 'out'
            evidence.write_bytes(b'abc')
            target.touch()
            output.symlink_to(target)
            result = subprocess.run(['/usr/bin/python3', '-I', str(SCRIPT), str(evidence),
                                     hashlib.sha256(b'abc').hexdigest(), str(output)],
                                    capture_output=True, check=False)
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual(target.read_bytes(), b'')


if __name__ == '__main__':
    unittest.main()
