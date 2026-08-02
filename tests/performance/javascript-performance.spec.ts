import { expect, test, type Page } from '@playwright/test';
import {
  JAVASCRIPT_EXERCISE_ID,
  openEditableJavaScriptExercise,
} from '../e2e/helpers/javascriptCourse';
import { loadJavaScriptPerformanceManifest, percentile95 } from './manifest';

const manifest = await loadJavaScriptPerformanceManifest();

/** 最新の指定Performance Measureを有限durationとして読む。 */
async function latestMeasure(page: Page, name: string): Promise<number> {
  return page.evaluate((measureName) => {
    const duration = performance.getEntriesByName(measureName).at(-1)?.duration;
    if (duration === undefined || !Number.isFinite(duration)) {
      throw new Error(`Performance Measureがありません: ${measureName}`);
    }
    return duration;
  }, name);
}

/** 指定Measureを空にし、次の実操作1回だけを採取できる状態へ戻す。 */
async function clearMeasures(page: Page): Promise<void> {
  await page.evaluate(() => {
    performance.clearMeasures('tsumucode:preview-update');
    performance.clearMeasures('tsumucode:validation');
  });
}

test('JavaScript初回Previewのp95を500ms以内に保つ', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  expect(manifest.exercises).toEqual([{ id: JAVASCRIPT_EXERCISE_ID, category: 'simple' }]);
  const initialPreviewDurations: number[] = [];
  const totalRuns = manifest.warmupRuns + manifest.runsPerExercise;

  for (let index = 0; index < totalRuns; index += 1) {
    await page.goto('about:blank');
    await openEditableJavaScriptExercise(page);
    await expect
      .poll(() =>
        page.evaluate(() => performance.getEntriesByName('tsumucode:preview-update').length),
      )
      .toBeGreaterThan(0);
    if (index >= manifest.warmupRuns) {
      initialPreviewDurations.push(await latestMeasure(page, 'tsumucode:preview-update'));
    }
  }

  const result = {
    exerciseId: JAVASCRIPT_EXERCISE_ID,
    initialPreviewP95Ms: percentile95(initialPreviewDurations),
    initialPreviewDurations,
  };
  await testInfo.attach(`${JAVASCRIPT_EXERCISE_ID}-initial-preview-performance.json`, {
    body: Buffer.from(JSON.stringify(result, undefined, 2)),
    contentType: 'application/json',
  });
  expect(result.initialPreviewP95Ms).toBeLessThanOrEqual(manifest.previewP95Ms);
});

test('JavaScript再Previewと判定のp95を性能予算内に保つ', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const repeatPreviewDurations: number[] = [];
  const validationDurations: number[] = [];
  const totalRuns = manifest.warmupRuns + manifest.runsPerExercise;

  await openEditableJavaScriptExercise(page);
  for (let index = 0; index < totalRuns; index += 1) {
    await clearMeasures(page);
    const previewButton = page.getByRole('button', { name: 'プレビューを更新' });
    await previewButton.click();
    await expect
      .poll(() =>
        page.evaluate(() => performance.getEntriesByName('tsumucode:preview-update').length),
      )
      .toBe(1);
    await expect(previewButton).toBeEnabled();

    const validationButton = page.getByRole('button', { name: '判定する' });
    await validationButton.click();
    await expect
      .poll(() => page.evaluate(() => performance.getEntriesByName('tsumucode:validation').length))
      .toBe(1);
    await expect(validationButton).toBeEnabled();

    if (index >= manifest.warmupRuns) {
      repeatPreviewDurations.push(await latestMeasure(page, 'tsumucode:preview-update'));
      validationDurations.push(await latestMeasure(page, 'tsumucode:validation'));
    }

    const feedback = page.getByRole('dialog', { name: '判定結果' });
    await expect(feedback).toBeVisible();
    await feedback.getByRole('button', { name: '閉じる' }).click();
    await expect(feedback).toBeHidden();
  }

  const result = {
    exerciseId: JAVASCRIPT_EXERCISE_ID,
    repeatPreviewP95Ms: percentile95(repeatPreviewDurations),
    validationP95Ms: percentile95(validationDurations),
    repeatPreviewDurations,
    validationDurations,
  };
  await testInfo.attach(`${JAVASCRIPT_EXERCISE_ID}-repeat-performance.json`, {
    body: Buffer.from(JSON.stringify(result, undefined, 2)),
    contentType: 'application/json',
  });

  expect(result.repeatPreviewP95Ms).toBeLessThanOrEqual(manifest.repeatPreviewP95Ms);
  expect(result.validationP95Ms).toBeLessThanOrEqual(manifest.validationP95Ms);
});
