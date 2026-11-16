import { existsSync, readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { z } from 'zod';
import {
  loadAuthoringCourse,
  type AuthoringExercise,
} from '../../../scripts/content/compileCourse';
import { InventorySchema, PlanSchema } from '../../../scripts/release/v2/schema';
import { readStoredProgress } from './progress';
import { selectAllAndCopyEditorDocument } from './editorDocument';
import { testBasePath } from './testBasePath';
import { pythonFixedFixtures } from '../../../src/core/runtime/pythonFixedFixtures.mjs';
import { withManifestDiagnostic, type ManifestDiagnostic } from './manifestDiagnostic';
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
    const editor = page.getByRole('textbox', {
      name: file.path + ' のコードエディター',
      exact: true,
    });
    await expect(editor).toHaveAttribute('contenteditable', 'true', { timeout: 15000 });
    await editor.click();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.insertText(file.content);
    expect(await selectAllAndCopyEditorDocument(page, editor)).toBe(file.content);
  }
}
async function closeFeedback(page: Page) {
  const dialog = page.getByRole('dialog', { name: '判定結果' });
  if (await dialog.isVisible()) {
    // Persisted history can be visible before the remaining progress write releases busy.
    await expect(dialog.getByRole('button', { name: '閉じる', exact: true })).toBeEnabled({
      timeout: 15000,
    });
    await dialog.getByRole('button', { name: '閉じる', exact: true }).click();
    await expect(dialog).toBeHidden({ timeout: 15000 });
  }
}
async function browserGrade(
  page: Page,
  courseId: string,
  exercise: AuthoringExercise,
  pass: boolean,
  diagnostic: ManifestDiagnostic,
  round: number,
) {
  const draft = async () =>
    (await readStoredProgress(page)).drafts.find(
      (row) => row['courseId'] === courseId && row['workspaceId'] === exercise.workspaceId,
    );
  const history = async () =>
    z.array(z.object({ status: z.string() })).parse((await draft())?.['validationHistory'] ?? []);
  diagnostic.step('history-before', round);
  const before = (await history()).length;
  diagnostic.history(before, before, undefined);
  if (exercise.runtime?.kind === 'python') {
    const profile = exercise.runtime.profile;
    if (profile === 'function-return-scope-v1') {
      throw new Error('Retired Python exercise profile: function-return-scope-v1');
    }
    const input = page.getByLabel('実行前の入力（1行につきinput 1回）');
    if (await input.isVisible())
      await input.fill((pythonFixedFixtures(profile)[0]?.inputLines ?? []).join('\n'));
  }
  diagnostic.step('click', round);
  await page.getByRole('button', { name: '判定する', exact: true }).click();
  diagnostic.step('history', round);
  const actual = expect.poll(
    async () => {
      const rows = await history();
      const status = rows.length > before ? rows.at(-1)?.status : undefined;
      diagnostic.history(before, rows.length, status);
      return status;
    },
    { timeout: 45000 },
  );
  if (pass) await actual.toBe('pass');
  else await actual.toMatch(/^(?:incomplete|code-error)$/u);
  diagnostic.step('feedback', round);
  // 履歴保存の後に進捗保存と画面遷移が続くため、可視の結果まで待つ。
  await expect(async () => {
    const feedback = await page.getByRole('dialog', { name: '判定結果' }).isVisible();
    const completed =
      pass &&
      new URL(page.url()).hash.endsWith('/completion') &&
      (await page.getByTestId('learning-completion').isVisible());
    expect(feedback || completed).toBe(true);
  }).toPass({ timeout: 15000 });
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
        await withManifestDiagnostic(
          async (diagnostic) => {
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
              let round = 0;
              const open = async () => {
                diagnostic.step('opening', round);
                await page.goto(route);
                if (native) {
                  const connect = page.getByRole('button', { name: '環境へ接続', exact: true });
                  if (await connect.isVisible()) await connect.click();
                }
                await expect(page.locator('.cm-content').first()).toBeVisible({ timeout: 15000 });
                if (expected.runtimeKind !== 'next')
                  await expect(
                    page.getByRole('button', { name: '判定する', exact: true }),
                  ).toBeEnabled({ timeout: 15000 });
              };
              const grade = async (pass: boolean) => {
                round += 1;
                if (expected.runtimeKind === 'next') await nativeGrade(page, pass);
                else await browserGrade(page, course.id, exercise, pass, diagnostic, round);
              };
              await open();
              diagnostic.step('writing-starter', round);
              await writeFiles(page, exercise, false);
              await grade(false);
              await open();
              diagnostic.step('writing-solution', round);
              await writeFiles(page, exercise, true);
              await grade(true);
              await open();
              diagnostic.step('writing-starter', round);
              await writeFiles(page, exercise, false);
              await grade(false);
              await open();
              diagnostic.step('writing-solution', round);
              await writeFiles(page, exercise, true);
              await grade(true);
              // 合格すると完了画面へ進む。保存した演習へ戻ってからreloadを検証する。
              await open();
              const files = new Map(
                [...exercise.files, ...exercise.solutionFiles].map((file) => [file.path, file]),
              );
              const expectSavedFiles = async () => {
                for (const file of files.values()) {
                  const tab = page.getByRole('tab', { name: file.path, exact: true });
                  await tab.click();
                  await expect(tab).toHaveAttribute('aria-selected', 'true');
                  const editor = page.getByRole('textbox', {
                    name: file.path + ' のコードエディター',
                    exact: true,
                  });
                  expect(await selectAllAndCopyEditorDocument(page, editor)).toBe(file.content);
                }
                // Draftはreadonlyを含むworkspace全filesを保存する。別workspaceの一致は使わない。
                await expect
                  .poll(
                    async () =>
                      (await readStoredProgress(page)).drafts.find(
                        (row) =>
                          row['courseId'] === course.id &&
                          row['workspaceId'] === exercise.workspaceId,
                      )?.['files'],
                  )
                  .toEqual(
                    Object.fromEntries(
                      [...files.values()].map((file) => [file.path, file.content]),
                    ),
                  );
              };
              diagnostic.step('saved-files', round);
              await expectSavedFiles();
              await page.reload();
              await expect(page.locator('.cm-content').first()).toBeVisible({ timeout: 15000 });
              await expectSavedFiles();
              if (expected.runtimeKind === 'next') {
                const stop = page.getByRole('button', { name: '停止', exact: true });
                if (await stop.isEnabled()) await stop.click();
              }
            }
          },
          (description) => {
            test.info().annotations.push({ type: 'manifest-learning-diagnostic', description });
          },
        );
      },
    );
}
