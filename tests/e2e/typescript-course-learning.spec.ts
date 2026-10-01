/** 生成済みdraft教材を通常Routeで通し、2Lessonの順序・採点・保存を実UIで確認する。 */
import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import {
  editorText,
  readStoredProgress,
  replaceEditorText,
  waitForStoredDraftContent,
} from './helpers/progress';
import { expectStoredViewedSlide } from './helpers/releaseCourse';
import { testBasePath } from './helpers/testBasePath';

const ROOT = 'content/typescript/chapters/typescript-ch01/lessons';

test('通常Courseで型推論から型注釈へ進み、両課題の型条件と保存を区別する', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const compilerRequests: string[] = [];
  page.on('request', (request) => {
    if (/compilerWorker[.-]|typescript(?:\.js|\.worker)/u.test(request.url()))
      compilerRequests.push(request.url());
  });
  await page.goto(`${testBasePath()}#/`);
  await expect(page.getByRole('heading', { level: 1, name: '学びたいピースを選ぶ' })).toBeVisible();
  await expect(page.getByRole('link', { name: /TypeScript はじめの一歩/u })).toHaveCount(0);
  await page.goto(
    `${testBasePath()}#/courses/typescript/lessons/typescript-ch01-l01/slides/typescript-ch01-l01-s01`,
  );
  for (const [index, suffix] of ['01', '02'].entries()) {
    const lessonId = `typescript-ch01-l${suffix}`;
    const exerciseId = `${lessonId}-e01`;
    for (let slide = 1; slide <= 4; slide += 1) {
      const slideId = `${lessonId}-s0${String(slide)}`;
      await expect(page.getByTestId('slide-stage')).toHaveAttribute('data-slide-id', slideId);
      await expectStoredViewedSlide(page, lessonId, slideId);
      if ((index === 0 && slide === 3) || (index === 1 && slide === 1)) {
        await expect(page.getByTestId('slide-stage').getByRole('img')).toBeVisible();
        await page.screenshot({
          path: testInfo.outputPath(`${lessonId}-code-preview-desktop.png`),
        });
      }
      if (slide < 4)
        await page.getByRole('link', { name: '次のスライドへ →', exact: true }).click();
    }
    if (index === 0) expect(compilerRequests).toEqual([]);
    await page.getByRole('link', { name: /のコード演習を始める/u }).click();
    await expect(
      page.getByText('型を確認してください。まだ実行・採点していません。', { exact: true }),
    ).toBeVisible({ timeout: 20000 });
    if (index === 0) expect(compilerRequests.length).toBeGreaterThan(0);
    await expect(page.getByRole('button', { name: '判定する', exact: true })).toBeEnabled();
    const before = await readStoredProgress(page);
    await page.getByRole('button', { name: '判定する', exact: true }).click();
    await expect(page.getByRole('button', { name: '判定する', exact: true })).toBeEnabled({
      timeout: 20000,
    });
    expect((await readStoredProgress(page)).courses).toEqual(before.courses);
    const wrongProfile =
      index === 0
        ? 'let score: number = 2;\nconsole.log(score);'
        : 'let score = 2;\nconsole.log(score);';
    await replaceEditorText(page, wrongProfile);
    await waitForStoredDraftContent(page, wrongProfile);
    await page.getByRole('button', { name: '判定する', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'あと一歩', exact: true })).toBeVisible({
      timeout: 20000,
    });
    await page.getByRole('button', { name: '閉じる', exact: true }).click();
    const solution = await readFile(
      `${ROOT}/${lessonId}/exercises/${exerciseId}/solution/main.ts`,
      'utf8',
    );
    await replaceEditorText(page, solution);
    await waitForStoredDraftContent(page, solution);
    await page.getByRole('button', { name: '判定する', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'ピースがはまりました', exact: true }),
    ).toBeVisible({
      timeout: 20000,
    });
    await expect(page.getByTestId('learning-completion')).toBeVisible();
    await page.reload();
    await expect(page.getByTestId('learning-completion')).toBeVisible();
    const exercisePath = `${testBasePath()}#/courses/typescript/lessons/${lessonId}/exercises/${exerciseId}`;
    await page.goto(exercisePath);
    await expect.poll(() => editorText(page)).toBe(solution);
    await expect(page.getByRole('region', { name: 'Console出力' })).toContainText('2', {
      timeout: 20000,
    });
    await page.goto(`${exercisePath}/completion`);
    await expect(page.getByTestId('learning-completion')).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath(`${lessonId}-complete-desktop.png`) });
    if (index === 0) {
      await expect(
        page.getByRole('link', { name: '次のピースへ進む', exact: true }),
      ).toHaveAttribute('href', /typescript-ch01-l02\/slides\/typescript-ch01-l02-s01/u);
      await page.getByRole('link', { name: '次のピースへ進む', exact: true }).click();
    }
  }
  await expect
    .poll(async () =>
      (await readStoredProgress(page)).courses.find(
        (course) => course['courseId'] === 'typescript',
      ),
    )
    .toMatchObject({
      courseId: 'typescript',
      contentRevision: '2026-10-01.1',
      currentComplete: true,
      lessons: {
        'typescript-ch01-l01': {
          currentComplete: true,
          passedExerciseIds: ['typescript-ch01-l01-e01'],
        },
        'typescript-ch01-l02': {
          currentComplete: true,
          passedExerciseIds: ['typescript-ch01-l02-e01'],
        },
      },
    });
});

test('追加したコードと結果の図は390pxでも横へはみ出さず読める', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [lesson, slide] of [
    ['01', '03'],
    ['02', '01'],
  ] as const) {
    const lessonId = `typescript-ch01-l${lesson}`;
    await page.goto(
      `${testBasePath()}#/courses/typescript/lessons/${lessonId}/slides/${lessonId}-s${slide}`,
    );
    await expect(page.getByTestId('slide-stage').getByRole('img')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
      false,
    );
    await page.screenshot({
      path: testInfo.outputPath(`${lessonId}-code-preview-mobile.png`),
      fullPage: true,
    });
    await page
      .getByTestId('slide-stage')
      .getByRole('heading', { name: '今すぐ試す（約1分）', exact: true })
      .locator('..')
      .locator('p')
      .last()
      .scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(`${lessonId}-practice-mobile.png`) });
  }
});
