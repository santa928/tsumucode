/** Questionの通常教材で読む→型診断→修正→型と動作の判定→保存を確認する。 */
import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {
  editorText,
  readStoredProgress,
  replaceEditorText,
  waitForStoredDraftContent,
} from './helpers/progress';
import { expectStoredViewedSlide } from './helpers/releaseCourse';
import { testBasePath } from './helpers/testBasePath';

const lessonId = 'typescript-ch02-l01';
const exerciseId = `${lessonId}-e01`;
const root = `content/typescript/chapters/typescript-ch02/lessons/${lessonId}/exercises/${exerciseId}`;

test('Questionを読み、型失敗・型条件不足・誤出力・古い世代を区別して修正と保存ができる', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  const compilerRequests: string[] = [];
  page.on('request', (request) => {
    if (/compilerWorker[.-]|typescript(?:\.js|\.worker)/u.test(request.url()))
      compilerRequests.push(request.url());
  });
  const slidePath = `${testBasePath()}#/courses/typescript/lessons/${lessonId}/slides/`;
  await page.goto(`${slidePath}${lessonId}-s01`);
  for (let slide = 1; slide <= 4; slide += 1) {
    const slideId = `${lessonId}-s0${String(slide)}`;
    await expect(page.getByTestId('slide-stage')).toHaveAttribute('data-slide-id', slideId);
    await expectStoredViewedSlide(page, lessonId, slideId);
    await page.screenshot({ path: testInfo.outputPath(`${slideId}-desktop.png`) });
    if (slide < 4) {
      await page.getByRole('link', { name: '次のスライドへ →', exact: true }).focus();
      await page.keyboard.press('Enter');
    }
  }
  expect(compilerRequests).toEqual([]);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole('link', { name: /のコード演習を始める/u }).click();
  const typeError = page.getByText('型を確認してください。まだ実行・採点していません。', {
    exact: true,
  });
  await expect(typeError).toBeVisible({ timeout: 20_000 });
  const starter = await readFile(`${root}/starter/main.ts`, 'utf8');
  await expect.poll(() => editorText(page)).toBe(starter);
  const before = await readStoredProgress(page);
  await page.getByRole('button', { name: '判定する', exact: true }).click();
  await expect(page.getByRole('button', { name: '判定する', exact: true })).toBeEnabled({
    timeout: 20_000,
  });
  expect((await readStoredProgress(page)).drafts[0]?.['validationHistory']).toEqual(
    before.drafts[0]?.['validationHistory'],
  );

  for (const fixture of ['any-escape', 'wrong-value'] as const) {
    const source = await readFile(`${root}/fixtures/${fixture}.ts`, 'utf8');
    await replaceEditorText(page, source);
    await waitForStoredDraftContent(page, source);
    await page.getByRole('button', { name: '判定する', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'あと一歩', exact: true })).toBeVisible({
      timeout: 20_000,
    });
    await page.getByRole('button', { name: '閉じる', exact: true }).click();
    const rejected = await readStoredProgress(page);
    const history = rejected.drafts[0]?.['validationHistory'] as { status: string }[];
    expect(history.at(-1)?.status).toBe('incomplete');
    await page.reload();
    await expect.poll(() => editorText(page)).toBe(source);
    expect((await readStoredProgress(page)).drafts[0]?.['validationHistory']).toEqual(history);
  }

  const solution = await readFile(`${root}/solution/main.ts`, 'utf8');
  const wrongValue = await readFile(`${root}/fixtures/wrong-value.ts`, 'utf8');
  await replaceEditorText(page, solution);
  await waitForStoredDraftContent(page, solution);
  await page.getByRole('button', { name: '判定する', exact: true }).click();
  // 型検査の完了前に編集し、以前の正しい原文の結果を新しい元TSへ保存させない。
  await replaceEditorText(page, wrongValue);
  await waitForStoredDraftContent(page, wrongValue);
  await expect(page.getByRole('button', { name: '判定する', exact: true })).toBeEnabled({
    timeout: 20_000,
  });
  await expect(page.getByTestId('learning-completion')).toHaveCount(0);
  const afterEdit = await readStoredProgress(page);
  expect(
    (afterEdit.drafts[0]?.['validationHistory'] as { status: string }[]).some(
      ({ status }) => status === 'pass',
    ),
  ).toBe(false);
  expect(afterEdit.courses[0]?.['lessons']).toMatchObject({
    [lessonId]: { passedExerciseIds: [], currentComplete: false },
  });

  await page.getByRole('button', { name: '最初に戻す', exact: true }).click();
  const reset = page.getByRole('dialog', { name: '最初のコードに戻しますか？' });
  await reset.getByRole('button', { name: '最初のコードに戻す', exact: true }).click();
  await expect.poll(() => editorText(page)).toBe(starter);
  await expect(typeError).toBeVisible({ timeout: 20_000 });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await replaceEditorText(page, solution);
  await waitForStoredDraftContent(page, solution);
  await page.getByRole('button', { name: '判定する', exact: true }).click();
  await expect(page.getByTestId('learning-completion')).toBeVisible({ timeout: 20_000 });
  await page.reload();
  await expect(page.getByTestId('learning-completion')).toBeVisible();
  await page.goto(
    `${testBasePath()}#/courses/typescript/lessons/${lessonId}/exercises/${exerciseId}`,
  );
  await expect.poll(() => editorText(page)).toBe(solution);
  await expect(page.getByRole('region', { name: 'Console出力' })).toContainText('内容', {
    timeout: 20_000,
  });
  await expect
    .poll(async () => (await readStoredProgress(page)).courses[0]?.['lessons'])
    .toMatchObject({
      [lessonId]: { currentComplete: true, passedExerciseIds: [exerciseId] },
    });
});

test('Questionの形・型誤り・参照コードを390pxで読め、図と練習欄に到達できる', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const slide of ['01', '02', '03', '04'] as const) {
    const slideId = `${lessonId}-s${slide}`;
    await page.goto(`${testBasePath()}#/courses/typescript/lessons/${lessonId}/slides/${slideId}`);
    await expect(page.getByTestId('slide-stage')).toHaveAttribute('data-slide-id', slideId);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
      false,
    );
    await page.screenshot({ path: testInfo.outputPath(`${slideId}-mobile-top.png`) });
    if (slide === '01')
      await page
        .getByTestId('slide-stage')
        .getByRole('img')
        .screenshot({ path: testInfo.outputPath('question-shape-mobile.png') });
    const practice = page
      .getByTestId('slide-stage')
      .getByRole('heading', { name: '今すぐ試す（約1分）', exact: true });
    await practice.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(`${slideId}-mobile-practice.png`) });
    if (slide === '04') {
      const reference = page.getByText('前提のコードを確認：オブジェクトの形に名前を付ける', {
        exact: true,
      });
      await reference.scrollIntoViewIfNeeded();
      await reference.click();
      await expect(page.locator('details.tc-slide-code-reference')).toHaveAttribute('open', '');
      await expect(page.locator('details.tc-slide-code-reference')).toContainText(
        'interface Question',
      );
    }
  }
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
