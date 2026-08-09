import { expect, test } from '@playwright/test';
import {
  openEditableJavaScriptExercise,
  type JavaScriptExerciseLocation,
} from './helpers/javascriptCourse';
import { observeRuntimePage, readRuntimeErrors } from './helpers/openRuntimeFixture';
import { editorText, replaceEditorText, waitForStoredDraftContent } from './helpers/progress';
import { testBasePath } from './helpers/testBasePath';

const COMPARISON_EXERCISE: JavaScriptExerciseLocation = {
  lessonId: 'javascript-ch02-l01',
  exerciseId: 'javascript-ch02-l01-e01',
  title: '回答Aの正誤をbooleanで表示する',
};

const LOOP_EXERCISE: JavaScriptExerciseLocation = {
  lessonId: 'javascript-ch02-l04',
  exerciseId: 'javascript-ch02-l04-e01',
  title: 'forで問題1から問題3まで表示する',
};

const COMPARISON_STARTER = `const answer = 'A';
const isCorrect = answer !== 'A';
console.log(isCorrect);
`;

const COMPARISON_SOLUTION = `const answer = 'A';
const isCorrect = answer === 'A';
console.log(isCorrect);
`;

const LOOP_SOLUTION = `for (let number = 1; number <= 3; number++) {
  console.log('問題' + number);
}
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

test('Chapter 02の4 LessonをChapter 01の後へ順番どおり表示する', async ({ page }) => {
  await page.goto(`${testBasePath()}#/courses/javascript`);
  const titles = [
    'letの値を更新する',
    '比較の答えはboolean',
    'if / elseで表示を選ぶ',
    'else ifで3通りに分ける',
    'forで問題番号を繰り返す',
  ];
  await expect(
    page.getByRole('heading', { name: 'forで問題番号を繰り返す', exact: true }),
  ).toBeVisible();
  const headings = page.getByRole('heading').filter({ hasText: /.+/u });
  const visibleText = await headings.allTextContents();
  let previousIndex = -1;
  for (const title of titles) {
    const index = visibleText.indexOf(title);
    expect(index, `${title}がCourse mapにありません`).toBeGreaterThan(previousIndex);
    previousIndex = index;
  }
});

test('比較Exerciseをscript.js編集・Console確認・Source＋Console判定まで完走できる', async ({
  page,
}) => {
  await openEditableJavaScriptExercise(page, COMPARISON_EXERCISE);
  await expect.poll(() => editorText(page)).toBe(COMPARISON_STARTER);

  await replaceEditorText(page, COMPARISON_SOLUTION);
  await waitForStoredDraftContent(page, COMPARISON_SOLUTION);
  await page.getByRole('button', { name: 'プレビューを更新' }).click();
  await page.getByRole('tab', { name: 'Console' }).click();
  await expect(
    page.getByRole('region', { name: 'Console出力' }).getByText('true', { exact: true }),
  ).toBeVisible();

  await page.getByRole('button', { name: '判定する' }).click();
  const resultDialog = page.getByRole('dialog', { name: '判定結果' });
  await expect(resultDialog.getByRole('heading', { name: 'できました' })).toBeVisible();
});

test('for Exerciseは問題1から問題3だけを順番に表示して合格する', async ({ page }) => {
  await openEditableJavaScriptExercise(page, LOOP_EXERCISE);
  await replaceEditorText(page, LOOP_SOLUTION);
  await waitForStoredDraftContent(page, LOOP_SOLUTION);
  await page.getByRole('button', { name: 'プレビューを更新' }).click();
  await page.getByRole('tab', { name: 'Console' }).click();
  const output = page.getByRole('region', { name: 'Console出力' });
  for (const text of ['問題1', '問題2', '問題3']) {
    await expect(output.getByText(text, { exact: true })).toBeVisible();
  }
  await expect(output.getByText('問題4', { exact: true })).toHaveCount(0);

  await page.getByRole('button', { name: '判定する' }).click();
  await expect(
    page.getByRole('dialog', { name: '判定結果' }).getByRole('heading', { name: 'できました' }),
  ).toBeVisible();
});
