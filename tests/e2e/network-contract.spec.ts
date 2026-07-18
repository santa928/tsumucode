import { readFile } from 'node:fs/promises';
import { expect, test, type Page, type Request } from '@playwright/test';
import { observeRuntimePage, readRuntimeErrors } from './helpers/openRuntimeFixture';
import {
  STANDARD_EXERCISE_ID,
  STANDARD_EXERCISE_TITLE,
  STANDARD_LESSON_ID,
  expectStoredViewedSlide,
  openEditableExercise,
  readExerciseSolution,
  replaceWorkspaceFiles,
} from './helpers/releaseCourse';
import { testBasePath } from './helpers/testBasePath';

const NETWORK_RESOURCE_TYPES = new Set([
  'document',
  'script',
  'stylesheet',
  'font',
  'image',
  'fetch',
  'xhr',
  'websocket',
]);
const SLIDE_ROUTES = [
  {
    route: './#/courses/html-css/lessons/html-css-ch00-l01/slides/html-css-ch00-l01-s01',
    slideId: 'html-css-ch00-l01-s01',
  },
  {
    route: './#/courses/html-css/lessons/html-css-ch00-l01/slides/html-css-ch00-l01-s02',
    slideId: 'html-css-ch00-l01-s02',
  },
  {
    route: './#/courses/html-css/lessons/html-css-ch00-l01/slides/html-css-ch00-l01-s03',
    slideId: 'html-css-ch00-l01-s03',
  },
] as const;

interface ObservedRequest {
  readonly type: string;
  readonly url: string;
}

/** HTTP(S) requestが同一originかつGitHub Pages subpath配下だけか確認する。 */
function expectLocalRequests(page: Page, requests: readonly ObservedRequest[]): void {
  const origin = new URL(page.url()).origin;
  const violations = requests.flatMap(({ type, url }) => {
    if (!NETWORK_RESOURCE_TYPES.has(type)) return [];
    const parsed = new URL(url);
    if (parsed.protocol === 'data:' || parsed.protocol === 'blob:' || parsed.protocol === 'about:')
      return [];
    return parsed.origin === origin && parsed.pathname.startsWith(testBasePath())
      ? []
      : [{ type, url }];
  });
  expect(violations).toEqual([]);
}

/** 新規tab Linkがopenerを分離するrelを併記していることを確認する。 */
async function expectSafeBlankTargets(page: Page): Promise<void> {
  const unsafe = await page.locator('a[target="_blank"]').evaluateAll((links) =>
    links.flatMap((link) => {
      const tokens = new Set((link.getAttribute('rel') ?? '').split(/\s+/u));
      return tokens.has('noopener') && tokens.has('noreferrer')
        ? []
        : [link.getAttribute('href') ?? ''];
    }),
  );
  expect(unsafe).toEqual([]);
}

test.beforeEach(async ({ page }) => {
  await observeRuntimePage(page);
});

test.afterEach(async ({ page }) => {
  await expect(readRuntimeErrors(page)).resolves.toEqual({
    pageErrors: [],
    unhandledRejections: [],
    consoleErrors: [],
  });
});

test('公開Courseの主要状態が外部APIと外部subresourceを要求しない', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const requests: ObservedRequest[] = [];
  page.on('request', (request: Request) => {
    requests.push({ type: request.resourceType(), url: request.url() });
  });

  await page.goto('./#/');
  await expect(page.getByRole('heading', { level: 1, name: '学びたいピースを選ぶ' })).toBeVisible();
  await expectSafeBlankTargets(page);
  await page.goto('./#/courses/html-css');
  await expect(
    page.getByRole('heading', { level: 1, name: 'HTML/CSS はじめの一歩' }),
  ).toBeVisible();
  await expectSafeBlankTargets(page);
  for (const { route, slideId } of SLIDE_ROUTES) {
    await page.goto(route);
    await expect(page.getByRole('progressbar', { name: 'スライドの現在位置' })).toBeVisible();
    await expectStoredViewedSlide(page, STANDARD_LESSON_ID, slideId);
    await expectSafeBlankTargets(page);
  }

  await openEditableExercise(
    page,
    STANDARD_LESSON_ID,
    STANDARD_EXERCISE_ID,
    STANDARD_EXERCISE_TITLE,
  );
  await expectSafeBlankTargets(page);
  await replaceWorkspaceFiles(page, {
    'index.html': '<main><h1>わたしの学習ノート</h1></main>',
    'styles.css': 'body { background-color: #ffffff; }',
  });
  await page.getByRole('button', { name: '判定する' }).click();
  await expect(page.getByRole('heading', { name: 'あと一歩' })).toBeVisible();
  await page
    .getByRole('button', { name: /関連スライドを見直す/u })
    .first()
    .click();
  await expect(page.getByRole('button', { name: '演習へ戻る' })).toBeVisible();
  await expectSafeBlankTargets(page);
  await page.getByRole('button', { name: '演習へ戻る' }).click();

  await replaceWorkspaceFiles(
    page,
    await readExerciseSolution('html-css-ch00', STANDARD_LESSON_ID, STANDARD_EXERCISE_ID),
  );
  await page.getByRole('button', { name: '判定する' }).click();
  await expect(page.getByTestId('learning-completion')).toBeVisible();

  await page.goto('./#/');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '全コースの進捗を書き出す' }).click();
  const bundlePath = testInfo.outputPath('network-progress.json');
  await (await download).saveAs(bundlePath);
  await page.getByLabel('進捗Bundleを選ぶ').setInputFiles({
    name: 'progress.json',
    mimeType: 'application/json',
    buffer: await readFile(bundlePath),
  });
  await expect(page.getByRole('region', { name: '読み込み差分' })).toBeVisible();
  await expectSafeBlankTargets(page);
  expectLocalRequests(page, requests);
});
