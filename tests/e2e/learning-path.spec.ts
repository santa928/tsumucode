import { expect, test, type Page } from '@playwright/test';
import { readStoredProgress, seedCompletedProgress } from './helpers/progress';
import {
  STANDARD_EXERCISE_ID,
  STANDARD_EXERCISE_TITLE,
  STANDARD_LESSON_ID,
  exerciseRoute,
} from './helpers/releaseCourse';

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

test('HomeはLearningPathを主導線にし、Course Manifestを先読みしない', async ({ page }) => {
  const courseManifestRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/generated/content/courses/')) {
      courseManifestRequests.push(request.url());
    }
  });

  await page.goto(HOME_ROUTE);
  await expect(page.getByRole('heading', { level: 1, name: '学びたいピースを選ぶ' })).toBeVisible();
  await expect(
    page.getByRole('link', { name: '「フロントエンド学習パス」を最初から始める' }),
  ).toBeVisible();

  const shelfHeadings = await page.locator('main h2').allTextContents();
  expect(shelfHeadings.slice(0, 2)).toEqual(['学習パスから始める', '個別コースを選ぶ']);
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
  await expect(steps).toHaveCount(1);
  await expect(steps.first().getByText('必須', { exact: true })).toBeVisible();
  const courseLink = steps.first().getByRole('link', {
    name: 'HTML/CSS はじめの一歩を始める',
  });
  await expect(courseLink).toBeEnabled();

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
    '0 / 1 ピース完了',
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
