/** Production CSSと極小Mode entryを生成HTMLへinline化する。 */
import { lstat, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolvePublicAsset } from '../src/shared/lib/resolvePublicAsset.ts';

interface InlineProductionCssOptions {
  readonly distRoot: string;
}

interface ViteManifestChunk {
  readonly file?: unknown;
  readonly imports?: unknown;
}

const libraryEntryKey = 'src/app/libraryEntry.tsx';
const normalLearningEntryKey = 'src/app/normalLearningEntry.tsx';
const courseIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const contentCatalogPath = 'generated/content/catalog-v3.json';

interface CoursePreloadRoute {
  readonly courseId: string;
  readonly indexPath: string;
  readonly lessons: readonly (readonly [string, string])[];
}

/** unknown値をJSON Objectへ安全に絞り込む。 */
function isUnknownRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** dist配下の通常FileだけをBuild入力として許可する。 */
async function assertRegularDistFile(
  distRoot: string,
  relativePath: string,
  label: string,
): Promise<void> {
  const file = await lstat(path.join(distRoot, ...relativePath.split('/')));
  if (!file.isFile() || file.isSymbolicLink()) {
    throw new Error(`${label}が通常Fileではありません: ${relativePath}`);
  }
}

/** Vite stylesheet URLをdist配下のcanonical Asset pathへ変換する。 */
function stylesheetAssetPath(href: string): string {
  const pathname = new URL(href, 'https://tsumucode.invalid/').pathname;
  const marker = '/assets/';
  const markerIndex = pathname.lastIndexOf(marker);
  if (markerIndex < 0) throw new Error(`Production CSSがassets配下ではありません: ${href}`);
  const relativePath = pathname.slice(markerIndex + 1);
  if (!/^assets\/[A-Za-z0-9._-]+\.css$/u.test(relativePath)) {
    throw new Error(`Production CSS pathがcanonicalではありません: ${href}`);
  }
  return relativePath;
}

/** Manifest chunkのcanonical JavaScript Asset pathを取得する。 */
function manifestJavaScriptAssetPath(chunk: ViteManifestChunk, key: string): string {
  if (typeof chunk.file !== 'string') {
    throw new Error(`Vite manifest chunk fileがありません: ${key}`);
  }
  if (!/^assets\/[A-Za-z0-9._-]+\.js$/u.test(chunk.file)) {
    throw new Error(`Vite JavaScript chunk pathがcanonicalではありません: ${chunk.file}`);
  }
  return chunk.file;
}

/** 指定Mode entryから静的import closureをroot優先順で収集する。 */
function collectModeAssetPaths(
  manifest: Readonly<Record<string, unknown>>,
  rootKey: string,
): readonly string[] {
  if (!isUnknownRecord(manifest[rootKey]))
    throw new Error(`Vite Mode entryがありません: ${rootKey}`);
  const visited = new Set<string>();
  const files: string[] = [];
  const visit = (key: string): void => {
    if (visited.has(key)) return;
    if (key === 'index.html') {
      throw new Error(`Mode graphがBootstrap entryを参照しています: ${rootKey}`);
    }
    const chunk = manifest[key];
    if (!isUnknownRecord(chunk)) throw new Error(`Vite manifest参照がありません: ${key}`);
    visited.add(key);
    files.push(manifestJavaScriptAssetPath(chunk, key));
    if (chunk.imports === undefined) return;
    if (
      !Array.isArray(chunk.imports) ||
      !chunk.imports.every((value) => typeof value === 'string')
    ) {
      throw new Error(`Vite manifest importsが文字列配列ではありません: ${key}`);
    }
    for (const importedKey of chunk.imports) visit(importedKey);
  };
  visit(rootKey);
  return files;
}

/** Manifestから通常学習・Libraryそれぞれの静的Asset closureを取得する。 */
function modeAssetPaths(manifestSource: string): {
  readonly library: readonly string[];
  readonly normalLearning: readonly string[];
} {
  const manifest = JSON.parse(manifestSource) as unknown;
  if (!isUnknownRecord(manifest)) throw new Error('Vite manifestがObjectではありません');
  return {
    library: collectModeAssetPaths(manifest, libraryEntryKey),
    normalLearning: collectModeAssetPaths(manifest, normalLearningEntryKey),
  };
}

/** 公開pathをcanonical相対pathへ変換し、期待する完全pathと一致することを確認する。 */
function canonicalContentPath(value: unknown, expected: string, label: string): string {
  if (typeof value !== 'string') throw new Error(`${label}がありません`);
  const canonicalPath = resolvePublicAsset('/', value).slice(1);
  if (canonicalPath !== value || canonicalPath !== expected) {
    throw new Error(`${label}がcanonicalではありません: ${value}`);
  }
  return canonicalPath;
}

/** Course Index最小構造からLesson IDと公開Manifest pathを重複なく取得する。 */
function lessonPreloadPaths(
  indexSource: string,
  courseId: string,
): readonly (readonly [string, string])[] {
  const index = JSON.parse(indexSource) as unknown;
  if (
    !isUnknownRecord(index) ||
    index.schemaVersion !== 1 ||
    index.id !== courseId ||
    !Array.isArray(index.phases)
  ) {
    throw new Error(`公開Course Indexの最小構造が不正です: ${courseId}`);
  }
  const lessons: (readonly [string, string])[] = [];
  const lessonIds = new Set<string>();
  for (const phase of index.phases) {
    if (!isUnknownRecord(phase) || !Array.isArray(phase.chapters)) {
      throw new Error(`公開Course IndexのPhaseが不正です: ${courseId}`);
    }
    for (const chapter of phase.chapters) {
      if (!isUnknownRecord(chapter) || !Array.isArray(chapter.lessons)) {
        throw new Error(`公開Course IndexのChapterが不正です: ${courseId}`);
      }
      for (const lesson of chapter.lessons) {
        if (
          !isUnknownRecord(lesson) ||
          typeof lesson.id !== 'string' ||
          !courseIdPattern.test(lesson.id)
        ) {
          throw new Error(`公開Course IndexのLesson idがcanonicalではありません: ${courseId}`);
        }
        if (lessonIds.has(lesson.id)) {
          throw new Error(`公開Course IndexのLesson idが重複しています: ${lesson.id}`);
        }
        lessonIds.add(lesson.id);
        lessons.push([
          lesson.id,
          canonicalContentPath(
            lesson.manifestPath,
            `generated/content/courses/${courseId}/lessons/${lesson.id}.json`,
            `公開Lesson manifestPath: ${lesson.id}`,
          ),
        ]);
      }
    }
  }
  if (lessons.length === 0) throw new Error(`公開Course IndexにLessonがありません: ${courseId}`);
  return lessons;
}

/** 公開Catalog v3と各Indexから検証済みのRoute別先読み対応表を取得する。 */
async function coursePreloadRoutes(
  distRoot: string,
  catalogSource: string,
): Promise<readonly CoursePreloadRoute[]> {
  const catalog = JSON.parse(catalogSource) as unknown;
  if (!isUnknownRecord(catalog) || catalog.schemaVersion !== 3 || !Array.isArray(catalog.courses)) {
    throw new Error('公開Catalogのcoursesが配列ではありません');
  }

  const courseIds = new Set<string>();
  const routes: CoursePreloadRoute[] = [];
  for (const [index, course] of catalog.courses.entries()) {
    if (!isUnknownRecord(course)) {
      throw new Error(`公開CatalogのCourseがObjectではありません: ${String(index)}`);
    }
    if (typeof course.id !== 'string' || !courseIdPattern.test(course.id)) {
      throw new Error(`公開CatalogのCourse idがcanonicalではありません: ${String(course.id)}`);
    }
    if (courseIds.has(course.id)) {
      throw new Error(`公開CatalogのCourse idが重複しています: ${course.id}`);
    }
    const indexPath = canonicalContentPath(
      course.indexPath,
      `generated/content/courses/${course.id}/index.json`,
      `公開CatalogのCourse indexPath: ${course.id}`,
    );
    await assertRegularDistFile(distRoot, indexPath, '公開Course Index');
    const lessons = lessonPreloadPaths(
      await readFile(path.join(distRoot, ...indexPath.split('/')), 'utf8'),
      course.id,
    );
    for (const [, lessonPath] of lessons) {
      await assertRegularDistFile(distRoot, lessonPath, '公開Lesson Manifest');
    }
    courseIds.add(course.id);
    routes.push({ courseId: course.id, indexPath, lessons });
  }
  return routes;
}

/** 初期Hashに一致するMode closureだけを先読みし、対応entryを1回実行する。 */
function modeEntryBootstrap(
  assets: {
    readonly library: readonly string[];
    readonly normalLearning: readonly string[];
  },
  routes: readonly CoursePreloadRoute[],
): string {
  const id = '[a-z0-9]+(?:-[a-z0-9]+)*';
  const routePattern = `^#\\/(?:courses|library)\\/(${id})(?:\\/lessons\\/(${id})\\/(?:slides\\/${id}|exercises\\/${id}(?:\\/(?:completion|review\\/${id}))?))?$`;
  return `<script data-tsumucode-entry>(()=>{const match=new RegExp(${JSON.stringify(routePattern)}).exec(location.hash);const routes=${JSON.stringify(routes)};const route=match?routes.find(value=>value.courseId===match[1]):undefined;const preload=(file,key)=>{const link=document.createElement('link');link.rel='preload';link.as='fetch';link.crossOrigin='anonymous';link.dataset[key]='';link.href=new URL(file,document.baseURI).href;document.head.append(link)};if(route){preload(route.indexPath,'tsumucodeCourseIndexPreload');const lesson=match[2]?route.lessons.find(value=>value[0]===match[2]):undefined;if(lesson)preload(lesson[1],'tsumucodeLessonPreload')}const files=/^#\\/library(?:\\/|$)/.test(location.hash)?${JSON.stringify(assets.library)}:${JSON.stringify(assets.normalLearning)};for(const file of files){const link=document.createElement('link');link.rel='modulepreload';link.crossOrigin='anonymous';link.href=new URL(file,document.baseURI).href;document.head.append(link)}const entry=document.createElement('script');entry.type='module';entry.src=new URL(files[0],document.baseURI).href;document.head.append(entry)})();</script>`;
}

/**
 * 単一CSSと初期Mode選択entryをHTMLへinline化する。
 * 遅延Chunk用Assetとmanifest参照は維持し、Subpath検査と再利用を可能にする。
 */
export async function inlineProductionCss(options: InlineProductionCssOptions): Promise<void> {
  const indexPath = path.join(options.distRoot, 'index.html');
  const manifestPath = path.join(options.distRoot, '.vite/manifest.json');
  const catalogPath = path.join(options.distRoot, ...contentCatalogPath.split('/'));
  const html = await readFile(indexPath, 'utf8');
  const stylesheetTags = [...html.matchAll(/<link\b(?=[^>]*\brel=["']stylesheet["'])[^>]*>/giu)];
  if (stylesheetTags.length !== 1) {
    throw new Error(`Production stylesheetは1件必要です: ${String(stylesheetTags.length)}件`);
  }
  const stylesheetTag = stylesheetTags[0]?.[0];
  const href = stylesheetTag?.match(/\bhref=["']([^"']+)["']/iu)?.[1];
  if (stylesheetTag === undefined || href === undefined) {
    throw new Error('Production stylesheetのhrefがありません');
  }

  const cssPath = stylesheetAssetPath(href);
  const cssAbsolutePath = path.join(options.distRoot, ...cssPath.split('/'));
  const cssFile = await lstat(cssAbsolutePath);
  if (!cssFile.isFile() || cssFile.isSymbolicLink()) {
    throw new Error(`Production CSSが通常Fileではありません: ${cssPath}`);
  }
  const css = await readFile(cssAbsolutePath, 'utf8');
  if (/<\/style\b/iu.test(css)) {
    throw new Error('Production CSSへstyle終了Tagを含められません');
  }
  const moduleScriptTags = [
    ...html.matchAll(
      /<script\b(?=[^>]*\btype=["']module["'])(?=[^>]*\bsrc=["'][^"']+["'])[^>]*>\s*<\/script>/giu,
    ),
  ];
  if (moduleScriptTags.length > 1) {
    throw new Error(
      `Production module scriptは1件以下にしてください: ${String(moduleScriptTags.length)}件`,
    );
  }
  const moduleScriptTag = moduleScriptTags[0]?.[0];
  const modeAssets = modeAssetPaths(await readFile(manifestPath, 'utf8'));
  await assertRegularDistFile(options.distRoot, contentCatalogPath, '公開Catalog');
  const preloadRoutes = await coursePreloadRoutes(
    options.distRoot,
    await readFile(catalogPath, 'utf8'),
  );
  for (const assetPath of new Set([...modeAssets.library, ...modeAssets.normalLearning])) {
    await assertRegularDistFile(options.distRoot, assetPath, 'Vite Mode Asset');
  }
  const inlinedHtml = html.replace(
    stylesheetTag,
    `<style data-tsumucode-critical-css>${css}</style>`,
  );
  const bootstrap = modeEntryBootstrap(modeAssets, preloadRoutes);
  const optimizedHtml =
    moduleScriptTag === undefined
      ? inlinedHtml.replace(/<\/body>/iu, `${bootstrap}</body>`)
      : inlinedHtml.replace(moduleScriptTag, bootstrap);
  if (!optimizedHtml.includes('data-tsumucode-entry')) {
    throw new Error('Mode bootstrapの挿入先がありません');
  }

  await writeFile(indexPath, optimizedHtml, 'utf8');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await inlineProductionCss({ distRoot: path.resolve('dist') });
  console.log('Production CSS inline: PASS');
}
