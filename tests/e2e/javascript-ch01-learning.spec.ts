import { expect, test } from '@playwright/test';
import {
  openEditableJavaScriptExercise,
  type JavaScriptExerciseLocation,
} from './helpers/javascriptCourse';
import { observeRuntimePage, readRuntimeErrors } from './helpers/openRuntimeFixture';
import { editorText, replaceEditorText, waitForStoredDraftContent } from './helpers/progress';
import { testBasePath } from './helpers/testBasePath';

const CHAPTER_ONE_FIRST_EXERCISE: JavaScriptExerciseLocation = {
  lessonId: 'javascript-ch01-l01',
  exerciseId: 'javascript-ch01-l01-e01',
  title: '3種類の値をConsoleへ表示する',
};

const STARTER_SOURCE = `console.log('ここを問題1に変える');
console.log(0);
console.log(false);
`;

const SOLUTION_SOURCE = `console.log('問題1');
console.log(3);
console.log(true);
`;

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

test('Chapter 01の4 LessonをCourse mapへ順番どおり表示する', async ({ page }) => {
  await page.goto(`${testBasePath()}#/courses/javascript`);
  for (const title of [
    '値をConsoleで確かめる',
    'constで値に名前をつける',
    '演算で得点を計算する',
    'letの値を更新する',
  ]) {
    await expect(page.getByText(title, { exact: true })).toBeVisible();
  }
});

test('Chapter 01の値Exerciseをscript.js編集・Console確認・厳密判定まで完走できる', async ({
  page,
}) => {
  await openEditableJavaScriptExercise(page, CHAPTER_ONE_FIRST_EXERCISE);
  await expect(page.getByRole('tab', { name: 'script.js', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect.poll(() => editorText(page)).toBe(STARTER_SOURCE);

  await replaceEditorText(page, SOLUTION_SOURCE);
  await waitForStoredDraftContent(page, SOLUTION_SOURCE);
  await page.getByRole('button', { name: 'プレビューを更新' }).click();
  await page.getByRole('tab', { name: 'Console' }).click();
  const consoleRegion = page.getByRole('region', { name: 'Console出力' });
  await expect(consoleRegion.getByText('問題1', { exact: true })).toBeVisible();
  await expect(consoleRegion.getByText('3', { exact: true })).toBeVisible();
  await expect(consoleRegion.getByText('true', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: '判定する' }).click();
  const resultDialog = page.getByRole('dialog', { name: '判定結果' });
  await expect(resultDialog.getByRole('heading', { name: 'できました' })).toBeVisible();
  await expect(resultDialog).toContainText('必要なピースをすべて積めました。');
});
