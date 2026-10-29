import { existsSync, readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { z } from 'zod';
import {
  loadAuthoringCourse,
  type AuthoringExercise,
} from '../../../scripts/content/compileCourse';
import { InventorySchema, PlanSchema } from '../../../scripts/release/v2/schema';
import { editorText, replaceEditorText, readStoredProgress } from './progress';
import { testBasePath } from './testBasePath';
import { pythonFixedFixtures } from '../../../src/core/runtime/pythonFixedFixtures.mjs';
const snapshotFile = '.release-v2/preparation.json';
async function writeFiles(page: Page, exercise: AuthoringExercise, solution: boolean) {
  const merged = new Map(
    [...exercise.files, ...(solution ? exercise.solutionFiles : [])].map((file) => [
      file.path,
      file,
    ]),
  );
  for (const file of merged.values()) {
    const original = exercise.files.find((row) => row.path === file.path);
    if (!original) throw Error('Missing UI file creation capability: ' + file.path);
    if (!original.editable) {
      if (original.content !== file.content) throw Error('Read-only solution differs');
      continue;
    }
    const tab = page.getByRole('tab', { name: file.path, exact: true });
    await tab.click();
    await expect(tab).toHaveAttribute('aria-selected', 'true');
    await expect(
      page.getByRole('textbox', { name: file.path + ' のコードエディター', exact: true }),
    ).toHaveAttribute('contenteditable', 'true', { timeout: 15000 });
    await replaceEditorText(page, file.content);
    await expect.poll(() => editorText(page)).toBe(file.content);
  }
}
async function closeFeedback(page: Page) {
  const dialog = page.getByRole('dialog', { name: '判定結果' });
  if (await dialog.isVisible()) {
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden({ timeout: 15000 });
  }
}
async function browserGrade(
  page: Page,
  courseId: string,
  exercise: AuthoringExercise,
  pass: boolean,
) {
  const draft = async () =>
    (await readStoredProgress(page)).drafts.find(
      (row) => row['courseId'] === courseId && row['workspaceId'] === exercise.workspaceId,
    );
  const history = async () =>
    z.array(z.object({ status: z.string() })).parse((await draft())?.['validationHistory'] ?? []);
  const before = (await history()).length;
  if (exercise.runtime?.kind === 'python') {
    const input = page.getByLabel('実行前の入力（1行につきinput 1回）');
    if (await input.isVisible())
      await input.fill(
        (pythonFixedFixtures(exercise.runtime.profile)[0]?.inputLines ?? []).join('\n'),
      );
  }
  await page.getByRole('button', { name: '判定する', exact: true }).click();
  const actual = expect.poll(
    async () => {
      const rows = await history();
      return rows.length > before ? rows.at(-1)?.status : undefined;
    },
    { timeout: 45000 },
  );
  if (pass) await actual.toBe('pass');
  else await actual.toMatch(/^(?:incomplete|code-error)$/u);
  await closeFeedback(page);
}
async function nativeGrade(page: Page, pass: boolean) {
  const apply = page.getByRole('button', { name: '保存して実行へ反映', exact: true });
  if (await apply.isVisible()) await apply.click();
  else await page.getByRole('button', { name: '保存して起動', exact: true }).click();
  await expect(page.getByText(/^実行状態:/u)).toContainText('実行可能', { timeout: 30000 });
  await page.getByRole('button', { name: '実サーバーで判定', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: pass ? '判定結果: 合格' : '判定結果: 未達成', exact: true }),
  ).toBeVisible({ timeout: 30000 });
}
/** New lessons only; synthetic authoring solutions prove automated UI behavior, never novice observation. */
export function declareManifestLearning(native: boolean) {
  if (!existsSync(snapshotFile)) return;
  const snapshot = z
    .object({ plan: PlanSchema, inventory: InventorySchema })
    .parse(JSON.parse(readFileSync(snapshotFile, 'utf8')) as unknown);
  const keys = [
    ...new Set(
      snapshot.plan.targets
        .filter((row) => row.kind === 'learning-engine')
        .map((row) => row.courseId + '/' + row.lessonId),
    ),
  ];
  const selected = keys
    .map((key) => {
      const [courseId, lessonId] = key.split('/');
      const course = snapshot.inventory.courses.find((row) => row.id === courseId),
        lesson = course?.lessons.find((row) => row.id === lessonId);
      if (!course || !lesson) throw Error('Unknown learning lesson');
      return { course, lesson, key };
    })
    .filter(
      ({ lesson }) =>
        lesson.exercises.some((exercise) => exercise.runtimeKind === 'next') === native,
    );
  test('manifest learning inventory matches this execution capability', () => {
    expect(selected.map(({ key }) => key)).toEqual(
      keys.filter((key) => {
        const [courseId, lessonId] = key.split('/');
        return (
          snapshot.inventory.courses
            .find((row) => row.id === courseId)!
            .lessons.find((row) => row.id === lessonId)!
            .exercises.some((exercise) => exercise.runtimeKind === 'next') === native
        );
      }),
    );
  });
  for (const { course, lesson, key } of selected)
    test(
      key + ' actual learning UI',
      { annotation: { type: 'release-lesson', description: key } },
      async ({ page }) => {
        test.setTimeout(lesson.exercises.length * 180000);
        const authoring = await loadAuthoringCourse('content/' + course.id);
        if (!lesson.exercises.length) throw Error('Missing non-exercise reading UI capability');
        for (const expected of lesson.exercises) {
          const exercise = authoring.exercises.find((row) => row.id === expected.id);
          if (!exercise) throw Error('Missing learning exercise');
          const route =
            testBasePath() +
            '#/courses/' +
            course.id +
            '/lessons/' +
            lesson.id +
            '/exercises/' +
            exercise.id;
          const open = async () => {
            await page.goto(route);
            if (native) {
              const connect = page.getByRole('button', { name: '環境へ接続', exact: true });
              if (await connect.isVisible()) await connect.click();
            }
            await expect(page.locator('.cm-content').first()).toBeVisible({ timeout: 15000 });
            if (expected.runtimeKind !== 'next')
              await expect(page.getByRole('button', { name: '判定する', exact: true })).toBeEnabled(
                { timeout: 15000 },
              );
          };
          const grade = async (pass: boolean) => {
            if (expected.runtimeKind === 'next') await nativeGrade(page, pass);
            else await browserGrade(page, course.id, exercise, pass);
          };
          await open();
          await writeFiles(page, exercise, false);
          await grade(false);
          await open();
          await writeFiles(page, exercise, true);
          await grade(true);
          await open();
          await writeFiles(page, exercise, false);
          await grade(false);
          await open();
          await writeFiles(page, exercise, true);
          await grade(true);
          await page.reload();
          await expect(page.locator('.cm-content').first()).toBeVisible({ timeout: 15000 });
          const files = new Map(
            [...exercise.files, ...exercise.solutionFiles].map((file) => [file.path, file]),
          );
          for (const file of files.values()) {
            await page.getByRole('tab', { name: file.path, exact: true }).click();
            await expect.poll(() => editorText(page)).toBe(file.content);
          }
          if (expected.runtimeKind === 'next') {
            const stop = page.getByRole('button', { name: '停止', exact: true });
            if (await stop.isEnabled()) await stop.click();
          }
        }
      },
    );
}
