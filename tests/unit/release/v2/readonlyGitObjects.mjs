import { lstat, opendir } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import path from 'node:path';
import { TextDecoder } from 'node:util';

/** Read bounded mount metadata even when the kernel returns partial reads. */
export async function readMountInfoBounded(handle) {
  const maximum = 1024 * 1024;
  const chunks = [];
  let total = 0;
  while (total <= maximum) {
    const buffer = Buffer.alloc(Math.min(65536, maximum + 1 - total));
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
    if (bytesRead === 0)
      return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks, total));
    total += bytesRead;
    if (total > maximum) throw new Error('Git mount metadata exceeds limit');
    chunks.push(buffer.subarray(0, bytesRead));
  }
  throw new Error('Git mount metadata exceeds limit');
}

/** Accept only a unique read-only common Git mount with ordinary directories. */
export async function validatedReadonlyGitObjects(workspace, mountinfo) {
  if (
    typeof workspace !== 'string' ||
    !path.isAbsolute(workspace) ||
    path.resolve(workspace) !== workspace ||
    typeof mountinfo !== 'string' ||
    Buffer.byteLength(mountinfo) > 1024 * 1024
  )
    throw new Error('Invalid Git mount input');
  const common = path.join(workspace, '.git-common');
  const objects = path.join(common, 'objects');
  for (const entry of [workspace, common, objects]) {
    const stat = await lstat(entry);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Invalid Git mount path');
  }
  const rows = mountinfo.split('\n').map((line) => line.split(' '));
  const commonMounts = rows.filter((fields) => fields[4] === common);
  if (commonMounts.length !== 1) throw new Error('Git mount is missing or ambiguous');
  const relevant = rows.filter(
    (fields) => fields[4] === objects || fields[4]?.startsWith(objects + '/'),
  );
  for (const fields of [...commonMounts, ...relevant]) {
    const options = fields[5]?.split(',') ?? [];
    if (
      fields.length < 10 ||
      fields.indexOf('-') < 6 ||
      !options.includes('ro') ||
      options.includes('rw')
    )
      throw new Error('Git mount must be read-only');
  }
  const pending = [objects];
  let entries = 0;
  while (pending.length > 0) {
    const directory = pending.pop();
    if (directory === undefined) throw new Error('Invalid Git object store');
    for await (const item of await opendir(directory)) {
      const name = item.name;
      entries += 1;
      if (entries > 100000) throw new Error('Git object store exceeds limit');
      const entry = path.join(directory, name);
      if (
        directory === path.join(objects, 'info') &&
        ['alternates', 'http-alternates'].includes(name)
      )
        throw new Error('Git alternate object stores are forbidden');
      const stat = await lstat(entry);
      if (stat.isSymbolicLink()) throw new Error('Git object store symlink is forbidden');
      if (stat.isDirectory()) pending.push(entry);
      else if (!stat.isFile()) throw new Error('Invalid Git object store entry');
    }
  }
  return objects;
}
