import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { editorText, readStoredProgress } from './helpers/progress';

const PREVIOUS_RELEASE_BUNDLE = new URL(
  '../fixtures/progress/previous-release-bundle.json',
  import.meta.url,
);
const CURRENT_REVISION = '2026-07-13.1';
const FIRST_COMPLETED_AT = '2026-07-11T09:30:00.000Z';
const COURSE_FIRST_COMPLETED_AT = '2026-07-11T10:00:00.000Z';
const CURRENT_LESSON_ID = 'html-css-ch00-l01';
const CURRENT_EXERCISE_ID = 'html-css-ch00-l01-e01';
const MAPPED_SLIDE_ID = 'html-css-ch00-l01-s02';

test.describe.configure({ timeout: 90_000 });

test('前回Releaseの合成Bundleを実Importし、map・reset・preserveをIndexedDBへ反映する', async ({
  page,
}) => {
  await page.goto('./#/');
  const input = page.getByLabel('進捗Bundleを選ぶ');
  await expect(input).toBeEnabled();
  await input.setInputFiles({
    name: 'previous-release-bundle.json',
    mimeType: 'application/json',
    buffer: await readFile(PREVIOUS_RELEASE_BUNDLE),
  });

  const preview = page.getByRole('region', { name: '読み込み差分' });
  await expect(preview).toBeVisible();
  await expect(preview).toContainText('html-css：追加・1レッスン完了');
  for (const sourceId of [
    'ch00-web-map',
    'lesson-first-heading',
    'exercise-first-heading',
    'rule-h1-exists',
    'rule-h1-count',
    'rule-h1-text',
    'hint-h1-1',
    'hint-h1-2',
    'hint-h1-3',
    'workspace-first-heading',
  ]) {
    await expect(preview).toContainText(sourceId);
  }
  expect((await readStoredProgress(page)).courses).toEqual([]);

  const reloaded = page.waitForEvent('domcontentloaded');
  await page.getByRole('button', { name: 'この内容を読み込む' }).click();
  await reloaded;
  await expect(page.getByRole('heading', { level: 1, name: '学びたいピースを選ぶ' })).toBeVisible();

  const stored = await readStoredProgress(page);
  expect(stored.courses).toHaveLength(1);
  const course = stored.courses[0];
  expect(course).toMatchObject({
    courseId: 'html-css',
    contentRevision: CURRENT_REVISION,
    currentLessonId: CURRENT_LESSON_ID,
    currentComplete: false,
    firstCompletedAt: COURSE_FIRST_COMPLETED_AT,
    lessons: {
      [CURRENT_LESSON_ID]: {
        lessonId: CURRENT_LESSON_ID,
        viewedSlideIds: [MAPPED_SLIDE_ID],
        currentSlideId: MAPPED_SLIDE_ID,
        passedExerciseIds: [],
        passedRuleIds: [],
        currentComplete: true,
        firstCompletedAt: FIRST_COMPLETED_AT,
      },
    },
  });
  expect(course).not.toHaveProperty('currentChapterId');
  expect((course?.['lessons'] as Record<string, unknown>)['lesson-first-heading']).toBeUndefined();

  expect(stored.drafts).toEqual([
    expect.objectContaining({
      key: `html-css:${CURRENT_EXERCISE_ID}`,
      courseId: 'html-css',
      lessonId: CURRENT_LESSON_ID,
      exerciseId: CURRENT_EXERCISE_ID,
      workspaceId: CURRENT_EXERCISE_ID,
      contentRevision: CURRENT_REVISION,
      files: { 'index.html': '<h1>古い教材から引き継ぐ見出し</h1>' },
      revealedHintIds: [],
      reviewSlideId: MAPPED_SLIDE_ID,
      reviewScrollOffset: 120,
      updatedAt: '2026-07-11T10:10:00.000Z',
    }),
  ]);
  expect(stored.quarantined).toHaveLength(10);
  const quarantined = JSON.stringify(stored.quarantined);
  for (const sourceId of [
    'ch00-web-map',
    'lesson-first-heading',
    'exercise-first-heading',
    'rule-h1-exists',
    'rule-h1-count',
    'rule-h1-text',
    'hint-h1-1',
    'hint-h1-2',
    'hint-h1-3',
    'workspace-first-heading',
  ]) {
    expect(quarantined).toContain(sourceId);
  }
  expect(quarantined).not.toContain('slide-html-role');
  expect(stored.backups).toEqual([expect.objectContaining({ reason: 'before-import' })]);

  await page.goto(
    `./#/courses/html-css/lessons/${CURRENT_LESSON_ID}/exercises/${CURRENT_EXERCISE_ID}`,
  );
  await expect(page.getByTestId('code-workspace')).toBeVisible();
  await expect.poll(() => editorText(page)).toContain('古い教材から引き継ぐ見出し');
});
