/** Production stylesheetをHTMLへ埋め込み、初回描画の追加requestを除去する。 */
import { lstat, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

interface InlineProductionCssOptions {
  readonly distRoot: string;
}

/** unknown値を安全に更新可能なObjectへ絞り込む。 */
function isUnknownRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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

/** Vite manifestからinline化済みCSS参照だけを除去する。 */
function removeCssFromManifest(manifest: unknown, cssPath: string): void {
  if (!isUnknownRecord(manifest)) throw new Error('Vite manifestがObjectではありません');
  for (const chunk of Object.values(manifest)) {
    if (!isUnknownRecord(chunk) || chunk.css === undefined) continue;
    if (!Array.isArray(chunk.css) || !chunk.css.every((item) => typeof item === 'string')) {
      throw new Error('Vite manifestのcssが文字列配列ではありません');
    }
    const remaining = chunk.css.filter((item) => item !== cssPath);
    if (remaining.length === 0) delete chunk.css;
    else chunk.css = remaining;
  }
}

/** 単一CSSをinline化し、HTML・manifest・Assetを一貫したBuild成果物へ更新する。 */
export async function inlineProductionCss(options: InlineProductionCssOptions): Promise<void> {
  const indexPath = path.join(options.distRoot, 'index.html');
  const manifestPath = path.join(options.distRoot, '.vite/manifest.json');
  const [html, manifestSource] = await Promise.all([
    readFile(indexPath, 'utf8'),
    readFile(manifestPath, 'utf8'),
  ]);
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

  const manifest = JSON.parse(manifestSource) as unknown;
  removeCssFromManifest(manifest, cssPath);
  const inlinedHtml = html.replace(
    stylesheetTag,
    `<style data-tsumucode-critical-css>${css}</style>`,
  );

  await Promise.all([
    writeFile(indexPath, inlinedHtml, 'utf8'),
    writeFile(manifestPath, `${JSON.stringify(manifest, undefined, 2)}\n`, 'utf8'),
  ]);
  await unlink(cssAbsolutePath);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await inlineProductionCss({ distRoot: path.resolve('dist') });
  console.log('Production CSS inline: PASS');
}
