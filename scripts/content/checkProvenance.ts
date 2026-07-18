import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parse } from 'yaml';
import { ProvenanceSourceSchema, type ProvenanceSource } from './sourceSchema';

export interface ProvenanceReport {
  readonly checkedFiles: number;
  readonly manifestItems: number;
}

const TRACKED_EXTENSIONS = new Set([
  '.yaml',
  '.yml',
  '.md',
  '.html',
  '.css',
  '.svg',
  '.png',
  '.webp',
  '.avif',
  '.woff2',
]);
const FORBIDDEN_DOMAINS = ['prog-8.com', 'progate.com'] as const;

/** 教材Sourceを再帰走査し、Provenance対象の通常FileをPOSIX相対pathで返す。 */
async function collectTrackedFiles(rootDir: string, relativeDirectory = ''): Promise<string[]> {
  const directory = relativeDirectory === '' ? rootDir : path.join(rootDir, relativeDirectory);
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const relativePath =
      relativeDirectory === '' ? entry.name : `${relativeDirectory}/${entry.name}`;
    if (entry.isDirectory()) {
      files.push(...(await collectTrackedFiles(rootDir, relativePath)));
      continue;
    }
    if (
      !entry.isFile() ||
      entry.name === 'provenance.yaml' ||
      !TRACKED_EXTENSIONS.has(path.extname(entry.name).toLowerCase())
    ) {
      continue;
    }
    files.push(relativePath);
  }
  return files.sort();
}

/** URLのhostが禁止Domain自身またはそのsubdomainかを返す。 */
function hasForbiddenDomain(sourceUrl: string): boolean {
  if (sourceUrl === 'none') return false;
  try {
    const hostname = new URL(sourceUrl).hostname.toLowerCase();
    return FORBIDDEN_DOMAINS.some(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
    );
  } catch {
    return FORBIDDEN_DOMAINS.some((domain) => sourceUrl.toLowerCase().includes(domain));
  }
}

/** defaults適用後のProvenance値を返す。 */
function effectiveItem(manifest: ProvenanceSource, item: ProvenanceSource['items'][number]) {
  return {
    ...item,
    method: item.method ?? manifest.defaults.method,
    createdAt: item.createdAt ?? manifest.defaults.createdAt,
    creator: item.creator ?? manifest.defaults.creator,
    sourceUrl: item.sourceUrl ?? manifest.defaults.sourceUrl,
    license: item.license ?? manifest.defaults.license,
    modified: item.modified ?? manifest.defaults.modified,
  };
}

/** Manifestに未登録・重複・禁止出典・公開解答がないことを検証する。 */
export async function checkProvenance(
  rootDir: string,
  manifestPath: string,
): Promise<ProvenanceReport> {
  const manifest = ProvenanceSourceSchema.parse(parse(await readFile(manifestPath, 'utf8')));
  const ids = new Set<string>();
  const paths = new Set<string>();

  for (const rawItem of manifest.items) {
    const item = effectiveItem(manifest, rawItem);
    if (ids.has(item.id)) throw new Error(`重複Provenance ID: ${item.id}`);
    if (paths.has(item.path)) throw new Error(`重複Provenance Path: ${item.path}`);
    ids.add(item.id);
    paths.add(item.path);

    const authoringOnly = item.path
      .split('/')
      .some((segment) => segment === 'solution' || segment === 'fixtures');
    if (authoringOnly && item.visibility !== 'authoring') {
      throw new Error(`Solution／Fixtureはauthoringへ分類してください: ${item.path}`);
    }
    if (hasForbiddenDomain(item.sourceUrl)) {
      throw new Error(`禁止DomainをProvenanceへ指定できません: ${item.sourceUrl}`);
    }
    if (item.method === 'image-generation' && item.promptPath === undefined) {
      throw new Error(`Image Generation項目にpromptPathがありません: ${item.id}`);
    }
    if (item.method.startsWith('original-') && item.sourceUrl !== 'none') {
      throw new Error(`Original項目のsourceUrlはnoneにしてください: ${item.id}`);
    }
  }

  const files = await collectTrackedFiles(rootDir);
  const fileSet = new Set(files);
  const missing = files.filter((file) => !paths.has(file));
  const stale = [...paths].filter((file) => !fileSet.has(file));
  if (missing.length > 0) throw new Error(`未登録Provenance: ${missing.join(', ')}`);
  if (stale.length > 0) throw new Error(`存在しないProvenance Path: ${stale.join(', ')}`);

  for (const item of manifest.items) {
    if (item.promptPath !== undefined && !paths.has(item.promptPath)) {
      throw new Error(`Prompt FileもProvenanceへ登録してください: ${item.promptPath}`);
    }
  }

  return { checkedFiles: files.length, manifestItems: manifest.items.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const rootDir = path.resolve(process.argv[2] ?? 'content/html-css');
  const report = await checkProvenance(rootDir, path.join(rootDir, 'provenance.yaml'));
  process.stdout.write(
    `Provenance OK: ${String(report.checkedFiles)} files / ${String(report.manifestItems)} items\n`,
  );
}
