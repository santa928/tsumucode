import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { openEditableExercise } from '../e2e/helpers/releaseCourse';
import { loadPerformanceManifest, percentile95 } from './manifest';

interface PerformanceExerciseProbe {
  readonly id: string;
  readonly title: string;
}

interface PerformanceLessonProbe {
  readonly id: string;
  readonly exercises: readonly PerformanceExerciseProbe[];
}

interface PerformanceCourseProbe {
  readonly phases: readonly {
    readonly chapters: readonly {
      readonly lessons: readonly PerformanceLessonProbe[];
    }[];
  }[];
}

const manifest = await loadPerformanceManifest();
const course = JSON.parse(
  await readFile('public/generated/content/courses/html-css.json', 'utf8'),
) as PerformanceCourseProbe;
const lessons = course.phases.flatMap(({ chapters }) =>
  chapters.flatMap(({ lessons: chapterLessons }) => chapterLessons),
);

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

test.describe.configure({ mode: 'serial' });

for (const target of manifest.exercises) {
  const lesson = lessons.find((item) =>
    item.exercises.some(({ id: exerciseId }) => exerciseId === target.id),
  );
  const exercise = lesson?.exercises.find(({ id }) => id === target.id);
  if (lesson === undefined || exercise === undefined) {
    throw new Error(`Performance Exerciseが見つかりません: ${target.id}`);
  }

  test(`${target.id} preview/validation p95`, async ({ page }, testInfo) => {
    await openEditableExercise(page, lesson.id, exercise.id, exercise.title);
    const previewDurations: number[] = [];
    const validationDurations: number[] = [];
    const totalRuns = manifest.warmupRuns + manifest.runsPerExercise;

    for (let index = 0; index < totalRuns; index += 1) {
      await page.evaluate(() => {
        performance.clearMeasures('tsumucode:preview-update');
        performance.clearMeasures('tsumucode:validation');
      });

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
        .poll(() =>
          page.evaluate(() => performance.getEntriesByName('tsumucode:validation').length),
        )
        .toBe(1);
      await expect(validationButton).toBeEnabled();

      if (index >= manifest.warmupRuns) {
        previewDurations.push(await latestMeasure(page, 'tsumucode:preview-update'));
        validationDurations.push(await latestMeasure(page, 'tsumucode:validation'));
      }

      const feedback = page.getByRole('dialog', { name: '判定結果' });
      await expect(feedback).toBeVisible();
      await feedback.getByRole('button', { name: '閉じる' }).click();
      await expect(feedback).toBeHidden();
    }

    const result = {
      exerciseId: target.id,
      category: target.category,
      previewP95Ms: percentile95(previewDurations),
      validationP95Ms: percentile95(validationDurations),
      previewDurations,
      validationDurations,
    };
    await testInfo.attach(`${target.id}-performance.json`, {
      body: Buffer.from(JSON.stringify(result, undefined, 2)),
      contentType: 'application/json',
    });

    expect(result.previewP95Ms).toBeLessThanOrEqual(manifest.previewP95Ms);
    expect(result.validationP95Ms).toBeLessThanOrEqual(manifest.validationP95Ms);
  });
}
