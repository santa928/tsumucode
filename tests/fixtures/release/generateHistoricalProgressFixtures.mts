/** 固定した f629fc6 の Git archive に含まれる旧教材・旧 Compiler だけで生成する。
 * 使い方: tsx generateHistoricalProgressFixtures.mts <旧 code> <旧 content> <一時出力先>
 * 生成物は保存互換の合成テスト入力であり、公開・学習受入の証拠ではない。
 * archive の作成と再生成後の比較は同ディレクトリの README.md を参照する。
 */
import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';

const [codeInput, contentInput, outputInput] = process.argv.slice(2);
if (!codeInput || !contentInput || !outputInput)
  throw Error('Expected baseline-code, baseline-content and output directories');
const codeRoot = path.resolve(codeInput);
const contentRoot = path.resolve(contentInput);
const outputRoot = path.resolve(outputInput);
const sourceCommit = 'f629fc6113fe398ad6cd74d16e2a2c0ca95872ff';
const { compileCourse } = await import(
  pathToFileURL(path.join(codeRoot, 'scripts/content/compileCourse.ts')).href
);
const { canonicalJson } = await import(
  pathToFileURL(path.join(codeRoot, 'src/core/persistence/canonicalJson.ts')).href
);
const sha256 = (bytes: Uint8Array | string): string =>
  createHash('sha256').update(bytes).digest('hex');

async function treeEntries(root: string, relative = ''): Promise<unknown[]> {
  const entries: unknown[] = [];
  const children = (await readdir(path.join(root, relative))).sort();
  for (const name of children) {
    const file = path.join(relative, name);
    const absolute = path.join(root, file);
    const stat = await lstat(absolute);
    if (stat.isSymbolicLink()) throw Error('Archived input must not contain symlinks: ' + file);
    if (stat.isDirectory()) entries.push(...(await treeEntries(root, file)));
    else if (stat.isFile()) {
      const bytes = await readFile(absolute);
      entries.push({
        path: file.split(path.sep).join('/'),
        bytes: bytes.length,
        sha256: sha256(bytes),
      });
    } else throw Error('Archived input must contain ordinary files: ' + file);
  }
  return entries;
}

const compilerEntries = [
  ...(await treeEntries(path.join(codeRoot, 'scripts'))).map((entry) => ({
    root: 'scripts',
    entry,
  })),
  ...(await treeEntries(path.join(codeRoot, 'src'))).map((entry) => ({ root: 'src', entry })),
];
const courses: Record<string, unknown> = {};
await mkdir(outputRoot, { recursive: true });
for (const [courseId, revision] of [
  ['python-basics', '2026-10-12.1'],
  ['react', '2026-10-07.7'],
] as const) {
  const courseRoot = path.join(contentRoot, 'content', courseId);
  const runtime = (await compileCourse(courseRoot)).runtime;
  if (runtime.id !== courseId || runtime.revision !== revision)
    throw Error('Archived course identity differs: ' + courseId);
  if (runtime.progressMigrations.some(({ steps }: { steps: unknown[] }) => steps.length !== 0))
    throw Error('Archived initial-publication contract has reset steps: ' + courseId);
  const runtimeBytes = Buffer.from(canonicalJson(runtime), 'utf8');
  if (runtimeBytes.length > 4 * 1024 * 1024) throw Error('Historical runtime exceeds reader bound');
  const compressed = gzipSync(runtimeBytes, { level: 9 });
  // gzip の日時と OS metadata を固定し、入力以外の差異を除く。
  compressed.writeUInt32LE(0, 4);
  compressed[9] = 255;
  await writeFile(path.join(outputRoot, courseId + '-f629fc6-progress.json.gz'), compressed);
  courses[courseId] = {
    revision,
    sourceContentSha256: sha256(canonicalJson(await treeEntries(courseRoot))),
    runtimeSha256: sha256(runtimeBytes),
    compressedSha256: sha256(compressed),
  };
}
await writeFile(
  path.join(outputRoot, 'historical-progress-manifest.json'),
  JSON.stringify(
    {
      schemaVersion: 1,
      purpose: 'historical-initial-publication-progress-only',
      sourceCommit,
      compilerSourceSha256: sha256(canonicalJson(compilerEntries)),
      courses,
    },
    null,
    2,
  ) + '\n',
);
