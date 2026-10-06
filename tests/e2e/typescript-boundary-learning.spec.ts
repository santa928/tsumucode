/** 通常Slideから境界演習へ進み、型診断・未達・修正・保存・Resetを実UIで確認する。 */
import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {
  editorText,
  replaceEditorText,
  readStoredProgress,
  waitForStoredDraftContent,
} from './helpers/progress';
import { expectStoredViewedSlide } from './helpers/releaseCourse';
import { testBasePath } from './helpers/testBasePath';

for (const suffix of ['01', '02', '03'] as const) {
  const lessonId = `typescript-ch05-l${suffix}`;
  const exerciseId = `${lessonId}-e01`;
  const root = `content/typescript/chapters/typescript-ch05/lessons/${lessonId}/exercises/${exerciseId}`;
  test(`${lessonId}を読み、型失敗・条件不足・修正・Reset・合格を保存できる`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1280, height: 900 });
    const compilerRequests: string[] = [];
    page.on('request', (request) => {
      if (/compilerWorker[.-]|typescript(?:\.js|\.worker)/u.test(request.url()))
        compilerRequests.push(request.url());
    });
    await page.goto(
      `${testBasePath()}#/courses/typescript/lessons/${lessonId}/slides/${lessonId}-s01`,
    );
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
    for (const fixture of [
      suffix === '01' || suffix === '02' ? 'fixed-return' : 'fixed-display',
      suffix === '01' ? 'any-escape' : 'wrong-result',
    ]) {
      const source = await readFile(`${root}/fixtures/${fixture}.ts`, 'utf8');
      await replaceEditorText(page, source);
      await waitForStoredDraftContent(page, source);
      await page.getByRole('button', { name: '判定する', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'あと一歩', exact: true })).toBeVisible({
        timeout: 20_000,
      });
      await page.getByRole('button', { name: '閉じる', exact: true }).click();
      const history = (await readStoredProgress(page)).drafts[0]?.['validationHistory'] as {
        status: string;
      }[];
      expect(history.at(-1)?.status).toBe('incomplete');
      await page.reload();
      await expect.poll(() => editorText(page)).toBe(source);
      expect((await readStoredProgress(page)).drafts[0]?.['validationHistory']).toEqual(history);
    }
    await page.getByRole('button', { name: '最初に戻す', exact: true }).click();
    await page
      .getByRole('dialog', { name: '最初のコードに戻しますか？' })
      .getByRole('button', { name: '最初のコードに戻す', exact: true })
      .click();
    await expect.poll(() => editorText(page)).toBe(starter);
    await expect(typeError).toBeVisible({ timeout: 20_000 });
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    const solution = await readFile(`${root}/solution/main.ts`, 'utf8');
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
    await page.getByRole('tab', { name: 'Console', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Console出力' })).toContainText(
      '準備できました',
      { timeout: 20_000 },
    );
    await expect
      .poll(async () => (await readStoredProgress(page)).courses[0]?.['lessons'])
      .toMatchObject({ [lessonId]: { currentComplete: true, passedExerciseIds: [exerciseId] } });
  });

  test(`${lessonId}の図・本文・前提コード・練習欄を390pxで読める`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const slide of ['01', '02', '03', '04']) {
      const slideId = `${lessonId}-s${slide}`;
      await page.goto(
        `${testBasePath()}#/courses/typescript/lessons/${lessonId}/slides/${slideId}`,
      );
      await expect(page.getByTestId('slide-stage')).toHaveAttribute('data-slide-id', slideId);
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
        false,
      );
      await page.screenshot({ path: testInfo.outputPath(`${slideId}-mobile-top.png`) });
      if (slide === '01')
        await page
          .getByTestId('slide-stage')
          .getByRole('img')
          .screenshot({ path: testInfo.outputPath('branches-mobile.png') });
      await page
        .getByRole('heading', { name: '今すぐ試す（約1分）', exact: true })
        .scrollIntoViewIfNeeded();
      await page.screenshot({ path: testInfo.outputPath(`${slideId}-mobile-practice.png`) });
      if (slide === '03') {
        await page.locator('details.tc-slide-code-reference summary').scrollIntoViewIfNeeded();
        await page.locator('details.tc-slide-code-reference summary').click();
        await expect(page.locator('details.tc-slide-code-reference')).toHaveAttribute('open', '');
        await expect(page.locator('details.tc-slide-code-reference')).toContainText(
          suffix === '01' ? 'function readAnswer' : suffix === '02' ? 'typeof value' : 'await load',
        );
      }
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    }
  });
}

/** 実採点中の編集で旧結果を失効し、元TSと非合格の履歴を保持する。 */
test('非同期課題の採点中に編集しても旧結果を新ソースへ保存しない', async ({ page }) => {
  test.setTimeout(90_000);
  const lessonId = 'typescript-ch05-l03';
  const root = `content/typescript/chapters/typescript-ch05/lessons/${lessonId}/exercises/${lessonId}-e01`;
  await page.goto(
    `${testBasePath()}#/courses/typescript/lessons/${lessonId}/exercises/${lessonId}-e01`,
  );
  const delayed = (await readFile(`${root}/fixtures/delayed.ts`, 'utf8')).replace(
    'resolve, 100',
    'resolve, 500',
  );
  await replaceEditorText(page, delayed);
  await waitForStoredDraftContent(page, delayed);
  await page.getByRole('tab', { name: 'Console', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Console出力' })).toContainText('準備できました', {
    timeout: 20_000,
  });
  const before = await readStoredProgress(page);
  await page.getByRole('button', { name: '判定する', exact: true }).click();
  await expect(page.getByRole('button', { name: '判定しています', exact: true })).toBeVisible();
  const edited = await readFile(`${root}/fixtures/wrong-result.ts`, 'utf8');
  await replaceEditorText(page, edited);
  await waitForStoredDraftContent(page, edited);
  await expect(page.getByRole('button', { name: '判定する', exact: true })).toBeEnabled({
    timeout: 20_000,
  });
  await page.getByRole('tab', { name: 'Console', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Console出力' })).toContainText('準備できました', {
    timeout: 20_000,
  });
  const after = await readStoredProgress(page);
  expect(after.drafts[0]?.['validationHistory']).toEqual(before.drafts[0]?.['validationHistory']);
  expect(after.drafts[0]?.['lastPassingSnapshots']).toEqual(
    before.drafts[0]?.['lastPassingSnapshots'],
  );
  await page.reload();
  // 再読込は新しい保存操作ではない。復元した原文と、仮想描画される表示の両端を確認する。
  await expect
    .poll(() => readStoredProgress(page))
    .toMatchObject({
      drafts: [{ files: { 'main.ts': edited } }],
    });
  await expect(page.locator('.cm-content')).toContainText(edited.split('\n')[0]!);
  await page.locator('.cm-content').press('Control+End');
  await expect(page.locator('.cm-content')).toContainText("console.log('準備できました');");
  await page.getByRole('button', { name: '判定する', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'あと一歩', exact: true })).toBeVisible({
    timeout: 20_000,
  });
  await page.getByRole('button', { name: '閉じる', exact: true }).click();
  const solution = await readFile(`${root}/solution/main.ts`, 'utf8');
  await replaceEditorText(page, solution);
  await waitForStoredDraftContent(page, solution);
  await page.getByRole('button', { name: '判定する', exact: true }).click();
  // 演習直リンクではSlide未閲覧なので、演習の合格と原文を保存した証拠を確認する。
  await expect(page.getByRole('heading', { name: 'できました', exact: true })).toBeVisible({
    timeout: 20_000,
  });
  await expect
    .poll(() => readStoredProgress(page))
    .toMatchObject({
      drafts: [
        {
          files: { 'main.ts': solution },
          validationHistory: [
            expect.objectContaining({ status: 'incomplete' }),
            expect.objectContaining({ status: 'pass' }),
          ],
          lastPassingSnapshots: { [`${lessonId}-e01`]: { files: { 'main.ts': solution } } },
        },
      ],
    });
});
