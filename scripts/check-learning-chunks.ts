/** Vite manifestの静的import graphから、mobile学習画面とEditor/Runnerの配信境界を検証する。 */
import { lstat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

interface ManifestChunk {
  readonly file: string;
  readonly imports: readonly string[];
  readonly dynamicImports: readonly string[];
}

interface LearningChunkOptions {
  readonly manifest: unknown;
  readonly readAsset: (file: string) => Promise<string>;
}

const entryKey = 'index.html';
const editableKey = 'src/features/learning/pages/EditableExercisePage.tsx';
const workspaceKey = 'src/features/learning/editor/CodeWorkspace.tsx';
const runnerKey = 'src/adapters/runtime/html-css/index.ts';
const requiredKeys = [entryKey, editableKey, workspaceKey, runnerKey] as const;

/** unknown値を安全にproperty検査できるObjectへ絞り込む。 */
function isUnknownRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** unknown値がstringだけの配列であることをruntimeで確認する。 */
function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item: unknown) => typeof item === 'string');
}

/** 静的graph検査に必要なmanifest最小構造をfail-closedで読み取る。 */
function parseManifest(value: unknown): Readonly<Record<string, ManifestChunk>> {
  if (!isUnknownRecord(value)) throw new Error('Vite manifestがObjectではありません');

  const manifest: Record<string, ManifestChunk> = {};
  for (const [key, candidate] of Object.entries(value)) {
    if (!isUnknownRecord(candidate) || typeof candidate.file !== 'string') {
      throw new Error(`Vite manifestのfileが文字列ではありません: ${key}`);
    }
    if (candidate.imports !== undefined && !isStringArray(candidate.imports)) {
      throw new Error(`Vite manifestのimportsが文字列配列ではありません: ${key}`);
    }
    if (candidate.dynamicImports !== undefined && !isStringArray(candidate.dynamicImports)) {
      throw new Error(`Vite manifestのdynamicImportsが文字列配列ではありません: ${key}`);
    }
    manifest[key] = {
      file: candidate.file,
      imports: isStringArray(candidate.imports) ? candidate.imports : [],
      dynamicImports: isStringArray(candidate.dynamicImports) ? candidate.dynamicImports : [],
    };
  }
  return manifest;
}

/** 複数rootから静的importsだけを辿り、欠落参照を含めて検証済み集合を返す。 */
function collectStaticGraph(
  manifest: Readonly<Record<string, ManifestChunk>>,
  roots: readonly string[],
): ReadonlySet<string> {
  const visited = new Set<string>();
  const visit = (key: string): void => {
    if (visited.has(key)) return;
    const chunk = manifest[key];
    if (chunk === undefined) throw new Error(`Vite manifest参照がありません: ${key}`);
    visited.add(key);
    for (const imported of chunk.imports) visit(imported);
  };
  for (const root of roots) visit(root);
  return visited;
}

/** source-level lazy importがmanifestでも動的edgeとして残っていることを保証する。 */
function assertDynamicEdge(
  manifest: Readonly<Record<string, ManifestChunk>>,
  owner: string,
  imported: string,
): void {
  if (!manifest[owner]?.dynamicImports.includes(imported)) {
    throw new Error(`遅延import境界が見つかりません: ${owner} -> ${imported}`);
  }
}

/** hash付きAsset名に依存せず、配信graphと生成物内markerからCodeMirror分離を検証する。 */
export async function assertLearningChunkIsolation(options: LearningChunkOptions): Promise<void> {
  const manifest = parseManifest(options.manifest);
  for (const key of requiredKeys) {
    if (manifest[key] === undefined) {
      throw new Error(`Vite manifest entryが見つかりません: ${key}`);
    }
  }

  assertDynamicEdge(manifest, entryKey, editableKey);
  assertDynamicEdge(manifest, entryKey, runnerKey);
  assertDynamicEdge(manifest, editableKey, workspaceKey);

  const mobileGraph = collectStaticGraph(manifest, [entryKey]);
  const forbiddenMobileChunks = [editableKey, workspaceKey, runnerKey].filter((key) =>
    mobileGraph.has(key),
  );
  if (forbiddenMobileChunks.length > 0) {
    throw new Error(
      `mobile静的graphへ編集専用chunkが混入しています: ${forbiddenMobileChunks.join(', ')}`,
    );
  }

  const editorGraph = collectStaticGraph(manifest, [editableKey]);
  const runnerGraph = collectStaticGraph(manifest, [runnerKey]);
  const sharedCandidates = [...editorGraph].filter(
    (key) => runnerGraph.has(key) && !mobileGraph.has(key),
  );
  const markerResults = await Promise.all(
    sharedCandidates.map(async (key) => {
      const source = await options.readAsset(manifest[key]!.file);
      return /(?:EditorView|EditorState|cm-content)/u.test(source);
    }),
  );
  if (!markerResults.some(Boolean)) {
    throw new Error('EditorとRunnerが共有するCodeMirror chunkが見つかりません');
  }
}

/** dist外参照とSymlinkを拒否し、manifestが指す通常Assetだけを読む。 */
async function readDistAsset(distRoot: string, relativePath: string): Promise<string> {
  const normalized = path.posix.normalize(relativePath);
  if (
    normalized !== relativePath ||
    normalized.startsWith('../') ||
    path.posix.isAbsolute(normalized) ||
    relativePath.includes('\\')
  ) {
    throw new Error(`Vite Asset pathが安全な相対Pathではありません: ${relativePath}`);
  }
  const absolutePath = path.join(distRoot, ...normalized.split('/'));
  const file = await lstat(absolutePath);
  if (!file.isFile() || file.isSymbolicLink()) {
    throw new Error(`Vite Assetが通常Fileではありません: ${relativePath}`);
  }
  return readFile(absolutePath, 'utf8');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const distRoot = path.resolve('dist');
  const manifest = JSON.parse(
    await readFile(path.join(distRoot, '.vite/manifest.json'), 'utf8'),
  ) as unknown;
  await assertLearningChunkIsolation({
    manifest,
    readAsset: (file) => readDistAsset(distRoot, file),
  });
  console.log('Learning chunk isolation: PASS');
}
