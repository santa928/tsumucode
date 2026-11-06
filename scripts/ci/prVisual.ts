import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseTestList, verifyTestExecution } from '../release/v2/testManifest';

export const PR_VISUAL_TITLES = [
  'course-map-desktop-compact',
  'course-map-tablet-portrait',
  'course-map-mobile-portrait',
  'library-index-mobile-primary',
  'library-index-tablet-portrait',
  'library-index-desktop-compact',
] as const;

export const PR_VISUAL_ARGS = [
  'test',
  '--config=playwright.authoring.config.ts',
  'tests/e2e/visual-regression.spec.ts',
  '--project=chromium',
  '--grep',
  `(?:${PR_VISUAL_TITLES.join('|')})$`,
] as const;

/** 空選択や一部の名前変更を、残ったcaseの成功で隠さない。 */
export function verifyPrVisualList(report: unknown) {
  const titles: string[] = [];
  function visit(input: unknown): void {
    const suite = input as { specs?: { title: string }[]; suites?: unknown[] };
    titles.push(...(suite.specs ?? []).map(({ title }) => title));
    for (const child of suite.suites ?? []) visit(child);
  }
  visit(report);
  if (JSON.stringify(titles.sort()) !== JSON.stringify([...PR_VISUAL_TITLES].sort())) {
    throw new Error('PR visual inventory must contain the exact six required views');
  }
  return parseTestList(report, 'pr-visual', 'pr_visual', 'chromium');
}

/** PR previewのみを検証する。公開候補のfreeze・receipt生成・再buildは行わない。 */
export function runPrVisual(): void {
  mkdirSync('test-results', { recursive: true });
  const cli = path.resolve('node_modules/@playwright/test/cli.js');
  const list = execFileSync(
    process.execPath,
    [cli, ...PR_VISUAL_ARGS, '--list', '--reporter=json'],
    {
      encoding: 'utf8',
      maxBuffer: 4 * 1024 * 1024,
    },
  );
  writeFileSync('test-results/pr-visual-list.json', list);
  const manifest = verifyPrVisualList(JSON.parse(list) as unknown);
  execFileSync(
    process.execPath,
    [
      cli,
      ...PR_VISUAL_ARGS,
      '--workers=1',
      '--retries=0',
      '--trace=retain-on-failure',
      '--reporter=list,json',
      '--output=test-results/pr-visual-artifacts',
    ],
    {
      stdio: 'inherit',
      env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_FILE: 'test-results/pr-visual-summary.json' },
    },
  );
  verifyTestExecution(
    JSON.parse(readFileSync('test-results/pr-visual-summary.json', 'utf8')) as unknown,
    manifest,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) runPrVisual();
