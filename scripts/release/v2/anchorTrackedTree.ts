import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { isolatedAnchorGitEnvironment } from './anchorProcessSafety';
import { CommitSchema } from './schema';

const exec = promisify(execFile);
const maxFileBytes = 16 * 1024 * 1024;
const maxTotalBytes = 128 * 1024 * 1024;
const maxFiles = 10000;

/**
 * Compare tracked checkout bytes with a fixed Git tree using one ls-tree process.
 * The Git executable/object database and a read-only, isolated checkout are trusted inputs;
 * this does not protect untracked dependencies or prevent concurrent same-user modification.
 */
export async function assertAnchorTrackedTree(rootInput: string, commitInput: string) {
  if (!path.isAbsolute(rootInput)) throw Error('Verifier checkout must be absolute');
  const root = await realpath(rootInput),
    commit = CommitSchema.parse(commitInput);
  const { stdout } = await exec(
    '/usr/bin/git',
    ['ls-tree', '-r', '-z', '-l', '--full-tree', commit],
    {
      cwd: root,
      env: isolatedAnchorGitEnvironment(),
      encoding: 'buffer',
      timeout: 10000,
      maxBuffer: 8 * 1024 * 1024,
    },
  );
  const listing = new TextDecoder('utf-8', { fatal: true }).decode(stdout).split('\0');
  if (listing.pop() !== '' || !listing.length || listing.length > maxFiles)
    throw Error('Invalid verifier Git tree');
  let total = 0;
  for (const item of listing) {
    const match = /^(100644|100755) blob ([a-f0-9]{40})\s+(\d+)\t([\s\S]+)$/u.exec(item);
    if (!match) throw Error('Unsupported verifier Git tree entry');
    const [, mode, oid, sizeText, relative] = match;
    const size = Number(sizeText),
      parts = relative!.split('/');
    if (
      !Number.isSafeInteger(size) ||
      size < 0 ||
      size > maxFileBytes ||
      parts.some((part) => !part || part === '.' || part === '..' || part === '.git') ||
      relative!.includes('\\') ||
      Array.from(relative!).some((character) => {
        const code = character.charCodeAt(0);
        return code < 32 || code === 127;
      })
    )
      throw Error('Unsafe verifier Git tree entry');
    total += size;
    if (total > maxTotalBytes) throw Error('Verifier Git tree exceeds size limit');
    const file = path.join(root, ...parts);
    const initial = await lstat(file).catch((error: unknown) => {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')
        throw Error('Verifier tracked path missing');
      throw error;
    });
    if (!initial.isFile() || initial.isSymbolicLink() || (await realpath(file)) !== file)
      throw Error('Verifier tracked path is not a regular file');
    const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const before = await handle.stat();
      if (before.nlink !== 1) throw Error('Verifier tracked file has multiple hardlinks');
      if (
        !before.isFile() ||
        before.dev !== initial.dev ||
        before.ino !== initial.ino ||
        before.size !== size ||
        (mode === '100755') !== Boolean(before.mode & 0o111)
      )
        throw Error('Verifier tracked file identity differs');
      const digest = createHash('sha1').update(`blob ${String(size)}\0`);
      const buffer = Buffer.allocUnsafe(64 * 1024);
      let position = 0;
      while (position < size) {
        const { bytesRead } = await handle.read(
          buffer,
          0,
          Math.min(buffer.length, size - position),
          position,
        );
        if (!bytesRead) throw Error('Verifier tracked file was truncated');
        digest.update(buffer.subarray(0, bytesRead));
        position += bytesRead;
      }
      const { bytesRead: extra } = await handle.read(buffer, 0, 1, position);
      const after = await handle.stat();
      const finalPath = await lstat(file);
      if (
        extra ||
        after.dev !== before.dev ||
        after.ino !== before.ino ||
        after.nlink !== 1 ||
        after.size !== before.size ||
        after.mtimeMs !== before.mtimeMs ||
        after.ctimeMs !== before.ctimeMs ||
        finalPath.dev !== before.dev ||
        finalPath.ino !== before.ino ||
        finalPath.nlink !== 1 ||
        !finalPath.isFile() ||
        (await realpath(file)) !== file ||
        digest.digest('hex') !== oid
      )
        throw Error('Verifier tracked file bytes differ');
    } finally {
      await handle.close();
    }
  }
}
