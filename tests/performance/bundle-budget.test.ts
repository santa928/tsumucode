// @vitest-environment node
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { assertSubpathBuild } from '../../scripts/smoke-subpath';
import { loadPerformanceManifest } from './manifest';

interface ViteChunk {
  readonly file: string;
  readonly isEntry?: boolean;
  readonly imports?: readonly string[];
  readonly dynamicImports?: readonly string[];
}

interface PublicProvenanceItem {
  readonly id: string;
  readonly path: string;
  readonly visibility: string;
}

const distRoot = path.resolve('dist');
const performanceManifest = await loadPerformanceManifest();
const imageExtensions = new Set(['.avif', '.gif', '.jpeg', '.jpg', '.png', '.svg', '.webp']);
const fontExtensions = new Set(['.otf', '.ttf', '.woff', '.woff2']);
const textExtensions = new Set(['.css', '.html', '.js', '.json', '.md', '.svg', '.txt', '.xml']);
const regularExpressionMetaCharacters = new Set('\\^$.*+?()[]{}|');

/** 任意文字列を正規表現内のliteralとして安全に扱えるSourceへ変換する。 */
function escapeRegularExpression(value: string): string {
  return Array.from(value)
    .map((character) =>
      regularExpressionMetaCharacters.has(character) ? `\\${character}` : character,
    )
    .join('');
}

/** Directoryを再帰し、rootからのPOSIX相対File pathを安定順で返す。 */
async function listFiles(root: string, directory = root): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) return listFiles(root, absolutePath);
      if (!entry.isFile()) return [];
      return [path.relative(root, absolutePath).split(path.sep).join('/')];
    }),
  );
  return files.flat().sort();
}

/** JSONをObjectとして読み、対象外の構造を明示的に拒否する。 */
async function readJsonObject(relativePath: string): Promise<Readonly<Record<string, unknown>>> {
  const value = JSON.parse(await readFile(path.join(distRoot, relativePath), 'utf8')) as unknown;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`JSON rootがObjectではありません: ${relativePath}`);
  }
  return value as Readonly<Record<string, unknown>>;
}

/** Vite manifestの初期Entryと静的importsだけを重複なく辿る。 */
function collectInitialChunks(manifest: Readonly<Record<string, ViteChunk>>): readonly ViteChunk[] {
  const entryKey = Object.entries(manifest).find(([, chunk]) => chunk.isEntry)?.[0];
  if (entryKey === undefined) throw new Error('Vite manifestにEntryがありません');

  const visited = new Set<string>();
  const chunks: ViteChunk[] = [];
  const visit = (key: string): void => {
    if (visited.has(key)) return;
    visited.add(key);
    const chunk = manifest[key];
    if (chunk === undefined) throw new Error(`Vite manifest参照がありません: ${key}`);
    chunks.push(chunk);
    for (const importedKey of chunk.imports ?? []) visit(importedKey);
  };
  visit(entryKey);
  return chunks;
}

/** 指定File群のgzip合計を返す。 */
async function totalGzipBytes(relativePaths: readonly string[]): Promise<number> {
  const buffers = await Promise.all(
    relativePaths.map((relativePath) => readFile(path.join(distRoot, relativePath))),
  );
  return buffers.reduce((total, source) => total + gzipSync(source).byteLength, 0);
}

/** 指定File群のraw bytesと最大File bytesを返す。 */
async function measureFiles(
  relativePaths: readonly string[],
): Promise<{ readonly maximum: number; readonly total: number }> {
  const sizes = await Promise.all(
    relativePaths.map(
      async (relativePath) => (await readFile(path.join(distRoot, relativePath))).byteLength,
    ),
  );
  return {
    maximum: Math.max(0, ...sizes),
    total: sizes.reduce((total, size) => total + size, 0),
  };
}

/** JSON treeにAuthoring専用fieldが含まれないことを再帰的に確認する。 */
function collectForbiddenJsonKeys(
  value: unknown,
  forbidden: ReadonlySet<string>,
  currentPath = '$',
): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      collectForbiddenJsonKeys(item, forbidden, `${currentPath}[${String(index)}]`),
    );
  }
  if (typeof value !== 'object' || value === null) return [];

  return Object.entries(value).flatMap(([key, child]) => [
    ...(forbidden.has(key) ? [`${currentPath}.${key}`] : []),
    ...collectForbiddenJsonKeys(child, forbidden, `${currentPath}.${key}`),
  ]);
}

describe('production bundle budget', () => {
  it('Home初期JSとSubpath Assetを同じVite manifestから検証する', async () => {
    await expect(
      assertSubpathBuild({
        distRoot,
        basePath: process.env.BASE_PATH ?? '/repository-name/',
        homeBudgetBytes: performanceManifest.bundle.homeInitialJavaScriptGzipMaxBytes,
      }),
    ).resolves.toBeUndefined();

    const viteManifest = (await readJsonObject('.vite/manifest.json')) as Readonly<
      Record<string, ViteChunk>
    >;
    const entry = Object.values(viteManifest).find(({ isEntry }) => isEntry);
    const transferServiceKey = 'src/core/persistence/transferService.ts';
    expect(viteManifest[transferServiceKey]).toBeDefined();
    expect(entry?.dynamicImports).toContain(transferServiceKey);
    const initialChunks = collectInitialChunks(viteManifest);
    const initialJavaScript = initialChunks
      .map(({ file }) => file)
      .filter((file) => file.endsWith('.js'));

    await expect(totalGzipBytes(initialJavaScript)).resolves.toBeLessThanOrEqual(
      performanceManifest.bundle.homeInitialJavaScriptGzipMaxBytes,
    );
    expect(initialJavaScript).not.toEqual(
      expect.arrayContaining([
        expect.stringMatching(
          /CodeWorkspace|EditableExercisePage|prepareHtmlCssPreview|html-css-/u,
        ),
      ]),
    );
  });

  it('Catalog、Course、Image、Fontを公開容量予算内に保つ', async () => {
    const files = await listFiles(distRoot);
    await expect(totalGzipBytes(['generated/content/catalog.json'])).resolves.toBeLessThanOrEqual(
      performanceManifest.content.catalogGzipMaxBytes,
    );
    await expect(
      totalGzipBytes(['generated/content/courses/html-css.json']),
    ).resolves.toBeLessThanOrEqual(performanceManifest.content.courseManifestGzipMaxBytes);

    const images = await measureFiles(
      files.filter((file) => imageExtensions.has(path.extname(file).toLowerCase())),
    );
    expect(images.maximum).toBeLessThanOrEqual(performanceManifest.content.singleImageMaxBytes);
    expect(images.total).toBeLessThanOrEqual(performanceManifest.content.totalImagesMaxBytes);

    const fonts = await measureFiles(
      files.filter((file) => fontExtensions.has(path.extname(file).toLowerCase())),
    );
    expect(fonts.maximum).toBeLessThanOrEqual(performanceManifest.content.singleFontMaxBytes);
    expect(fonts.total).toBeLessThanOrEqual(performanceManifest.content.totalFontsMaxBytes);
  });

  it('公開Text AssetへAuthoring専用fieldを含めない', async () => {
    const files = await listFiles(distRoot);
    const forbidden = new Set(performanceManifest.content.authoringFieldsForbidden);
    const serializedFieldPattern = new RegExp(
      `\\b(?:${[...forbidden].map(escapeRegularExpression).join('|')})\\s*:`,
      'u',
    );

    for (const file of files.filter((candidate) => textExtensions.has(path.extname(candidate)))) {
      const source = await readFile(path.join(distRoot, file), 'utf8');
      expect(source, `${file}にAuthoring専用fieldがあります`).not.toMatch(serializedFieldPattern);
      if (file.endsWith('.json')) {
        const value = JSON.parse(source) as unknown;
        expect(collectForbiddenJsonKeys(value, forbidden), file).toEqual([]);
      }
    }
  });

  it('公開Provenanceをpublic itemだけに限定する', async () => {
    const provenance = await readJsonObject('generated/content/courses/html-css.provenance.json');
    if (!Array.isArray(provenance.items)) {
      throw new Error('公開Provenanceにitems配列がありません');
    }
    const items = provenance.items as readonly PublicProvenanceItem[];
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(item.visibility, item.id).toBe('public');
      expect(item.id, item.id).not.toMatch(/solution|fixtures/u);
      expect(item.path, item.id).not.toMatch(/(?:^|\/)(?:solution|fixtures)(?:\/|$)/u);
    }
  });
});
