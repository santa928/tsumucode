/** Production CSSと極小Mode entryを生成HTMLへinline化する。 */
import { lstat, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

interface InlineProductionCssOptions {
  readonly distRoot: string;
}

interface ViteManifestChunk {
  readonly file?: unknown;
  readonly imports?: unknown;
}

type SlideImagePreloads = Readonly<Record<string, string>>;

const libraryEntryKey = 'src/app/libraryEntry.tsx';
const normalLearningEntryKey = 'src/app/normalLearningEntry.tsx';

/** unknown値をJSON Objectへ安全に絞り込む。 */
function isUnknownRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 必須Array fieldを検証済みObjectから取得する。 */
function requiredArray(
  source: Readonly<Record<string, unknown>>,
  key: string,
  label: string,
): readonly unknown[] {
  const value = source[key];
  if (!Array.isArray(value)) throw new Error(`${label}がArrayではありません`);
  return value;
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

/** Catalogが参照するCourse Manifest pathをcanonicalな公開Pathへ絞る。 */
function courseManifestPath(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^generated\/content\/courses\/[A-Za-z0-9._-]+\.json$/u.test(value)
  ) {
    throw new Error(`Course Manifest pathがcanonicalではありません: ${String(value)}`);
  }
  return value;
}

/** Slide Image pathをcanonicalな公開Asset Pathへ絞る。 */
function slideImagePath(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^generated\/content\/assets\/(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+\.(?:avif|gif|jpe?g|png|svg|webp)$/u.test(
      value,
    ) ||
    value.split('/').some((segment) => segment === '.' || segment === '..')
  ) {
    throw new Error(`Slide Image pathがcanonicalではありません: ${String(value)}`);
  }
  return value;
}

/** Hash Routeへ埋め込める永続IDだけを許可する。 */
function routeEntityId(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9._-]+$/u.test(value)) {
    throw new Error(`${label}がcanonicalではありません: ${String(value)}`);
  }
  return value;
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

/** Course JSONから各Slideの最初のImage AssetをRoute keyへ収集する。 */
async function collectCourseSlideImagePreloads(
  distRoot: string,
  manifestPath: string,
  target: Record<string, string>,
): Promise<void> {
  await assertRegularDistFile(distRoot, manifestPath, 'Course Manifest');
  const courseSource = JSON.parse(
    await readFile(path.join(distRoot, ...manifestPath.split('/')), 'utf8'),
  ) as unknown;
  if (!isUnknownRecord(courseSource)) throw new Error('Course ManifestがObjectではありません');
  const courseId = routeEntityId(courseSource.id, 'Course ID');

  for (const phaseValue of requiredArray(courseSource, 'phases', 'Course phases')) {
    if (!isUnknownRecord(phaseValue)) throw new Error('Course phaseがObjectではありません');
    for (const chapterValue of requiredArray(phaseValue, 'chapters', 'Phase chapters')) {
      if (!isUnknownRecord(chapterValue)) throw new Error('Course chapterがObjectではありません');
      for (const lessonValue of requiredArray(chapterValue, 'lessons', 'Chapter lessons')) {
        if (!isUnknownRecord(lessonValue)) throw new Error('Course lessonがObjectではありません');
        const lessonId = routeEntityId(lessonValue.id, 'Lesson ID');
        for (const slideValue of requiredArray(lessonValue, 'slides', 'Lesson slides')) {
          if (!isUnknownRecord(slideValue)) throw new Error('Course slideがObjectではありません');
          const imageBlock = requiredArray(slideValue, 'blocks', 'Slide blocks').find(
            (block) => isUnknownRecord(block) && block.type === 'image',
          );
          if (!isUnknownRecord(imageBlock)) continue;
          const assetId = routeEntityId(imageBlock.assetId, 'Slide Asset ID');
          const assetMatches = requiredArray(slideValue, 'assets', 'Slide assets').filter(
            (asset) => isUnknownRecord(asset) && asset.id === assetId,
          );
          if (assetMatches.length !== 1 || !isUnknownRecord(assetMatches[0])) {
            throw new Error(`Slide Image Assetを一意に解決できません: ${assetId}`);
          }
          const asset = assetMatches[0];
          if (asset.mediaType !== 'image') {
            throw new Error(`Slide AssetがImageではありません: ${assetId}`);
          }
          const imagePath = slideImagePath(asset.path);
          await assertRegularDistFile(distRoot, imagePath, 'Slide Image');
          const slideId = routeEntityId(slideValue.id, 'Slide ID');
          const routeKey = `${courseId}/${lessonId}/${slideId}`;
          if (target[routeKey] !== undefined) {
            throw new Error(`Slide Image preload keyが重複しています: ${routeKey}`);
          }
          target[routeKey] = imagePath;
        }
      }
    }
  }
}

/** Catalog内の全Courseから直リンク用の最初のSlide Image Mapを生成する。 */
async function slideImagePreloads(distRoot: string): Promise<SlideImagePreloads> {
  const catalogPath = 'generated/content/catalog.json';
  await assertRegularDistFile(distRoot, catalogPath, 'Course Catalog');
  const catalogSource = JSON.parse(
    await readFile(path.join(distRoot, ...catalogPath.split('/')), 'utf8'),
  ) as unknown;
  if (!isUnknownRecord(catalogSource)) throw new Error('Course CatalogがObjectではありません');
  const preloads: Record<string, string> = {};
  for (const entryValue of requiredArray(catalogSource, 'courses', 'Catalog courses')) {
    if (!isUnknownRecord(entryValue)) throw new Error('Catalog courseがObjectではありません');
    if (entryValue.publicationStatus !== 'published') continue;
    await collectCourseSlideImagePreloads(
      distRoot,
      courseManifestPath(entryValue.manifestPath),
      preloads,
    );
  }
  return preloads;
}

/** 初期Slide Routeの最初のImageだけをCritical CSSより先に先読みする。 */
function slideImagePreloadBootstrap(imagePreloads: SlideImagePreloads): string {
  return `<script data-tsumucode-slide-image>(()=>{const images=${JSON.stringify(imagePreloads)};const route=location.hash.match(/^#\\/(?:library\\/([^/]+)|courses\\/([^/]+))\\/lessons\\/([^/]+)\\/slides\\/([^/?#]+)/);const image=route?images[\`\${route[1]||route[2]}/\${route[3]}/\${route[4]}\`]:undefined;if(image){const imageLink=document.createElement('link');imageLink.rel='preload';imageLink.as='image';imageLink.fetchPriority='low';imageLink.href=new URL(image,document.baseURI).href;document.head.append(imageLink)}})();</script>`;
}

/** 初期Hashに一致するMode closureだけを先読みし、対応entryを1回実行する。 */
function modeEntryBootstrap(assets: {
  readonly library: readonly string[];
  readonly normalLearning: readonly string[];
}): string {
  return `<script data-tsumucode-entry>(()=>{const files=/^#\\/library(?:\\/|$)/.test(location.hash)?${JSON.stringify(assets.library)}:${JSON.stringify(assets.normalLearning)};for(const file of files){const link=document.createElement('link');link.rel='modulepreload';link.crossOrigin='anonymous';link.href=new URL(file,document.baseURI).href;document.head.append(link)}const entry=document.createElement('script');entry.type='module';entry.src=new URL(files[0],document.baseURI).href;document.head.append(entry)})();</script>`;
}

/**
 * 単一CSSと初期Mode選択entryをHTMLへinline化する。
 * 遅延Chunk用Assetとmanifest参照は維持し、Subpath検査と再利用を可能にする。
 */
export async function inlineProductionCss(options: InlineProductionCssOptions): Promise<void> {
  const indexPath = path.join(options.distRoot, 'index.html');
  const manifestPath = path.join(options.distRoot, '.vite/manifest.json');
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
  for (const assetPath of new Set([...modeAssets.library, ...modeAssets.normalLearning])) {
    await assertRegularDistFile(options.distRoot, assetPath, 'Vite Mode Asset');
  }
  const imagePreloads = await slideImagePreloads(options.distRoot);

  const imageBootstrap = slideImagePreloadBootstrap(imagePreloads);
  const imageOptimizedHtml = html.replace(/<head>/iu, `<head>${imageBootstrap}`);
  if (!imageOptimizedHtml.includes('data-tsumucode-slide-image')) {
    throw new Error('Slide Image preload bootstrapの挿入先がありません');
  }
  const inlinedHtml = imageOptimizedHtml.replace(
    stylesheetTag,
    `<style data-tsumucode-critical-css>${css}</style>`,
  );
  const bootstrap = modeEntryBootstrap(modeAssets);
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
