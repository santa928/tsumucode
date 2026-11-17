"""Unconnected pre-Git/Node metadata guard; not object or workflow authentication."""
import os
from pathlib import Path
import re
import stat
import sys

MAX_FILES = 100_000
MAX_TOTAL = 1024 * 1024 * 1024
MAX_FILE = 512 * 1024 * 1024
CONFIG_LINE = re.compile(r'^[ \t]*(repositoryformatversion|filemode|bare|logallrefupdates)[ \t]*=[ \t]*(0|true|false)[ \t]*$')


def read_mounts():
    with open('/proc/self/mountinfo', 'rb') as file:
        raw = file.read(2 * 1024 * 1024 + 1)
    if len(raw) > 2 * 1024 * 1024:
        raise ValueError('unsafe metadata')
    replacements = {b'040': b' ', b'011': b'\t', b'012': b'\n', b'134': b'\\'}
    result = []
    for line in raw.splitlines():
        fields = line.split(b' - ', 1)[0].split()
        if len(fields) < 6:
            raise ValueError('unsafe metadata')
        encoded = fields[4]
        for match in re.finditer(rb'\\(.)', encoded):
            if encoded[match.start() + 1:match.start() + 4] not in replacements:
                raise ValueError('unsafe metadata')
        mount = re.sub(rb'\\(040|011|012|134)', lambda match: replacements[match.group(1)], encoded)
        result.append((os.fsdecode(mount), b'ro' in fields[5].split(b',')))
    return result


def within(root, target):
    return target == root or target.startswith(root.rstrip('/') + '/')


def read_regular(file, limit):
    fd = os.open(file, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        before = os.fstat(fd)
        if not stat.S_ISREG(before.st_mode) or before.st_nlink != 1 or before.st_size > limit:
            raise ValueError('unsafe metadata')
        chunks, count = [], 0
        while True:
            part = os.read(fd, min(65536, limit + 1 - count))
            if not part:
                break
            count += len(part)
            if count > limit:
                raise ValueError('unsafe metadata')
            chunks.append(part)
        after = os.fstat(fd)
        if (count != before.st_size or after.st_size != before.st_size or after.st_ino != before.st_ino
                or after.st_dev != before.st_dev or after.st_mtime_ns != before.st_mtime_ns
                or after.st_ctime_ns != before.st_ctime_ns or after.st_nlink != 1):
            raise ValueError('unsafe metadata')
        return b''.join(chunks)
    finally:
        os.close(fd)


def inspect_repo(root, expected):
    if not os.path.isabs(root) or os.path.normpath(root) != root or not re.fullmatch('[a-f0-9]{40}', expected):
        raise ValueError('unsafe metadata')
    if os.path.realpath(root) != root or not os.path.isdir(root):
        raise ValueError('unsafe metadata')
    mounts = read_mounts()
    parents = [(len(mount), readonly) for mount, readonly in mounts if within(mount, root)]
    nearest = max((length for length, _ in parents), default=-1)
    selected = [readonly for length, readonly in parents if length == nearest]
    if len(selected) != 1 or not selected[0] or any(within(root, mount) and not readonly for mount, readonly in mounts):
        raise ValueError('unsafe metadata')
    git = Path(root) / '.git'
    if not git.is_dir() or git.is_symlink():
        raise ValueError('unsafe metadata')

    count = total = 0
    pending = [git]
    while pending:
        directory = pending.pop()
        with os.scandir(directory) as entries:
            for entry in entries:
                count += 1
                if count > MAX_FILES or any(ord(character) < 32 or ord(character) == 127 for character in entry.name):
                    raise ValueError('unsafe metadata')
                if directory == git / 'objects' / 'pack' and entry.name.endswith('.promisor'):
                    raise ValueError('unsafe metadata')
                info = entry.stat(follow_symlinks=False)
                if stat.S_ISDIR(info.st_mode):
                    pending.append(Path(entry.path))
                elif stat.S_ISREG(info.st_mode):
                    total += info.st_size
                    if info.st_nlink != 1 or info.st_size > MAX_FILE or total > MAX_TOTAL:
                        raise ValueError('unsafe metadata')
                else:
                    raise ValueError('unsafe metadata')

    for relative in ('info/attributes', 'info/exclude', 'info/grafts', 'objects/info/alternates',
                     'objects/info/http-alternates', 'refs/replace', 'shallow', 'config.worktree',
                     'commondir', 'gitdir'):
        if os.path.lexists(git / relative):
            raise ValueError('unsafe metadata')
    hooks = git / 'hooks'
    if hooks.exists():
        for entry in hooks.iterdir():
            if not re.fullmatch('[a-z0-9-]+\\.sample', entry.name) or not entry.is_file():
                raise ValueError('unsafe metadata')
    if read_regular(git / 'HEAD', 64) != (expected + '\n').encode('ascii'):
        raise ValueError('unsafe metadata')
    config = read_regular(git / 'config', 4096).decode('ascii', errors='strict').splitlines()
    if not config or config[0] != '[core]':
        raise ValueError('unsafe metadata')
    values = {}
    for line in config[1:]:
        match = CONFIG_LINE.fullmatch(line)
        if not match or match.group(1) in values:
            raise ValueError('unsafe metadata')
        values[match.group(1)] = match.group(2)
    if (set(values) != {'repositoryformatversion', 'filemode', 'bare', 'logallrefupdates'}
            or values['repositoryformatversion'] != '0' or values['bare'] != 'false'
            or values['filemode'] not in ('true', 'false') or values['logallrefupdates'] not in ('true', 'false')):
        raise ValueError('unsafe metadata')
    packed = git / 'packed-refs'
    if packed.exists() and b'refs/replace/' in read_regular(packed, 16 * 1024 * 1024):
        raise ValueError('unsafe metadata')


if __name__ == '__main__':
    try:
        if len(sys.argv) != 3:
            raise ValueError('unsafe metadata')
        inspect_repo(sys.argv[1], sys.argv[2])
        print('anchor metadata: accepted (not authenticated)')
    except (OSError, UnicodeError, ValueError):
        print('anchor metadata rejected', file=sys.stderr)
        sys.exit(1)
