/** Full authored fixtures are Chromium scope; cross-browser release UI smoke stays in its original file. */
import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { parse } from 'yaml';
import { attachPythonFixtureCoverage } from './helpers/pythonFixtureCoverage';
import { readStoredProgress, replaceEditorText } from './helpers/progress';
import { testBasePath } from './helpers/testBasePath';
const lessonId = 'python-basics-ch01-l01';
const exerciseId = lessonId + '-e01';
const sourceRoot = `content/python-basics/chapters/python-basics-ch01/lessons/${lessonId}/exercises/${exerciseId}`;
const exerciseRoute = `${testBasePath()}#/courses/python-basics/lessons/${lessonId}/exercises/${exerciseId}`;
async function draft(page: Page) {
  return (await readStoredProgress(page)).drafts.find(
    (value) => value['courseId'] === 'python-basics',
  );
}

test(
  '公開Pythonの10Fixtureは実出力と2Ruleで採点する',
  { annotation: { type: 'release-exercise', description: exerciseId } },
  async ({ page }, info) => {
    test.setTimeout(180_000);
    const exercise = parse(await readFile(`${sourceRoot}/exercise.yaml`, 'utf8')) as {
      fixtures: {
        id: string;
        expectedStatus: string;
        expectedFeedbackRuleIds: string[];
        files: { source: string }[];
      }[];
    };
    await page.goto(exerciseRoute);
    await expect(page.locator('.cm-content')).toBeVisible();
    for (const fixture of exercise.fixtures) {
      const source = await readFile(`${sourceRoot}/${fixture.files[0]!.source}`, 'utf8');
      await replaceEditorText(page, source);
      await page.getByRole('button', { name: '判定する', exact: true }).click();
      await expect(page.getByRole('dialog')).toBeVisible({ timeout: 30_000 });
      await expect
        .poll(async () => {
          const history = (await draft(page))?.['validationHistory'] as
            { status: string; checks: { passed: boolean; ruleId: string }[] }[] | undefined;
          return history?.at(-1);
        })
        .toMatchObject({ status: fixture.expectedStatus });
      const history = (await draft(page))?.['validationHistory'] as {
        checks: { passed: boolean; ruleId: string }[];
      }[];
      expect(
        history
          .at(-1)
          ?.checks.filter(({ passed }) => !passed)
          .map(({ ruleId }) => ruleId),
        fixture.id,
      ).toEqual(fixture.expectedFeedbackRuleIds);
      const close = page.getByRole('button', {
        name: '閉じる',
        exact: true,
      });
      await close.click();
      await attachPythonFixtureCoverage(info, {
        exerciseId,
        fixtureId: fixture.id,
        mode: 'pyodide',
        files: { 'main.py': source },
        actualStatus: fixture.expectedStatus as
          'pass' | 'incomplete' | 'code-error' | 'system-error',
      });
      await expect(page.locator('iframe[title="Python実行環境"]')).toHaveCount(0);
    }
  },
);
