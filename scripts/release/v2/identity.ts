import { createHash } from 'node:crypto';
import { lstat, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { canonicalJson } from '../../../src/core/persistence/canonicalJson';

export function hashValue(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}
export function hashBytes(value: Uint8Array | string): string {
  return createHash('sha256').update(value).digest('hex');
}
export interface ArtifactFile {
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
}
export interface ArtifactIdentity {
  readonly digest: string;
  readonly files: readonly ArtifactFile[];
}

/** Hash the actual byte tree; never follow links or accept hidden host paths. */
export async function hashArtifact(directory: string): Promise<ArtifactIdentity> {
  const root = path.resolve(directory);
  const files: ArtifactFile[] = [];
  async function visit(absolute: string): Promise<void> {
    const stat = await lstat(absolute);
    if (stat.isSymbolicLink()) throw new Error('Artifact symlink is forbidden');
    if (stat.isDirectory()) {
      for (const child of (await readdir(absolute)).sort()) await visit(path.join(absolute, child));
    } else if (stat.isFile()) {
      const relative = path.relative(root, absolute).split(path.sep).join('/');
      if (
        !relative ||
        relative.startsWith('../') ||
        relative.includes('\\') ||
        Array.from(relative).some(
          (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
        )
      )
        throw new Error('Artifact path is not canonical');
      const bytes = await readFile(absolute);
      files.push({ path: relative, bytes: bytes.length, sha256: hashBytes(bytes) });
    } else throw new Error('Artifact must contain ordinary files only');
  }
  await visit(root);
  if (files.length === 0) throw new Error('Artifact is empty');
  return { digest: hashValue(files), files };
}
