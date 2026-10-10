import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { z } from 'zod';
import { expect, test, type Page } from '@playwright/test';
import { readStoredProgress, seedCompletedProgress } from './helpers/progress';
import {
  STANDARD_EXERCISE_ID,
  STANDARD_EXERCISE_TITLE,
  STANDARD_LESSON_ID,
  exerciseRoute,
} from './helpers/releaseCourse';

const typescriptPublished =
  z
    .object({ publicationStatus: z.enum(['draft', 'published']) })
    .parse(parse(readFileSync('content/typescript/course.yaml', 'utf8'))).publicationStatus ===
  'published';
const reactPublished =
  z
    .object({ publicationStatus: z.enum(['draft', 'published']) })
    .parse(parse(readFileSync('content/react/course.yaml', 'utf8'))).publicationStatus ===
  'published';
const nextPublished =
  z
    .object({ publicationStatus: z.enum(['draft', 'published']) })
    .parse(parse(readFileSync('content/next/course.yaml', 'utf8'))).publicationStatus ===
  'published';
const expectedRequiredCourses = nextPublished
  ? 5
  : reactPublished
    ? 4
    : typescriptPublished
      ? 3
      : 2;

const HOME_ROUTE = './#/';
const PATH_ROUTE = './#/paths/frontend';
const COURSE_ROUTE = './#/courses/html-css';
const FIRST_SLIDE_ROUTE =
  './#/courses/html-css/lessons/html-css-ch00-l01/slides/html-css-ch00-l01-s01';
const LIBRARY_ROUTE = './#/library/html-css';

/** 通常学習画面のH1が表示されるまで待ち、Hash direct URLの成立を確認する。 */
async function expectDirectRoute(page: Page, route: string, heading: string): Promise<void> {
  await page.goto(route);
  await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible({
    timeout: 15_000,
  });
}

test('Homeは今回の学習を先頭にし、PathとCourseの棚を残してManifestを先読みしない', async ({
  page,
}) => {
  const courseManifestRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/generated/content/courses/')) {
      courseManifestRequests.push(request.url());
    }
  });

  await page.goto(HOME_ROUTE);
  await expect(page.getByRole('heading', { level: 1, name: '学びたいピースを選ぶ' })).toBeVisible();
  await expect(
    page
      .getByRole('region', { name: '今回の学習' })
      .getByRole('heading', { name: '最初の小さな制作' }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: '「フロントエンド学習パス」を最初から始める' }),
  ).toBeVisible();

  const shelfHeadings = await page.locator('main h2').allTextContents();
  expect(shelfHeadings.slice(0, 3)).toEqual([
    '最初の小さな制作',
    '学習パスから始める',
    '個別コースを選ぶ',
  ]);
  expect(courseManifestRequests).toEqual([]);
});

test('Pathの順序と必須Courseを表示し、既存Courseへロックなしで移動できる', async ({ page }) => {
  await page.goto(HOME_ROUTE);
  await page.getByRole('link', { name: 'フロントエンド学習パスの全体を見る' }).click();
  await expect(page).toHaveURL(/#\/paths\/frontend$/u);
  await expect(
    page.getByRole('heading', { level: 1, name: 'フロントエンド学習パス' }),
  ).toBeVisible();

  const steps = page.getByRole('list', { name: '学習パスのコース順' }).getByRole('listitem');
  await expect(steps).toHaveCount(expectedRequiredCourses);
  await expect(steps.first().getByText('必須', { exact: true })).toBeVisible();
  const courseLink = steps.first().getByRole('link', {
    name: 'HTML/CSS はじめの一歩を始める',
  });
  await expect(courseLink).toBeEnabled();
  const javascriptStep = steps.nth(1);
  await expect(javascriptStep.getByText('必須', { exact: true })).toBeVisible();
  const javascriptLink = javascriptStep.getByRole('link', {
    name: 'JavaScript はじめの一歩を始める',
    exact: true,
  });
  await expect(javascriptLink).toBeEnabled();
  await expect(javascriptLink).toHaveAttribute(
    'href',
    '#/courses/javascript/lessons/javascript-ch00-l01/slides/javascript-ch00-l01-s01',
  );

  if (typescriptPublished) {
    const typescriptStep = steps.nth(2);
    await expect(typescriptStep.getByText('必須', { exact: true })).toBeVisible();
    await expect(
      typescriptStep.getByRole('link', { name: 'TypeScript はじめの一歩を始める', exact: true }),
    ).toHaveAttribute(
      'href',
      '#/courses/typescript/lessons/typescript-ch01-l01/slides/typescript-ch01-l01-s01',
    );
  }

  if (reactPublished) {
    const reactStep = steps.nth(3);
    await expect(reactStep.getByText('必須', { exact: true })).toBeVisible();
    await expect(
      reactStep.getByRole('link', { name: 'React はじめの一歩を始める', exact: true }),
    ).toHaveAttribute('href', '#/courses/react/lessons/react-ch01-l01/slides/react-ch01-l01-s01');
  }

  if (nextPublished) {
    const nextStep = steps.nth(4);
    await expect(nextStep.getByText('必須', { exact: true })).toBeVisible();
    await expect(
      nextStep.getByText('前提コース：React はじめの一歩', { exact: true }),
    ).toBeVisible();
    await expect(
      nextStep.getByRole('link', { name: 'Next.js 実サーバーの第一歩を始める', exact: true }),
    ).toHaveAttribute('href', '#/courses/next/lessons/next-ch01-l01/slides/next-ch01-l01-s01');
  }

  await page
    .getByRole('link', {
      name: '「フロントエンド学習パス」を最初から始める',
    })
    .click();
  await expect(page).toHaveURL(/html-css-ch00-l01-s01$/u);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Webページは3つの役割でできている' }),
  ).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/#\/paths\/frontend$/u);
  await page.goBack();
  await expect(page).toHaveURL(/#\/$/u);
  await page.goForward();
  await expect(page).toHaveURL(/#\/paths\/frontend$/u);
  await page.goForward();
  await expect(page).toHaveURL(/html-css-ch00-l01-s01$/u);
});

test('CourseProgressをPathへ再利用し、Path専用recordを保存しない', async ({ page }) => {
  await seedCompletedProgress(page);
  await page.goto(PATH_ROUTE);
  await expect(
    page.getByRole('heading', { level: 1, name: 'フロントエンド学習パス' }),
  ).toBeVisible();
  await expect(page.getByRole('progressbar', { name: '必須コースの進捗' })).toHaveAttribute(
    'aria-valuetext',
    `0 / ${String(expectedRequiredCourses)} ピース完了`,
  );
  await expect(
    page.getByRole('progressbar', { name: 'HTML/CSS はじめの一歩の進捗' }),
  ).toHaveAttribute('aria-valuetext', '1 / 51 ピース完了');
  await expect(
    page.getByRole('link', { name: '「フロントエンド学習パス」のつづきから' }),
  ).toBeVisible();

  const stored = await readStoredProgress(page);
  expect(stored.courses.map((course) => course['courseId'])).toEqual(['html-css']);
  expect(
    [...stored.courses, ...stored.drafts].some(
      (record) =>
        record['courseId'] === 'frontend' ||
        (typeof record['key'] === 'string' && record['key'].startsWith('frontend:')),
    ),
  ).toBe(false);
});

test('既存Course・Slide・Exercise・Libraryのdirect URLを維持する', async ({ page }) => {
  await expectDirectRoute(page, COURSE_ROUTE, 'HTML/CSS はじめの一歩');
  await expectDirectRoute(page, FIRST_SLIDE_ROUTE, 'Webページは3つの役割でできている');
  await expectDirectRoute(
    page,
    exerciseRoute(STANDARD_LESSON_ID, STANDARD_EXERCISE_ID),
    STANDARD_EXERCISE_TITLE,
  );
  await expectDirectRoute(page, LIBRARY_ROUTE, 'HTML/CSS はじめの一歩 スライド目次');
});
