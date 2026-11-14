import importlib.util
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

MODULE = Path(__file__).resolve().parents[4] / 'scripts/release/v2/anchor-control/check_git_metadata.py'
spec = importlib.util.spec_from_file_location('anchor_git_metadata_guard', MODULE)
guard = importlib.util.module_from_spec(spec)
spec.loader.exec_module(guard)
EXPECTED = 'a' * 40
CONFIG = '[core]\n\trepositoryformatversion = 0\n\tfilemode = true\n\tbare = false\n\tlogallrefupdates = true\n'


class MetadataGuardTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(os.path.realpath(self.tmp.name))
        self.git = self.root / '.git'
        (self.git / 'objects' / 'info').mkdir(parents=True)
        (self.git / 'refs').mkdir()
        (self.git / 'info').mkdir()
        (self.git / 'hooks').mkdir()
        (self.git / 'HEAD').write_text(EXPECTED + '\n', encoding='ascii')
        (self.git / 'config').write_text(CONFIG, encoding='ascii')

    def inspect(self, mounts=None):
        with patch.object(guard, 'read_mounts', return_value=mounts or [(str(self.root), True)]):
            guard.inspect_repo(str(self.root), EXPECTED)

    def test_accepts_only_minimal_known_detached_config(self):
        self.inspect()

    def test_rejects_unknown_or_ambiguous_config(self):
        for extra in ('\tfsmonitor = evil\n', '[include]\n path = evil\n', '\tFILEMODE = true\n', '\tfilemode = tr\\\nue\n'):
            with self.subTest(extra=extra):
                (self.git / 'config').write_text(CONFIG + extra, encoding='ascii')
                with self.assertRaises(ValueError): self.inspect()

    def test_rejects_unsafe_git_metadata(self):
        (self.git / 'objects' / 'pack').mkdir()
        for relative in ('info/attributes', 'info/exclude', 'objects/info/alternates', 'hooks/post-checkout', 'commondir', 'gitdir', 'objects/pack/test.promisor'):
            with self.subTest(relative=relative):
                target = self.git / relative
                target.write_text('unsafe', encoding='ascii')
                with self.assertRaises(ValueError): self.inspect()
                target.unlink()
        (self.git / 'packed-refs').write_text('a' * 40 + ' refs/replace/' + 'b' * 40 + '\n', encoding='ascii')
        with self.assertRaises(ValueError): self.inspect()

    def test_rejects_symlink_and_hardlink(self):
        config = self.git / 'config'
        original = self.root / 'outside'
        original.write_text(CONFIG, encoding='ascii')
        config.unlink()
        config.symlink_to(original)
        with self.assertRaises(ValueError): self.inspect()
        config.unlink()
        os.link(original, config)
        with self.assertRaises(ValueError): self.inspect()

    def test_rejects_writable_mount_or_wrong_head(self):
        with self.assertRaises(ValueError): self.inspect([(str(self.root), False)])
        with self.assertRaises(ValueError): self.inspect([(str(self.root), True), (str(self.root), False)])
        with self.assertRaises(ValueError): self.inspect([(str(self.root), True), (str(self.git / 'objects'), False)])
        (self.git / 'HEAD').write_text('b' * 40 + '\n', encoding='ascii')
        with self.assertRaises(ValueError): self.inspect()


if __name__ == '__main__': unittest.main()
