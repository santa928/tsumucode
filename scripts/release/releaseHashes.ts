import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { canonicalJson } from '../../src/core/persistence/canonicalJson';

const execFileAsync = promisify(execFile);

export const SYNTHETIC_PROGRESS_BUNDLE_PATH =
  'tests/fixtures/progress/previous-release-bundle.json';

export interface TreeHashEntry {
  readonly path: string;
  readonly sha256: string;
  readonly bytes: number;
}

export interface ArtifactHashes {
  readonly artifactDigest: string;
  readonly courseHash: string;
  readonly provenanceHash: string;
  readonly visualBaselineHash: string;
}

/** byte列をSHA-256 lower hexへ変換する。 */
export function sha256Bytes(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** UTF-8 textをSHA-256 lower hexへ変換する。 */
export function sha256Text(value: string): string {
  return sha256Bytes(new TextEncoder().encode(value));
}

/** 単一Fileのbyte内容をSHA-256 lower hexへ変換する。 */
export async function hashFile(filePath: string): Promise<string> {
  const stats = await lstat(filePath);
  if (stats.isSymbolicLink() || !stats.isFile()) {
    throw new Error(`hash対象は通常Fileである必要があります: ${filePath}`);
  }
  return sha256Bytes(await readFile(filePath));
}

/** 通常FileだけのDirectory treeをsymlinkなしで相対Path順に列挙する。 */
async function listTree(root: string, directory = root): Promise<readonly string[]> {
  const entries = (await readdir(directory, { withFileTypes: true })).sort((left, right) =>
    left.name.localeCompare(right.name),
  );
  const files: string[] = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`hash対象へSymbolic Linkを含められません: ${path.relative(root, absolute)}`);
    }
    if (entry.isDirectory()) {
      files.push(...(await listTree(root, absolute)));
      continue;
    }
    if (!entry.isFile()) {
      throw new Error(`hash対象へ特殊Fileを含められません: ${path.relative(root, absolute)}`);
    }
    files.push(absolute);
  }
  return files;
}

/** 相対Pathと内容hashをともに固定するcanonical tree SHA-256を返す。 */
export async function hashDirectory(rootDirectory: string): Promise<string> {
  const root = path.resolve(rootDirectory);
  const files = await listTree(root);
  const entries: TreeHashEntry[] = [];
  for (const file of files) {
    const bytes = await readFile(file);
    entries.push({
      path: path.relative(root, file).split(path.sep).join('/'),
      sha256: sha256Bytes(bytes),
      bytes: bytes.byteLength,
    });
  }
  return sha256Text(canonicalJson(entries));
}

/** candidate treeから意図的に除外する手動記録・計画・台帳かを判定する。 */
function isCandidateTreeExcluded(relative: string): boolean {
  return (
    relative.startsWith('docs/superpowers/') ||
    relative.startsWith('docs/quality/') ||
    relative === 'content/html-css/release-history.yaml'
  );
}

/** Git追跡対象Product treeを、除外規則とFile内容の両方を含めてhashする。 */
export async function hashReleaseCandidateTree(
  repositoryRoot: string,
  fileOverrides: ReadonlyMap<string, Uint8Array> = new Map(),
): Promise<string> {
  const root = path.resolve(repositoryRoot);
  const { stdout } = await execFileAsync('git', ['ls-files', '-z'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  const tracked = stdout
    .split('\0')
    .filter((relative) => relative !== '' && !isCandidateTreeExcluded(relative))
    .sort((left, right) => left.localeCompare(right));
  const unusedOverrides = new Set(fileOverrides.keys());
  const entries: TreeHashEntry[] = [];
  for (const relative of tracked) {
    const absolute = path.resolve(root, relative);
    if (!absolute.startsWith(`${root}${path.sep}`)) {
      throw new Error(`追跡FileがRepository外を指しています: ${relative}`);
    }
    const stats = await lstat(absolute);
    if (stats.isSymbolicLink() || !stats.isFile()) {
      throw new Error(`candidate treeは通常Fileだけを許可します: ${relative}`);
    }
    const overridden = fileOverrides.get(relative);
    const bytes = overridden ?? (await readFile(absolute));
    unusedOverrides.delete(relative);
    entries.push({ path: relative, sha256: sha256Bytes(bytes), bytes: bytes.byteLength });
  }
  if (unusedOverrides.size > 0) {
    throw new Error(
      `candidate tree overrideが追跡Productを指していません: ${[...unusedOverrides].join(', ')}`,
    );
  }
  return sha256Text(canonicalJson(entries));
}

/** 永続IDの集合と並びをASCII順で正規化しhashする。 */
export function hashPersistentIds(ids: readonly string[]): string {
  const unique = [...new Set(ids)].sort((left, right) => left.localeCompare(right));
  if (unique.length !== ids.length) throw new Error('永続IDが重複しています');
  return sha256Text(canonicalJson(unique));
}

/** Production Artifactと公開Manifest、Visual baselineの実測hashを返す。 */
export async function calculateArtifactHashes(
  repositoryRoot: string,
  distDirectory = 'dist',
): Promise<ArtifactHashes> {
  const root = path.resolve(repositoryRoot);
  const dist = path.resolve(root, distDirectory);
  const coursePath = path.join(dist, 'generated/content/courses/html-css.json');
  const provenancePath = path.join(dist, 'generated/content/courses/html-css.provenance.json');
  return {
    artifactDigest: await hashDirectory(dist),
    courseHash: sha256Bytes(await readFile(coursePath)),
    provenanceHash: sha256Bytes(await readFile(provenancePath)),
    visualBaselineHash: await hashDirectory(
      path.join(root, 'tests/e2e/visual-regression.spec.ts-snapshots'),
    ),
  };
}
