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
  {
    route: './#/courses/html-css/lessons/html-css-ch00-l01/slides/html-css-ch00-l01-s04',
    slideId: 'html-css-ch00-l01-s04',
  },
] as const;

interface ObservedRequest {
  readonly type: string;
  readonly url: string;
}

interface RouteContentContractCase {
  readonly name: string;
  readonly route: string;
  readonly heading: string;
  readonly expectedContentPaths: readonly string[];
}

const catalogPath = 'generated/content/catalog-v3.json';
const courseIndexPath = 'generated/content/courses/html-css/index.json';
const lessonPath = (lessonId: string): string =>
  `generated/content/courses/html-css/lessons/${lessonId}.json`;

const ROUTE_CONTENT_CONTRACTS: readonly RouteContentContractCase[] = [
  {
    name: 'HomeはCatalogだけを取得する',
    route: './#/',
    heading: '学びたいピースを選ぶ',
    expectedContentPaths: [catalogPath],
  },
  {
    name: 'Course mapはIndexまで取得する',
    route: './#/courses/html-css',
    heading: 'HTML/CSS はじめの一歩',
    expectedContentPaths: [catalogPath, courseIndexPath],
  },
  {
    name: 'Slideは所有Lessonだけを取得する',
    route: './#/courses/html-css/lessons/html-css-ch00-l01/slides/html-css-ch00-l01-s01',
    heading: 'Webページは3つの役割でできている',
    expectedContentPaths: [catalogPath, courseIndexPath, lessonPath('html-css-ch00-l01')],
  },
  {
    name: '通常Exerciseは所有Lessonだけを取得する',
    route: './#/courses/html-css/lessons/html-css-ch00-l01/exercises/html-css-ch00-l01-e01',
    heading: '内容と見た目を1箇所ずつ変える',
    expectedContentPaths: [catalogPath, courseIndexPath, lessonPath('html-css-ch00-l01')],
  },
  {
    name: '共有Workspaceは現在工程までのLessonだけを取得する',
    route: './#/courses/html-css/lessons/html-css-ch12-l03/exercises/html-css-ch12-l03-e01',
    heading: 'AboutとSkillsを再利用Styleで育てる',
    expectedContentPaths: [
      catalogPath,
      courseIndexPath,
      lessonPath('html-css-ch12-l01'),
      lessonPath('html-css-ch12-l02'),
      lessonPath('html-css-ch12-l03'),
    ],
  },
  {
    name: 'ReviewはWorkspaceの過去工程を取得しない',
    route:
      './#/courses/html-css/lessons/html-css-ch12-l03/exercises/html-css-ch12-l03-e01/review/html-css-ch12-l03-g01',
    heading: 'SkillsとWorksを再利用できる部品にする',
    expectedContentPaths: [catalogPath, courseIndexPath, lessonPath('html-css-ch12-l03')],
  },
  {
    name: 'Library courseはIndexまで取得する',
    route: './#/library/html-css',
    heading: 'HTML/CSS はじめの一歩',
    expectedContentPaths: [catalogPath, courseIndexPath],
  },
  {
    name: 'Library Slideは所有Lessonだけを取得する',
    route: './#/library/html-css/lessons/html-css-ch00-l01/slides/html-css-ch00-l01-s01',
    heading: 'Webページは3つの役割でできている',
    expectedContentPaths: [catalogPath, courseIndexPath, lessonPath('html-css-ch00-l01')],
  },
];

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

/** 任意の隣接Lesson先読みを止め、Route必須取得だけを観測できる状態にする。 */
async function disableOptionalLessonPrefetch(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'connection', {
      configurable: true,
      value: { saveData: true },
    });
  });
}

/** request URLからGitHub Pages subpath配下の教材JSON相対pathだけを取得する。 */
function contentArtifactPath(requestUrl: string): string | undefined {
  const pathname = new URL(requestUrl).pathname;
  const marker = 'generated/content/';
  const markerIndex = pathname.indexOf(marker);
  if (markerIndex < 0 || !pathname.endsWith('.json')) return undefined;
  return pathname.slice(markerIndex);
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

for (const contract of ROUTE_CONTENT_CONTRACTS) {
  test(contract.name, async ({ page }) => {
    await disableOptionalLessonPrefetch(page);
    const observed = new Set<string>();
    page.on('request', (request) => {
      const relativePath = contentArtifactPath(request.url());
      if (relativePath !== undefined) observed.add(relativePath);
    });

    await page.goto(contract.route);
    await expect(page.getByRole('heading', { level: 1, name: contract.heading })).toBeVisible();
    await expect
      .poll(() => [...observed].sort())
      .toEqual([...contract.expectedContentPaths].sort());
  });
}

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
