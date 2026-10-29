import { createHash } from 'node:crypto';
import { lstat, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { canonicalJson } from '../../../src/core/persistence/canonicalJson';
import { z } from 'zod';
import { DigestSchema } from './schema';

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
export const ArtifactManifestSchema = z
  .object({
    digest: DigestSchema,
    files: z
      .array(
        z
          .object({
            path: z.string().min(1),
            bytes: z.number().int().nonnegative(),
            sha256: DigestSchema,
          })
          .strict(),
      )
      .min(1),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.digest !== hashValue(value.files) ||
      new Set(value.files.map(({ path }) => path)).size !== value.files.length
    )
      context.addIssue({ code: 'custom', message: 'Invalid public file closure' });
  });

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

/** Honor mounted worktree metadata only for the current workspace; isolate ordinary checkouts. */
export async function repositoryEnvironment(root: string): Promise<NodeJS.ProcessEnv> {
  const metadata = await lstat(path.join(root, '.git'));
  if (metadata.isDirectory()) {
    const ignored = new Set([
      'GIT_DIR',
      'GIT_WORK_TREE',
      'GIT_COMMON_DIR',
      'GIT_INDEX_FILE',
      'GIT_OBJECT_DIRECTORY',
      'GIT_ALTERNATE_OBJECT_DIRECTORIES',
      'GIT_NAMESPACE',
    ]);
    return Object.fromEntries(Object.entries(process.env).filter(([name]) => !ignored.has(name)));
  }
  if (!metadata.isFile() || path.resolve(root) !== path.resolve(process.cwd()))
    throw new Error('Unsupported or ambiguous repository metadata');
  return { ...process.env };
}
