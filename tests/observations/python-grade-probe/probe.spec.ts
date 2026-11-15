import { readFile, writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { localConsoleGradeRunHash } from '../../e2e/helpers/localConsoleDiagnostics';
import { readStoredProgress, replaceEditorText } from '../../e2e/helpers/progress';
import { markProbeStage } from './probe-stage-lib.mjs';

const exerciseId = 'python-basics-ch01-l02-e01';
const lessonId = 'python-basics-ch01-l02';
const fixture = `content/python-basics/chapters/python-basics-ch01/lessons/${lessonId}/exercises/${exerciseId}/fixtures/hardcoded.py`;

test('one normal fixed-source hardcoded grade; observation remains unknown when no stage is sampled', async ({
  page,
}) => {
  markProbeStage('spec-started');
  test.setTimeout(240_000);
  await page.goto(`/#/courses/python-basics/lessons/${lessonId}/exercises/${exerciseId}`);
  markProbeStage('navigation-complete');
  await expect(page.locator('.cm-content')).toBeVisible();
  await expect(page.getByRole('button', { name: '判定する', exact: true })).toBeEnabled({
    timeout: 30_000,
  });
  expect((await page.getByLabel('実行環境').textContent())?.includes('CPython 3.14.2')).toBe(true);
  markProbeStage('editor-ready');
  await replaceEditorText(page, await readFile(fixture, 'utf8'));
  await page.getByLabel('実行前の入力（1行につきinput 1回）').fill('Sora');
  markProbeStage('fixture-set');
  const accepted = page
    .waitForResponse(
      (response) =>
        new URL(response.url()).origin === 'http://127.0.0.1:4173' &&
        new URL(response.url()).pathname === '/api/grades' &&
        response.request().method() === 'POST',
      { timeout: 30_000 },
    )
    .then(async (response) => {
      expect(response.status() === 202).toBe(true);
      markProbeStage('grade-accepted');
      const runHash = localConsoleGradeRunHash((await response.json()) as unknown);
      if (runHash === 'unknown') throw new Error('grade identity unavailable');
      await writeFile('/exchange/grade-hash.json', JSON.stringify({ runHash }), {
        flag: 'wx',
        mode: 0o600,
      });
      markProbeStage('identity-saved');
    });
  markProbeStage('grade-clicking');
  await page.getByRole('button', { name: '判定する', exact: true }).click();
  const visible = expect(page.getByRole('dialog')).toBeVisible({ timeout: 30_000 });
  await Promise.all([accepted, visible]);
  markProbeStage('dialog-visible');
  await expect
    .poll(async () => {
      const draft = (await readStoredProgress(page)).drafts.find(
        (row) => row['workspaceId'] === exerciseId,
      );
      const history = draft?.['validationHistory'] as
        { status: string; checks: { passed: boolean; ruleId: string }[] }[] | undefined;
      return history?.at(-1)?.status === 'incomplete';
    })
    .toBe(true);
  const draft = (await readStoredProgress(page)).drafts.find(
    (row) => row['workspaceId'] === exerciseId,
  );
  const history = draft?.['validationHistory'] as
    { checks: { passed: boolean; ruleId: string }[] }[] | undefined;
  const failed = history?.at(-1)?.checks.filter((check) => !check.passed);
  expect(failed?.length === 1 && failed[0]?.ruleId === 'python-basics-ch01-l02-e01-r01').toBe(true);
  markProbeStage('checks-passed');
});
