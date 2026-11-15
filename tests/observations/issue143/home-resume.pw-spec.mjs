// Draft-only technical observation. Copy to tests/e2e/ in an isolated b930 checkout.
// Do not use as evidence until run on the verified b930 deployment with before/after identity checks.
import { expect, test } from '@playwright/test';
import { editorText, readStoredProgress, replaceEditorText, waitForStoredDraftContent } from '../../e2e/helpers/progress';

const site = 'https://santa928.github.io/tsumucode/';
const course = 'python-basics';
const lesson = 'python-basics-ch01-l01';
const exercise = `${lesson}-e01`;
const route = `${site}#/courses/${course}/lessons/${lesson}/exercises/${exercise}`;
const marker = '\n# synthetic home resume observation\n';

test.describe('Python Home resume, synthetic unfinished draft', () => {
  test.describe.configure({ retries: 0 });
  for (const [kind, articleName, linkName] of [
    ['course', 'Python 値と変数の第一歩', 'Python 値と変数の第一歩：つづきから'],
    ['path', 'Python入門の学習パス', '「Python入門の学習パス」のつづきから'],
  ]) {
    test(`${kind} resumes the saved exercise and source`, async ({ page }) => {
      await beginFromHomeAndOpenExercise(page);
      await expect(page.locator('.cm-content')).toBeVisible();
      const source = (await editorText(page)) + marker;
      await replaceEditorText(page, source);
      await waitForStoredDraftContent(page, source);
      const draft = async () => (await readStoredProgress(page)).drafts.find(row => row.workspaceId === exercise);
      await expect.poll(async () => (await draft())?.files?.['main.py']).toBe(source);
      await page.goto(`${site}#/`);
      const card = page.getByRole('article', { name: articleName, exact: true });
      const resume = card.getByRole('link', { name: linkName, exact: true });
      await expect(resume).toHaveAttribute('href', `#/courses/${course}/lessons/${lesson}/resume`);
      await resume.click();
      await expect(page).toHaveURL(`${site}#/courses/${course}/lessons/${lesson}/exercises/${exercise}`);
      await expect.poll(() => editorText(page)).toBe(source);
      await expect.poll(async () => (await draft())?.files?.['main.py']).toBe(source);
      await page.reload();
      await expect.poll(() => editorText(page)).toBe(source);
      await expect.poll(async () => (await draft())?.files?.['main.py']).toBe(source);
    });
  }
});

// Establish CourseProgress through ordinary Home → Path → slides before editing.
// A fresh context with only a direct exercise draft has no CourseProgress to resume.
async function beginFromHomeAndOpenExercise(page) {
  await page.goto(`${site}#/`);
  await page.getByRole('link', { name: 'Python入門の学習パスの全体を見る', exact: true }).click();
  await page.getByRole('link', { name: 'Python 値と変数の第一歩を始める', exact: true }).click();
  for (const [index, id] of ['s01', 's02', 's03'].entries()) {
    const slideId = `${lesson}-${id}`;
    await expect(page.getByTestId('slide-stage')).toHaveAttribute('data-slide-id', slideId);
    await expect.poll(async () => {
      const saved = (await readStoredProgress(page)).courses.find(row => row.courseId === course);
      return saved?.currentLessonId === lesson && saved?.lessons?.[lesson]?.viewedSlideIds?.includes(slideId) === true;
    }).toBe(true);
    if (index < 2) await page.getByRole('link', { name: '次のスライドへ →', exact: true }).click();
  }
  const saved = (await readStoredProgress(page)).courses.find(row => row.courseId === course);
  expect(saved?.lessons?.[lesson]?.currentComplete).toBe(false);
  await page.getByRole('link', { name: '「変数の値と加算の結果を表示する」のコード演習を始める', exact: true }).click();
  await expect(page).toHaveURL(route);
}
