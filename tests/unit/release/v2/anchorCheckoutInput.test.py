import subprocess
import unittest
from pathlib import Path

SCRIPT = Path('scripts/release/v2/anchor-control/fetch_fixed_checkout.sh').resolve()
COMMIT = 'a' * 40
TREE = 'b' * 40
TAG = 'tsumucode-app-123-456'
TAG_OBJECT = 'c' * 40
TAG_TARGET = 'd' * 40
TAG_SHA256 = 'e' * 64


class CheckoutInputTest(unittest.TestCase):
    def test_rejects_malformed_inputs_before_touching_git(self):
        cases = [[], [COMMIT], ['-f' + COMMIT[2:], TREE, TAG, TAG_OBJECT, TAG_TARGET, TAG_SHA256],
                 [COMMIT, 'A' * 40, TAG, TAG_OBJECT, TAG_TARGET, TAG_SHA256],
                 [COMMIT, TREE, '../tag', TAG_OBJECT, TAG_TARGET, TAG_SHA256],
                 [COMMIT, TREE, TAG + '\nrefs/heads/main', TAG_OBJECT, TAG_TARGET, TAG_SHA256],
                 [COMMIT, TREE, TAG, TAG_OBJECT + '0', TAG_TARGET, TAG_SHA256],
                 [COMMIT, TREE, TAG, TAG_OBJECT, TAG_TARGET, 'x' * 64]]
        for args in cases:
            with self.subTest(args=args):
                result = subprocess.run(['/bin/sh', str(SCRIPT), *args],
                                        capture_output=True, check=False)
                self.assertEqual(result.returncode, 2)
                self.assertNotIn(b'checkout and object consistency: PASS', result.stdout)


if __name__ == '__main__':
    unittest.main()
