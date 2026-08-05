// @vitest-environment node
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { assertSubpathBuild } from '../../scripts/smoke-subpath';
import { loadJavaScriptPerformanceManifest, loadPerformanceManifest } from './manifest';

interface ViteChunk {
  readonly file: string;
  readonly name?: string;
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
const javaScriptPerformanceManifest = await loadJavaScriptPerformanceManifest();
const starterResetBaselineCommit = '7e739754710138aa3433bfa085f7dd0479d9ca62';
const starterResetBaselineEditorIncrementalJavaScriptGzipBytes = 177_635;
const learningPathBaselineCommit = '98fde1bcbd290436b3298437567848fe33491059';
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

/** 任意のroot群から静的import closureのManifest keyを重複なく収集する。 */
function collectStaticChunkKeys(
  manifest: Readonly<Record<string, ViteChunk>>,
  roots: readonly string[],
): ReadonlySet<string> {
  const visited = new Set<string>();
  const visit = (key: string): void => {
    if (visited.has(key)) return;
    const chunk = manifest[key];
    if (chunk === undefined) throw new Error(`Vite manifest参照がありません: ${key}`);
    visited.add(key);
    for (const importedKey of chunk.imports ?? []) visit(importedKey);
  };
  for (const root of roots) visit(root);
  return visited;
}

/** Lazy RouterでHome初期表示時に並行読込するShell・Loader・Pageのrootを返す。 */
function homeInitialRootKeys(manifest: Readonly<Record<string, ViteChunk>>): readonly string[] {
  const entryKey = 'src/app/normalLearningEntry.tsx';
  if (manifest[entryKey]?.isEntry !== true) {
    throw new Error('Vite manifestに通常学習Entryがありません');
  }
  return [entryKey];
}

/** Router Lazy化前のEditor baselineと同じ通常学習共有root群を返す。 */
function preEditorSharedRootKeys(manifest: Readonly<Record<string, ViteChunk>>): readonly string[] {
  return homeInitialRootKeys(manifest);
}

/** 指定File群のgzip合計を返す。 */
async function totalGzipBytes(relativePaths: readonly string[]): Promise<number> {
  const buffers = await Promise.all(
    relativePaths.map((relativePath) => readFile(path.join(distRoot, relativePath))),
  );
  return buffers.reduce((total, source) => total + gzipSync(source).byteLength, 0);
}

/** Bundle予算超過時に原因を追えるよう、File別gzip bytesを大きい順で返す。 */
async function gzipBytesByFile(
  relativePaths: readonly string[],
): Promise<readonly { readonly file: string; readonly gzipBytes: number }[]> {
  const sizes = await Promise.all(
    relativePaths.map(async (file) => ({
      file,
      gzipBytes: gzipSync(await readFile(path.join(distRoot, file))).byteLength,
    })),
  );
  return sizes.sort((left, right) => right.gzipBytes - left.gzipBytes);
}

/** 指定File群の個別gzip bytes最大値を返す。 */
async function maximumGzipBytes(relativePaths: readonly string[]): Promise<number> {
  const sizes = await Promise.all(
    relativePaths.map(
      async (relativePath) =>
        gzipSync(await readFile(path.join(distRoot, relativePath))).byteLength,
    ),
  );
  return Math.max(0, ...sizes);
}

/** Inline bootstrapからRoute別先読み対応表のJSON sourceだけを取得する。 */
function extractRoutePreloadMapSource(indexHtml: string): string {
  const source = indexHtml.match(/const routes=(\[[\s\S]*?\]);const route=/u)?.[1];
  if (source === undefined) throw new Error('Route別先読み対応表がありません');
  JSON.parse(source);
  return source;
}

/** 現在のEditor増分JS gzipから固定したStarter復元前baselineを差し引く。 */
function calculateAddedJavaScriptGzipBytes(currentBytes: number): number {
  return currentBytes - starterResetBaselineEditorIncrementalJavaScriptGzipBytes;
}

/** 現在のHome初期JS gzipから固定baseline以後の純増だけを返す。 */
function calculateAddedHomeInitialJavaScriptGzipBytes(currentBytes: number): number {
  return Math.max(
    0,
    currentBytes - performanceManifest.slideLibrary.baselineHomeInitialJavaScriptGzipBytes,
  );
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
  it('Starter復元で追加したEditor増分JS gzipをbaselineとの差分として計算する', () => {
    expect(calculateAddedJavaScriptGzipBytes(178_641)).toBe(1_006);
  });

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
    const normalEntryKey = 'src/app/normalLearningEntry.tsx';
    const libraryEntryKey = 'src/app/libraryEntry.tsx';
    const normalEntry = viteManifest[normalEntryKey];
    const libraryEntry = viteManifest[libraryEntryKey];
    const transferServiceKey = 'src/core/persistence/transferService.ts';
    expect(viteManifest[transferServiceKey]).toBeDefined();
    const transferOwner = Object.values(viteManifest).find(({ dynamicImports }) =>
      dynamicImports?.includes(transferServiceKey),
    );
    expect(normalEntry?.isEntry).toBe(true);
    expect(libraryEntry?.isEntry).toBe(true);
    const normalGraph = collectStaticChunkKeys(viteManifest, [normalEntryKey]);
    expect(
      [...normalGraph].some((key) =>
        viteManifest[key]?.dynamicImports?.includes(
          'src/features/learning/pages/EditableExercisePage.tsx',
        ),
      ),
    ).toBe(true);
    expect(transferOwner?.dynamicImports).toContain(transferServiceKey);
    const homeKeys = collectStaticChunkKeys(viteManifest, homeInitialRootKeys(viteManifest));
    const initialJavaScript = [...homeKeys]
      .map((key) => viteManifest[key]!.file)
      .filter((file) => file.endsWith('.js'));

    const currentHomeInitialJavaScriptGzipBytes = await totalGzipBytes(initialJavaScript);
    expect(currentHomeInitialJavaScriptGzipBytes).toBeLessThanOrEqual(
      performanceManifest.bundle.homeInitialJavaScriptGzipMaxBytes,
    );
    expect(
      calculateAddedHomeInitialJavaScriptGzipBytes(currentHomeInitialJavaScriptGzipBytes),
    ).toBeLessThanOrEqual(performanceManifest.slideLibrary.addedHomeInitialJavaScriptGzipMaxBytes);
    expect(performanceManifest.learningPath.baselineCommit).toBe(learningPathBaselineCommit);
    expect(
      calculateAddedHomeInitialJavaScriptGzipBytes(currentHomeInitialJavaScriptGzipBytes),
    ).toBeLessThanOrEqual(performanceManifest.learningPath.addedHomeInitialJavaScriptGzipMaxBytes);
    // 値importを持たない軽量Registry名ではなく、Editor／実行本体の初期混入だけを拒否する。
    const forbiddenInitialChunk =
      /RunnerRegistry|ValidatorRegistry|CodeWorkspace|EditableExercisePage|codemirror/u;
    expect(
      [...homeKeys].flatMap((key) => {
        const file = viteManifest[key]!.file;
        return forbiddenInitialChunk.test(key) || forbiddenInitialChunk.test(file)
          ? [{ key, file }]
          : [];
      }),
    ).toEqual([]);
    expect(initialJavaScript).not.toEqual(
      expect.arrayContaining([
        expect.stringMatching(
          /CodeWorkspace|EditableExercisePage|prepareHtmlCssPreview|html-css-/u,
        ),
      ]),
    );
    const indexHtml = await readFile(path.join(distRoot, 'index.html'), 'utf8');
    expect(indexHtml).toContain('data-tsumucode-entry');
    expect(indexHtml).toContain('^#\\/library');
    expect(indexHtml).toContain(normalEntry?.file);
    expect(indexHtml).toContain(libraryEntry?.file);
    const basePath = process.env.BASE_PATH ?? '/repository-name/';
    const homeDocument = new JSDOM(indexHtml, {
      runScripts: 'dangerously',
      url: `https://example.test${basePath}#/`,
    }).window.document;
    expect(homeDocument.querySelector('link[data-tsumucode-course-index-preload]')).toBeNull();
    expect(homeDocument.querySelector('link[data-tsumucode-lesson-preload]')).toBeNull();

    const courseDocument = new JSDOM(indexHtml, {
      runScripts: 'dangerously',
      url: `https://example.test${basePath}#/courses/html-css`,
    }).window.document;
    expect(
      courseDocument.querySelector<HTMLLinkElement>('link[data-tsumucode-course-index-preload]')
        ?.href,
    ).toBe(
      new URL('generated/content/courses/html-css/index.json', `https://example.test${basePath}`)
        .href,
    );
    expect(courseDocument.querySelector('link[data-tsumucode-lesson-preload]')).toBeNull();

    const lessonDocument = new JSDOM(indexHtml, {
      runScripts: 'dangerously',
      url: `https://example.test${basePath}#/courses/html-css/lessons/html-css-ch00-l01/slides/html-css-ch00-l01-s01`,
    }).window.document;
    expect(
      lessonDocument.querySelector<HTMLLinkElement>('link[data-tsumucode-course-index-preload]')
        ?.href,
    ).toBe(
      new URL('generated/content/courses/html-css/index.json', `https://example.test${basePath}`)
        .href,
    );
    expect(
      lessonDocument.querySelector<HTMLLinkElement>('link[data-tsumucode-lesson-preload]')?.href,
    ).toBe(
      new URL(
        'generated/content/courses/html-css/lessons/html-css-ch00-l01.json',
        `https://example.test${basePath}`,
      ).href,
    );
    expect(gzipSync(extractRoutePreloadMapSource(indexHtml)).byteLength).toBeLessThanOrEqual(
      performanceManifest.content.routeMapAddedGzipMaxBytes,
    );
  });

  it('Editor増分JSをHome初期graphから分離して専用予算内に保つ', async () => {
    const viteManifest = (await readJsonObject('.vite/manifest.json')) as Readonly<
      Record<string, ViteChunk>
    >;
    const editableKey = 'src/features/learning/pages/EditableExercisePage.tsx';
    const workspaceKey = 'src/features/learning/editor/CodeWorkspace.tsx';
    const homeKeys = collectStaticChunkKeys(viteManifest, preEditorSharedRootKeys(viteManifest));
    const editorKeys = collectStaticChunkKeys(viteManifest, [editableKey, workspaceKey]);
    const incrementalJavaScript = [
      ...new Set(
        [...editorKeys]
          .filter((key) => !homeKeys.has(key))
          .map((key) => viteManifest[key]!.file)
          .filter((file) => file.endsWith('.js')),
      ),
    ];

    expect(incrementalJavaScript.length).toBeGreaterThan(0);
    expect(performanceManifest.bundle.baselineCommit).toBe(starterResetBaselineCommit);
    expect(performanceManifest.bundle.baselineEditorIncrementalJavaScriptGzipBytes).toBe(
      starterResetBaselineEditorIncrementalJavaScriptGzipBytes,
    );
    const currentIncrementalJavaScriptGzipBytes = await totalGzipBytes(incrementalJavaScript);
    expect(currentIncrementalJavaScriptGzipBytes).toBeLessThanOrEqual(
      performanceManifest.bundle.editorIncrementalJavaScriptGzipMaxBytes,
    );
    expect(
      calculateAddedJavaScriptGzipBytes(currentIncrementalJavaScriptGzipBytes),
    ).toBeLessThanOrEqual(performanceManifest.starterReset.addedJavaScriptGzipMaxBytes);
  });

  it('Home・Path・HTML SlideからJavaScript固有実装を分離し、Exercise増分を予算内に保つ', async () => {
    const viteManifest = (await readJsonObject('.vite/manifest.json')) as Readonly<
      Record<string, ViteChunk>
    >;
    const normalEntryKey = 'src/app/normalLearningEntry.tsx';
    const editableKey = 'src/features/learning/pages/EditableExercisePage.tsx';
    const workspaceKey = 'src/features/learning/editor/CodeWorkspace.tsx';
    const htmlCssRunnerKey = 'src/adapters/runtime/html-css/index.ts';
    const courseRuntimeKey = 'src/features/learning/javascriptRuntimeServices.ts';
    const javascriptRunnerKey = 'src/adapters/runtime/javascript/index.ts';
    const javascriptValidatorKey = 'src/adapters/validation/javascript/index.ts';
    const javascriptEditorKey = 'src/features/learning/editor/javascriptEditorLanguage.ts';
    const javascriptRoots = [
      courseRuntimeKey,
      javascriptRunnerKey,
      javascriptValidatorKey,
      javascriptEditorKey,
    ] as const;
    const existingExerciseRoots = [editableKey, workspaceKey, htmlCssRunnerKey] as const;
    for (const key of [...existingExerciseRoots, ...javascriptRoots]) {
      expect(viteManifest[key], key).toBeDefined();
    }

    const sharedRouteGraph = collectStaticChunkKeys(viteManifest, [normalEntryKey]);
    const forbiddenInitialMarkers =
      /(?:acorn|magic-string|JavaScriptAnalyzer|RuntimeConsole|consoleFormatter|adapters\/runtime\/javascript|adapters\/validation\/javascript|javascriptEditorLanguage)/u;
    expect(
      [...sharedRouteGraph].flatMap((key) => {
        const file = viteManifest[key]!.file;
        return forbiddenInitialMarkers.test(key) || forbiddenInitialMarkers.test(file)
          ? [{ key, file }]
          : [];
      }),
    ).toEqual([]);

    const existingExerciseGraph = collectStaticChunkKeys(viteManifest, existingExerciseRoots);
    const javascriptGraph = collectStaticChunkKeys(viteManifest, javascriptRoots);
    const incrementalJavaScript = [
      ...new Set(
        [...javascriptGraph]
          .filter((key) => !sharedRouteGraph.has(key) && !existingExerciseGraph.has(key))
          .map((key) => viteManifest[key]!.file)
          .filter((file) => file.endsWith('.js')),
      ),
    ];
    expect(incrementalJavaScript.length).toBeGreaterThan(0);
    const incrementalBreakdown = await gzipBytesByFile(incrementalJavaScript);
    expect(
      incrementalBreakdown.reduce((total, { gzipBytes }) => total + gzipBytes, 0),
      JSON.stringify(incrementalBreakdown),
    ).toBeLessThanOrEqual(javaScriptPerformanceManifest.bundle.incrementalJavaScriptGzipMaxBytes);
    await expect(
      totalGzipBytes(
        [...sharedRouteGraph]
          .map((key) => viteManifest[key]!.file)
          .filter((file) => file.endsWith('.js')),
      ),
    ).resolves.toBeLessThanOrEqual(
      javaScriptPerformanceManifest.bundle.homeInitialJavaScriptGzipMaxBytes,
    );
  });

  it('LibraryとRouter entryの静的graphから進捗Runtime・Editor・Runner・Validatorを除外する', async () => {
    const viteManifest = (await readJsonObject('.vite/manifest.json')) as Readonly<
      Record<string, ViteChunk>
    >;
    const libraryEntryKey = 'src/app/libraryEntry.tsx';
    const normalEntryKey = 'src/app/normalLearningEntry.tsx';
    const libraryKeys = collectStaticChunkKeys(viteManifest, [libraryEntryKey]);
    const forbiddenPattern =
      /normalLearningRouteModules|runtimeServices|features\/progress|core\/persistence|adapters\/persistence|CodeWorkspace|EditableExercisePage|adapters\/runtime|core\/validation/u;

    expect([...libraryKeys].filter((key) => forbiddenPattern.test(key))).toEqual([]);
    expect(libraryKeys.has(normalEntryKey)).toBe(false);
  });

  it('Catalog、Course Index、Lesson Manifest、Image、Fontを公開容量予算内に保つ', async () => {
    const files = await listFiles(distRoot);
    await expect(
      totalGzipBytes(['generated/content/catalog-v3.json']),
    ).resolves.toBeLessThanOrEqual(performanceManifest.content.catalogGzipMaxBytes);
    await expect(
      totalGzipBytes(['generated/content/courses/html-css/index.json']),
    ).resolves.toBeLessThanOrEqual(performanceManifest.content.courseIndexGzipMaxBytes);
    const lessonManifests = files.filter((file) =>
      /^generated\/content\/courses\/html-css\/lessons\/[^/]+\.json$/u.test(file),
    );
    expect(lessonManifests.length).toBeGreaterThan(0);
    await expect(maximumGzipBytes(lessonManifests)).resolves.toBeLessThanOrEqual(
      performanceManifest.content.lessonManifestGzipMaxBytes,
    );

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

  it('JavaScriptのCatalog、Course Index、Lesson Manifestを公開容量予算内に保つ', async () => {
    const files = await listFiles(distRoot);
    await expect(
      totalGzipBytes(['generated/content/catalog-v3.json']),
    ).resolves.toBeLessThanOrEqual(javaScriptPerformanceManifest.content.catalogGzipMaxBytes);
    await expect(
      totalGzipBytes(['generated/content/courses/javascript/index.json']),
    ).resolves.toBeLessThanOrEqual(javaScriptPerformanceManifest.content.courseIndexGzipMaxBytes);
    const lessonManifests = files.filter((file) =>
      /^generated\/content\/courses\/javascript\/lessons\/[^/]+\.json$/u.test(file),
    );
    expect(lessonManifests.length).toBeGreaterThan(0);
    await expect(maximumGzipBytes(lessonManifests)).resolves.toBeLessThanOrEqual(
      javaScriptPerformanceManifest.content.lessonManifestGzipMaxBytes,
    );
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
    const provenance = await readJsonObject('generated/content/courses/html-css/provenance.json');
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
