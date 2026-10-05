/** 生成済みdraft教材を通常Routeで通し、Lessonの順序・採点・保存を実UIで確認する。 */
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

const ROOT = 'content/typescript/chapters/typescript-ch01/lessons';

test('通常Courseで型推論から型注釈へ進み、両課題の型条件と保存を区別する', async ({
  page,
}, testInfo) => {
  // 2 Lessonの全工程を1ケースで通す。個別操作の上限は変更しない。
  test.setTimeout(60_000);
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
      contentRevision: '2026-10-05.3',
      currentComplete: false,
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

test('型消去Lessonで型失敗・実行失敗・未達を区別し、Reset後に修正と保存ができる', async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  const lessonId = 'typescript-ch01-l03';
  const exerciseId = `${lessonId}-e01`;
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
      const next = page.getByRole('link', { name: '次のスライドへ →', exact: true });
      await next.focus();
      await page.keyboard.press('Enter');
    }
  }
  expect(compilerRequests).toEqual([]);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole('link', { name: /のコード演習を始める/u }).click();
  const codeError = page.getByText('コードのエラーを確認してください。', { exact: true });
  await expect(codeError).toBeVisible({ timeout: 20_000 });
  const starter = await readFile(
    `${ROOT}/${lessonId}/exercises/${exerciseId}/starter/main.ts`,
    'utf8',
  );
  await expect.poll(() => editorText(page)).toBe(starter);

  for (const [fixture, status] of [
    ['type-error', '型を確認してください。まだ実行・採点していません。'],
    ['error-after-output', 'コードのエラーを確認してください。'],
  ] as const) {
    const source = await readFile(
      `${ROOT}/${lessonId}/exercises/${exerciseId}/fixtures/${fixture}.ts`,
      'utf8',
    );
    await replaceEditorText(page, source);
    await waitForStoredDraftContent(page, source);
    await page.getByRole('button', { name: 'プレビューを更新', exact: true }).click();
    await expect(page.getByText(status, { exact: true })).toBeVisible({ timeout: 20_000 });
    const before = await readStoredProgress(page);
    await page.getByRole('button', { name: '判定する', exact: true }).click();
    await expect(page.getByRole('button', { name: '判定する', exact: true })).toBeEnabled({
      timeout: 20_000,
    });
    const rejected = await readStoredProgress(page);
    // 操作日時は更新され得るが、進捗・合格・閲覧済みの証拠は失わない。
    expect(rejected.courses.map((course) => ({ ...course, updatedAt: undefined }))).toEqual(
      before.courses.map((course) => ({ ...course, updatedAt: undefined })),
    );
    const beforeHistory = before.drafts[0]?.['validationHistory'] as readonly unknown[];
    if (fixture === 'type-error') {
      expect(rejected.drafts[0]?.['validationHistory']).toEqual(beforeHistory);
    } else {
      expect(rejected.drafts[0]?.['validationHistory']).toEqual([
        ...beforeHistory,
        expect.objectContaining({
          status: 'code-error',
          passedRequirementIds: [],
          diagnostics: expect.arrayContaining([
            expect.objectContaining({ code: 'javascript-runtime', file: 'main.ts' }),
          ]),
        }),
      ]);
    }
    await page.reload();
    await expect.poll(() => editorText(page)).toBe(source);
    await expect(page.getByText(status, { exact: true })).toBeVisible({ timeout: 20_000 });
  }

  const wrongValue = await readFile(
    `${ROOT}/${lessonId}/exercises/${exerciseId}/fixtures/wrong-value.ts`,
    'utf8',
  );
  await replaceEditorText(page, wrongValue);
  await waitForStoredDraftContent(page, wrongValue);
  await page.getByRole('button', { name: '判定する', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'あと一歩', exact: true })).toBeVisible({
    timeout: 20_000,
  });
  await page.getByRole('button', { name: '閉じる', exact: true }).click();
  await page.getByRole('button', { name: '最初に戻す', exact: true }).click();
  const reset = page.getByRole('dialog', { name: '最初のコードに戻しますか？' });
  await expect(reset).toBeVisible();
  await reset.getByRole('button', { name: '最初のコードに戻す', exact: true }).click();
  await expect(reset).toBeHidden();
  await expect.poll(() => editorText(page)).toBe(starter);
  await expect(codeError).toBeVisible({ timeout: 20_000 });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  const solution = await readFile(
    `${ROOT}/${lessonId}/exercises/${exerciseId}/solution/main.ts`,
    'utf8',
  );
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
  await expect(page.getByRole('region', { name: 'Console出力' })).toContainText('2', {
    timeout: 20_000,
  });
  await expect
    .poll(async () => (await readStoredProgress(page)).courses[0]?.['lessons'])
    .toMatchObject({
      [lessonId]: { currentComplete: true, passedExerciseIds: [exerciseId] },
    });

  // 再検証で既存画像を消さず、新しい図の全体と狭幅の練習欄を目視用に残す。
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(
    `${testBasePath()}#/courses/typescript/lessons/${lessonId}/slides/${lessonId}-s01`,
  );
  await page
    .getByTestId('slide-stage')
    .getByRole('img')
    .screenshot({
      path: testInfo.outputPath(`${lessonId}-erasure-flow-mobile.png`),
    });
  for (const slide of ['01', '03'] as const) {
    await page.goto(
      `${testBasePath()}#/courses/typescript/lessons/${lessonId}/slides/${lessonId}-s${slide}`,
    );
    await page
      .getByTestId('slide-stage')
      .getByRole('heading', { name: '今すぐ試す（約1分）', exact: true })
      .scrollIntoViewIfNeeded();
    await page.screenshot({
      path: testInfo.outputPath(`${lessonId}-s${slide}-practice-mobile.png`),
    });
  }
});

test('型消去の対比と実行失敗の説明は390pxでも読める', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const slide of ['01', '03'] as const) {
    const slideId = `typescript-ch01-l03-s${slide}`;
    await page.goto(
      `${testBasePath()}#/courses/typescript/lessons/typescript-ch01-l03/slides/${slideId}`,
    );
    await expect(page.getByTestId('slide-stage')).toHaveAttribute('data-slide-id', slideId);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
      false,
    );
    await page.screenshot({ path: testInfo.outputPath(`${slideId}-mobile.png`), fullPage: true });
    await page
      .getByTestId('slide-stage')
      .getByRole('heading', { name: '今すぐ試す（約1分）', exact: true })
      .scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath(`${slideId}-practice-mobile.png`) });
  }
});
