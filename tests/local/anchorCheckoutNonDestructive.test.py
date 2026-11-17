"""Explicit Docker integration test; ANCHOR_TEST_IMAGE must be a reviewed local image."""
import hashlib
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

SCRIPT = Path('scripts/release/v2/anchor-control/fetch_fixed_checkout.sh').resolve()
CONFIG = ('[core]\n\trepositoryformatversion = 0\n\tfilemode = true\n'
          '\tbare = false\n\tlogallrefupdates = true\n')


def snapshot(root):
    result = []
    for directory, dirs, files in os.walk(root, followlinks=False):
        for name in sorted(dirs + files):
            item = Path(directory) / name
            relative = str(item.relative_to(root))
            if item.is_symlink():
                result.append((relative, 'link', os.readlink(item)))
            elif item.is_file():
                result.append((relative, 'file', hashlib.sha256(item.read_bytes()).hexdigest()))
            else:
                result.append((relative, 'dir', ''))
    return sorted(result)


class ExistingStagingTest(unittest.TestCase):
    def test_existing_data_is_rejected_unchanged(self):
        image = os.environ['ANCHOR_TEST_IMAGE']
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            fake_git = root / 'fake-git'
            fake_git.write_text('#!/bin/sh\nprintf called > /marker/called\nexit 77\n')
            fake_git.chmod(0o755)
            fake_failing = root / 'fake-git-failing'
            fake_failing.write_text('#!/bin/sh\nprintf "%s\\n" "$5" >> /marker/called\n'
                                    'case "$5" in fetch|fsck) exit 0 ;; '
                                    'rev-parse) printf "%s\\n" "' + 'b' * 40 + '"; exit 77 ;; '
                                    '*) exit 78 ;; esac\n')
            fake_failing.chmod(0o755)
            for kind in ('worktree', 'index', 'symlink', 'object', 'ref', 'hook', 'invalid_tag',
                         'git_error_correct_output'):
                with self.subTest(kind=kind):
                    repo = root / kind
                    marker = root / (kind + '-marker')
                    marker.mkdir()
                    git = repo / '.git'
                    for name in ('objects/info', 'objects/pack', 'refs', 'info', 'hooks'):
                        (git / name).mkdir(parents=True, exist_ok=True)
                    (git / 'config').write_text(CONFIG)
                    (git / 'HEAD').write_text('ref: refs/heads/main\n')
                    if kind == 'worktree':
                        (repo / 'precious').write_bytes(b'preserve')
                    elif kind == 'index':
                        (git / 'index').write_bytes(b'preserve-index')
                    elif kind == 'symlink':
                        (repo / 'link').symlink_to('missing')
                    elif kind == 'object':
                        (git / 'objects' / 'bad').write_bytes(b'preserve-object')
                    elif kind == 'ref':
                        (git / 'refs' / 'bad').write_bytes(b'preserve-ref')
                    elif kind == 'hook':
                        (git / 'hooks' / 'bad').write_bytes(b'preserve-hook')
                    before = snapshot(repo)
                    cmd = ['docker', 'run', '--rm', '--read-only', '--network', 'none',
                           '--cpus', '1', '--memory', '512m', '--cap-drop', 'ALL',
                           '--security-opt', 'no-new-privileges', '--user',
                           f'{os.getuid()}:{os.getgid()}', '--tmpfs',
                           '/tmp:rw,nosuid,nodev,size=32m,mode=1777', '--mount',
                           f'type=bind,source={repo},target=/repo', '--mount',
                           f'type=bind,source={SCRIPT},target=/control.sh,readonly',
                           '--mount', f'type=bind,source={fake_failing if kind == "git_error_correct_output" else fake_git},target=/usr/bin/git,readonly',
                           '--mount', f'type=bind,source={marker},target=/marker',
                           '--entrypoint', '/usr/bin/env', image, '-i', 'PATH=/usr/bin:/bin',
                           '/bin/sh', '/control.sh', 'a' * 40, 'b' * 40,
                           ('tsumucode-app-123-456\nrefs/heads/main' if kind == 'invalid_tag'
                            else 'tsumucode-app-123-456'), 'c' * 40, 'd' * 40, 'e' * 64]
                    result = subprocess.run(cmd, capture_output=True, timeout=30, check=False)
                    self.assertEqual(result.returncode, 2 if kind == 'invalid_tag' else 1)
                    self.assertEqual(result.stderr, b'')
                    self.assertNotIn(b'checkout and object consistency: PASS', result.stdout)
                    if kind == 'git_error_correct_output':
                        self.assertEqual((marker / 'called').read_text().splitlines(),
                                         ['fetch', 'fsck', 'rev-parse'])
                        print(f'{kind}: exit={result.returncode}; no reset after Git failure', flush=True)
                    else:
                        self.assertEqual(before, snapshot(repo))
                        self.assertFalse((marker / 'called').exists())
                        print(f'{kind}: exit={result.returncode}; snapshot equal; Git not called', flush=True)


if __name__ == '__main__':
    unittest.main()
