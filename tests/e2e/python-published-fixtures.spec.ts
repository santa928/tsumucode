/** 公開候補のPython演習を実UIで採点し、観測できた入力だけを資格検証へ渡す。 */
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { loadAuthoringCourse } from '../../scripts/content/compileCourse';
import { fixtureFiles } from '../../scripts/release/v2/fixtureSource';
import { createPythonFixtureObservations } from '../../scripts/release/v2/pythonCoverage';
import { readStoredProgress, replaceEditorText } from './helpers/progress';
import { testBasePath } from './helpers/testBasePath';

const source = await Promise.all(
  ['python-practice', 'python-oop'].map((id) => loadAuthoringCourse(`content/${id}`)),
);
const base = testBasePath();

// An all-draft catalog still declares a real test; it claims no fixture observations.
if (source.every((course) => course.runtime.publicationStatus !== 'published')) {
  test('no published Python fixture courses', () => {});
}

async function savedDraft(page: Page, exerciseId: string) {
  return (await readStoredProgress(page)).drafts.find(
    (value) => value['workspaceId'] === exerciseId,
  );
}

async function observeFixture(
  page: Page,
  info: TestInfo,
  authoring: (typeof source)[number],
  lessonId: string,
  exercise: (typeof source)[number]['exercises'][number],
  fixture: (typeof source)[number]['exercises'][number]['fixtures'][number],
) {
  const mode = info.project.name === '' ? 'cpython' : 'pyodide';
  const files = fixtureFiles(exercise, fixture.files);
  if (Object.keys(files).length !== 1 || typeof files['main.py'] !== 'string')
    throw Error('Python fixture requires an unsupported workspace layout');
  if (fixture.faultInjection || (fixture.inputLines?.length ?? 0) !== 0)
    throw Error('Python fixture requires an unsupported injection or input');
  const expected =
    mode === 'cpython'
      ? (fixture.expectedLocalStatus ?? fixture.expectedStatus)
      : fixture.expectedStatus;
  const button = page.getByRole('button', { name: '判定する', exact: true });
  await expect(button).toBeEnabled({ timeout: 30_000 });
  await replaceEditorText(page, files['main.py']);
  await expect.poll(async () => (await savedDraft(page, exercise.id))?.['files']).toEqual(files);
  const before =
    ((await savedDraft(page, exercise.id))?.['validationHistory'] as unknown[] | undefined) ?? [];
  const ungradedAlert = page.getByRole('alert').filter({ hasText: /採点していません/ });
  if (expected === 'system-error') {
    // A stale preview error must never be counted as a new validation result.
    await expect(ungradedAlert).toHaveCount(0);
    await button.evaluate((node) => {
      document.documentElement.dataset['pythonFixtureValidationStarted'] = 'no';
      const observer = new MutationObserver((records) => {
        if (
          records.some((record) => record.attributeName === 'disabled' && record.oldValue === null)
        ) {
          document.documentElement.dataset['pythonFixtureValidationStarted'] = 'yes';
          observer.disconnect();
        }
      });
      observer.observe(node, {
        attributes: true,
        attributeOldValue: true,
        attributeFilter: ['disabled'],
      });
    });
  }
  await button.click();
  let observed: 'pass' | 'incomplete' | 'code-error' | 'system-error';
  if (expected === 'system-error') {
    await expect
      .poll(() => page.locator('html').getAttribute('data-python-fixture-validation-started'))
      .toBe('yes');
    const unsupportedMessage =
      mode === 'pyodide'
        ? 'このLessonの採点範囲外です。採点していません。'
        : authoring.runtime.id === 'python-oop'
          ? 'このLessonの実行範囲外です。実行せず採点していません。'
          : 'CPythonで実行しましたが、このLessonの採点範囲外です。採点していません。';
    await expect(ungradedAlert).toHaveText(unsupportedMessage, { timeout: 30_000 });
    await expect(button).toBeEnabled({ timeout: 30_000 });
    expect((await savedDraft(page, exercise.id))?.['validationHistory'] ?? []).toEqual(before);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    observed = 'system-error';
  } else {
    if (expected === 'pass' && exercise.kind === 'guided-project')
      await expect(
        page.getByRole('heading', { name: 'ピースがはまりました', exact: true }),
      ).toBeVisible({ timeout: 30_000 });
    else await expect(page.getByRole('dialog')).toBeVisible({ timeout: 30_000 });
    await expect
      .poll(async () => {
        const history = (await savedDraft(page, exercise.id))?.['validationHistory'] as
          { status: string }[] | undefined;
        return history?.at(-1)?.status;
      })
      .toBe(expected);
    const history = (await savedDraft(page, exercise.id))?.['validationHistory'] as
      { status: string; checks: { passed: boolean; ruleId: string }[] }[] | undefined;
    if (!history || history.length !== before.length + 1 || history.at(-1)?.status !== expected)
      throw Error('Actual Python result was not recorded');
    expect(
      history
        .at(-1)
        ?.checks.filter(({ passed }) => !passed)
        .map(({ ruleId }) => ruleId),
    ).toEqual(expected === 'code-error' ? [] : fixture.expectedFeedbackRuleIds);
    observed = expected;
    if (expected === 'pass' && exercise.kind === 'guided-project') {
      await page.goto(
        `${base}#/courses/${authoring.runtime.id}/lessons/${lessonId}/exercises/${exercise.id}`,
      );
      await expect(page.locator('.cm-content')).toBeVisible();
    } else await page.getByRole('button', { name: '閉じる', exact: true }).click();
  }
  await expect.poll(async () => (await savedDraft(page, exercise.id))?.['files']).toEqual(files);
  await info.attach('release-fixtures-v1', {
    body: JSON.stringify(
      createPythonFixtureObservations(authoring, {
        exerciseId: exercise.id,
        fixtureId: fixture.id,
        mode,
        files,
        ...(mode === 'pyodide' ? { inputLines: fixture.inputLines } : {}),
        actualStatus: observed,
      }),
    ),
    contentType: 'application/json',
  });
}

for (const authoring of source) {
  if (authoring.runtime.publicationStatus !== 'published') continue;
  for (const phase of authoring.runtime.phases)
    for (const chapter of phase.chapters)
      for (const lesson of chapter.lessons)
        for (const reference of lesson.exercises) {
          const exercise = authoring.exercises.find((item) => item.id === reference.id);
          if (!exercise || exercise.runtime?.kind !== 'python' || !exercise.fixtures.length)
            throw Error('Missing authored Python fixture source');
          for (let offset = 0; offset < exercise.fixtures.length; offset += 4) {
            const fixtures = exercise.fixtures.slice(offset, offset + 4);
            test(
              `${exercise.id} published fixtures ${String(offset + 1)}-${String(offset + fixtures.length)}`,
              { annotation: { type: 'release-exercise', description: exercise.id } },
              async ({ page }, info) => {
                test.setTimeout(180_000);
                await page.goto(
                  `${base}#/courses/${authoring.runtime.id}/lessons/${lesson.id}/exercises/${exercise.id}`,
                );
                await expect(page.locator('.cm-content')).toBeVisible();
                const environment = page.getByLabel('実行環境', { exact: true });
                await expect(environment).toContainText(
                  info.project.name === '' ? 'ローカル CPython' : 'ブラウザで実行',
                );
                for (const fixture of fixtures)
                  await test.step(fixture.id, () =>
                    observeFixture(page, info, authoring, lesson.id, exercise, fixture),
                  );
              },
            );
          }
        }
}
