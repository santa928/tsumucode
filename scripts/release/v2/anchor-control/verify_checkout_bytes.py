#!/usr/bin/env python3
"""Compare a fixed GitHub tree and archive with one isolated read-only checkout.

This checks bytes, not GitHub origin or runner isolation. Inputs must be retrieved by a
trusted fixed-origin HTTPS client and the caller must prevent concurrent checkout writes.
"""
import gzip
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import sys
import tarfile

MAX_TREE = 16 * 1024 * 1024
MAX_ARCHIVE = 64 * 1024 * 1024
MAX_UNPACKED = 1024 * 1024 * 1024
MAX_FILE = 128 * 1024 * 1024
MAX_ENTRIES = 20000
MAX_READ = 1024 * 1024


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError('duplicate JSON key')
        result[key] = value
    return result


def safe_path(value):
    if (not isinstance(value, str) or not value or len(value.encode('utf8')) > 1024 or
            value.startswith('/') or '\\' in value or
            any(ord(c) < 32 or ord(c) == 127 for c in value) or
            any(part in ('', '.', '..') for part in value.split('/'))):
        raise ValueError('unsafe path')
    return value


def open_regular(path, limit):
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
    try:
        info = os.fstat(fd)
        if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or not 0 < info.st_size <= limit:
            raise ValueError('invalid file')
        return fd, info
    except BaseException:
        os.close(fd)
        raise


def stable(before, after):
    return (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns,
            before.st_ctime_ns, before.st_nlink) == (after.st_dev, after.st_ino, after.st_size,
                                                    after.st_mtime_ns, after.st_ctime_ns, after.st_nlink)


class LimitedReader:
    def __init__(self, source):
        self.source = source
        self.total = 0

    def read(self, size=-1):
        if size < 0 or size > MAX_READ:
            raise ValueError('oversized archive read')
        data = self.source.read(size)
        self.total += len(data)
        if self.total > MAX_UNPACKED:
            raise ValueError('archive expands too far')
        return data


def expected_tree(tree_bytes, expected_tree_id):
    data = json.loads(tree_bytes, object_pairs_hook=unique_object)
    if (not isinstance(data, dict) or data.get('sha') != expected_tree_id or
            data.get('truncated') is not False or not isinstance(data.get('tree'), list) or
            not 1 <= len(data['tree']) <= MAX_ENTRIES):
        raise ValueError('invalid tree')
    expected = {}
    for entry in data['tree']:
        if not isinstance(entry, dict):
            raise ValueError('invalid tree entry')
        name = safe_path(entry.get('path'))
        mode, kind, oid = entry.get('mode'), entry.get('type'), entry.get('sha')
        if (name in expected or not isinstance(oid, str) or not re.fullmatch(r'[a-f0-9]{40}', oid) or
                (kind, mode) not in (('tree', '040000'), ('blob', '100644'), ('blob', '100755'))):
            raise ValueError('invalid tree entry')
        expected[name] = (kind, mode, oid)
    for name in expected:
        parent = name.rpartition('/')[0]
        if parent and (parent not in expected or expected[parent][0] != 'tree'):
            raise ValueError('missing parent directory')
    return expected


def inspect_checkout_paths(root, expected):
    """Reject every unlisted path, link and special file; only root .git is excluded."""
    seen = set()
    pending = [(root, '')]
    while pending:
        directory, prefix = pending.pop()
        with os.scandir(directory) as entries:
            for entry in entries:
                relative = entry.name if not prefix else prefix + '/' + entry.name
                if not prefix and entry.name == '.git':
                    if not stat.S_ISDIR(entry.stat(follow_symlinks=False).st_mode):
                        raise ValueError('invalid git directory')
                    continue
                safe_path(relative)
                if relative in seen or relative not in expected or len(seen) >= MAX_ENTRIES:
                    raise ValueError('unexpected checkout path')
                info = entry.stat(follow_symlinks=False)
                expected_kind, mode, _ = expected[relative]
                if expected_kind == 'tree':
                    if not stat.S_ISDIR(info.st_mode):
                        raise ValueError('invalid checkout directory')
                    pending.append((entry.path, relative))
                elif (not stat.S_ISREG(info.st_mode) or info.st_nlink != 1 or
                      info.st_size > MAX_FILE or
                      ('100755' if info.st_mode & 0o111 else '100644') != mode):
                    raise ValueError('invalid checkout file')
                seen.add(relative)
    if seen != set(expected):
        raise ValueError('checkout paths incomplete')


def compare_checkout(root, commit, tree_id, tree_path, archive_path):
    if (not os.path.isabs(root) or os.path.realpath(root) != root or not os.path.isdir(root) or
            not re.fullmatch(r'[a-f0-9]{40}', commit) or not re.fullmatch(r'[a-f0-9]{40}', tree_id)):
        raise ValueError('invalid context')
    tree_fd, tree_stat = open_regular(tree_path, MAX_TREE)
    try:
        with os.fdopen(tree_fd, 'rb', closefd=False) as f:
            raw = f.read(MAX_TREE + 1)
        if len(raw) != tree_stat.st_size or not stable(tree_stat, os.fstat(tree_fd)):
            raise ValueError('tree changed')
    finally:
        os.close(tree_fd)
    expected = expected_tree(raw, tree_id)
    inspect_checkout_paths(root, expected)
    archive_fd, archive_stat = open_regular(archive_path, MAX_ARCHIVE)
    seen = set()
    prefix = 'tsumucode-' + commit + '/'
    try:
        with os.fdopen(archive_fd, 'rb', closefd=False) as raw_archive:
            with gzip.GzipFile(fileobj=raw_archive, mode='rb') as compressed:
                bounded = LimitedReader(compressed)
                with tarfile.open(fileobj=bounded, mode='r|') as archive:
                    root_seen = False
                    for member in archive:
                        name = member.name
                        if any(key != 'comment' or len(value.encode('utf8')) > 512
                               for key, value in member.pax_headers.items()):
                            raise ValueError('unsupported archive metadata')
                        if name == prefix.rstrip('/') and member.type == tarfile.DIRTYPE and not root_seen:
                            if member.mode != 0o775:
                                raise ValueError('invalid archive root')
                            root_seen = True
                            continue
                        if not name.startswith(prefix):
                            raise ValueError('archive prefix differs')
                        name = name[len(prefix):]
                        if member.type == tarfile.DIRTYPE and name.endswith('/'):
                            name = name[:-1]
                        name = safe_path(name)
                        if name in seen or name not in expected or len(seen) >= MAX_ENTRIES:
                            raise ValueError('invalid archive entry')
                        seen.add(name)
                        kind, mode, oid = expected[name]
                        if kind == 'tree':
                            if member.type != tarfile.DIRTYPE or member.mode != 0o775:
                                raise ValueError('invalid directory')
                            directory = os.path.join(root, name)
                            if os.path.realpath(directory) != directory or not os.path.isdir(directory):
                                raise ValueError('invalid checkout directory')
                            continue
                        if (member.type not in (tarfile.REGTYPE, tarfile.AREGTYPE) or
                                member.mode != (0o775 if mode == '100755' else 0o664) or
                                not 0 <= member.size <= MAX_FILE):
                            raise ValueError('invalid archive file')
                        file = os.path.join(root, name)
                        if os.path.realpath(file) != file:
                            raise ValueError('checkout path is not direct')
                        fd = os.open(file, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
                        try:
                            before = os.fstat(fd)
                            actual_mode = '100755' if before.st_mode & 0o111 else '100644'
                            if (not stat.S_ISREG(before.st_mode) or before.st_nlink != 1 or
                                    before.st_size != member.size or actual_mode != mode):
                                raise ValueError('invalid checkout file')
                            source = archive.extractfile(member)
                            if source is None:
                                raise ValueError('archive file absent')
                            git_hash = hashlib.sha1(f'blob {member.size}\0'.encode('ascii'))
                            archive_hash, checkout_hash = hashlib.sha256(), hashlib.sha256()
                            count = 0
                            while True:
                                chunk = source.read(65536)
                                if not chunk:
                                    break
                                actual = os.read(fd, len(chunk))
                                if len(actual) != len(chunk):
                                    raise ValueError('checkout file truncated')
                                count += len(chunk)
                                git_hash.update(chunk)
                                archive_hash.update(chunk)
                                checkout_hash.update(actual)
                            if (count != member.size or git_hash.hexdigest() != oid or
                                    archive_hash.digest() != checkout_hash.digest() or
                                    not stable(before, os.fstat(fd))):
                                raise ValueError('checkout bytes differ')
                        finally:
                            os.close(fd)
                    if not root_seen or seen != set(expected):
                        raise ValueError('archive incomplete')
                    # tarfile streaming can read past the end marker into its internal buffer.
                    # Check that buffer and drain gzip to EOF so CRC/trailer failures are seen.
                    buffered = getattr(archive.fileobj, 'buf', None)
                    if not isinstance(buffered, bytes) or any(buffered):
                        raise ValueError('invalid archive trailing data')
                    padding = len(buffered)
                    while True:
                        tail = bounded.read(65536)
                        if not tail:
                            break
                        if any(tail):
                            raise ValueError('invalid archive trailing data')
                        padding += len(tail)
                    if padding < 512:
                        raise ValueError('archive end marker incomplete')
        if not stable(archive_stat, os.fstat(archive_fd)):
            raise ValueError('archive changed')
    finally:
        os.close(archive_fd)
    return len(seen)


def main(args):
    if len(args) != 5 or not all(os.path.isabs(p) for p in (args[0], args[3], args[4])):
        raise ValueError('invalid arguments')
    print('checkout bytes verified:', compare_checkout(*args))


if __name__ == '__main__':
    try:
        main(sys.argv[1:])
    except (OSError, ValueError, TypeError, tarfile.TarError, EOFError):
        print('checkout byte verification failed', file=sys.stderr)
        sys.exit(1)
