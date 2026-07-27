import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ALLOWED_EXTENSIONS = new Set([
  '.html',
  '.css',
  '.js',
  '.json',
  '.woff2',
  '.svg',
  '.png',
  '.webp',
  '.avif',
  '.ico',
]);
const TEXT_EXTENSIONS = new Set(['.html', '.css', '.js', '.json', '.svg']);
const DEVELOPMENT_URL = /https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?/iu;
const DEVELOPMENT_URL_GLOBAL = /https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?/giu;
const REVIEWED_ROUTER_FALLBACK =
  /function [$\w]+\(e,t,n=!1\)\{let r=`http:\/\/localhost`;e&&\(r=e\.location\.origin===`null`\?e\.location\.href:e\.location\.origin\),[$\w]+\(r,`No window\.location\.\(origin\|href\) available to create URL`\);let i=typeof t==`string`\?t:[$\w]+\(t\);return i=i\.replace\(\/ \$\/,`%20`\),!n&&[$\w]+\.test\(i\)&&\(i=r\+i\),new URL\(i,r\)\}/gu;

/** React Routerの非通信URL組立fallback 1件だけをpinned entry chunkから除外する。 */
function withoutReviewedRouterFallback(relative: string, source: string): string {
  if (!/^assets\/(?:index|router)-[A-Za-z0-9_-]+\.js$/u.test(relative)) return source;
  const matches = [...source.matchAll(DEVELOPMENT_URL_GLOBAL)];
  if (matches.length !== 1) return source;
  if (matches[0]?.[0] !== 'http://localhost') return source;
  const fallbackMatches = [...source.matchAll(REVIEWED_ROUTER_FALLBACK)];
  if (fallbackMatches.length !== 1 || fallbackMatches[0]?.[0] === undefined) return source;

  return source.replace(fallbackMatches[0][0], 'reviewed-react-router-url-builder');
}

/** Directory symlinkを辿らず、Artifact内の通常Fileだけを列挙する。 */
async function collectFiles(root: string, directory = root): Promise<readonly string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      throw new Error(`Artifact内のSymbolic Linkは禁止です: ${path.relative(root, absolute)}`);
    }
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(root, absolute)));
      continue;
    }
    if (!entry.isFile()) {
      throw new Error(`Artifact内の特殊Fileは禁止です: ${path.relative(root, absolute)}`);
    }
    files.push(absolute);
  }

  return files;
}

/** Text Assetに開発URL、root直書きURL、authoring dataがないことを検証する。 */
function assertSafeText(relative: string, source: string): void {
  if (DEVELOPMENT_URL.test(withoutReviewedRouterFallback(relative, source))) {
    throw new Error(`開発URLが残っています: ${relative}`);
  }
  if (
    /(?:src|href)=["']\/assets\//u.test(source) ||
    source.includes('"/assets/') ||
    source.includes("'/assets/") ||
    /url\(\s*["']?\/assets\//u.test(source)
  ) {
    throw new Error(`BASE_PATH外のAsset URLがあります: ${relative}`);
  }
  if (/"(?:solutionFiles|fixtures)"\s*:/u.test(source)) {
    throw new Error(`Authoring専用dataが公開Artifactにあります: ${relative}`);
  }
  if (
    relative.endsWith('.provenance.json') &&
    (/"visibility"\s*:\s*"authoring"/u.test(source) ||
      /"(?:id|path)"\s*:\s*"[^"]*(?:solution|fixtures)/iu.test(source))
  ) {
    throw new Error(`Authoring Provenanceが公開Artifactにあります: ${relative}`);
  }
}

export interface StaticArtifactReport {
  readonly files: number;
}

/** Pages Artifactを再帰検査し、Server File、秘密、開発URL、Root Asset漏れを拒否する。 */
export async function checkStaticArtifact(distDir: string): Promise<StaticArtifactReport> {
  const root = path.resolve(distDir);
  const files = await collectFiles(root);

  for (const file of files) {
    const relative = path.relative(root, file).split(path.sep).join('/');
    const extension = path.extname(relative).toLowerCase();
    if (
      relative.startsWith('../') ||
      path.isAbsolute(relative) ||
      !ALLOWED_EXTENSIONS.has(extension) ||
      relative.endsWith('.map') ||
      /(^|\/)(?:\.env(?:\.|$)|server(?:\.|\/|$)|secret(?:\.|\/|$))/iu.test(relative)
    ) {
      throw new Error(`不許可Artifact: ${relative}`);
    }
    if (!TEXT_EXTENSIONS.has(extension)) continue;

    const source = await readFile(file, 'utf8');
    assertSafeText(relative, source);
  }

  await access(path.join(root, 'index.html'));
  await access(path.join(root, 'generated/content/courses/html-css.json'));

  return { files: files.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = await checkStaticArtifact(process.argv[2] ?? 'dist');
  console.log(`Static artifact OK: ${String(report.files)} files`);
}
