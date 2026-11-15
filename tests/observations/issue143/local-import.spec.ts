import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { editorText, readStoredProgress } from '../../e2e/helpers/progress';

const lesson = 'python-basics-ch02-l01';
const exercise = `${lesson}-e01`;
const jsonPath = '/p6-input/synthetic-progress.json';
// New same-run synthetic Pages export only; not the old P4 evidence or its fixed hash.
const expectedHash = process.env.P6_RUN_EXPORT_SHA256;
if (!expectedHash || !/^[a-f0-9]{64}$/u.test(expectedHash)) throw new Error('Missing same-run synthetic export hash');
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

test('P6 new same-run synthetic Pages export imports into Local and runs the Python project', async ({ page }) => {
  // Same timeout as the existing fixed two-file Local exercise test.
  test.setTimeout(180_000);
  const bytes = await readFile(jsonPath);
  expect(hash(bytes)).toBe(expectedHash);
  const original = JSON.parse(bytes.toString('utf8'));
  const source = original.drafts[`python-basics:${exercise}`];
  const originalLesson = original.courses['python-basics'].lessons[lesson];
  expect(Object.keys(original.drafts)).toEqual([`python-basics:${exercise}`]);
  expect(Object.keys(source.files).sort()).toEqual(['lesson_tools.py', 'main.py']);
  expect(source.validationHistory).toHaveLength(1);
  expect(source.validationHistory[0].status).toBe('pass');
  expect(source.lastPassingSnapshots[exercise].files).toEqual(source.files);
  expect(originalLesson.currentComplete).toBe(true);

  await page.goto('/#/');
  expect(new URL(page.url()).origin).toBe('http://127.0.0.1:4173');
  const initial = await readStoredProgress(page);
  expect(initial.courses).toHaveLength(0);
  expect(initial.drafts).toHaveLength(0);
  await page.getByLabel('書き出した学習データを読み込む').setInputFiles({
    name: 'synthetic-progress.json', mimeType: 'application/json', buffer: bytes,
  });
  await expect(page.getByRole('region', { name: '読み込み差分' })).toBeVisible();
  const reload = page.waitForEvent('domcontentloaded');
  await page.getByRole('button', { name: 'この内容を読み込む', exact: true }).click();
  await reload;
  const draft = async () => (await readStoredProgress(page)).drafts.find(row => row['workspaceId'] === exercise);
  await expect.poll(async () => (await draft())?.['files']).toEqual(source.files);
  expect((await draft())?.['validationHistory']).toEqual(source.validationHistory);
  expect((await draft())?.['lastPassingSnapshots']).toEqual(source.lastPassingSnapshots);
  const course = (await readStoredProgress(page)).courses.find(row => row['courseId'] === 'python-basics');
  expect((course?.['lessons'] as Record<string, unknown>)?.[lesson]).toEqual(originalLesson);

  await page.goto(`/#/courses/python-basics/lessons/${lesson}/exercises/${exercise}`);
  await expect(page.getByLabel('実行環境')).toContainText('ローカル CPython');
  for (const path of ['main.py', 'lesson_tools.py']) {
    await page.getByRole('tab', { name: path, exact: true }).click();
    await expect.poll(() => editorText(page)).toBe(source.files[path]);
  }
  const input = page.getByLabel('実行前の入力（1行につきinput 1回）');
  await expect(input).toHaveValue('');
  await input.fill('3\n5');
  await page.getByRole('button', { name: 'プレビューを更新', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Console出力', exact: true }).getByText('8', { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByLabel('実行環境')).toContainText('CPython 3.14.2');
  expect((await draft())?.['validationHistory']).toEqual(source.validationHistory);
  expect((await draft())?.['lastPassingSnapshots']).toEqual(source.lastPassingSnapshots);
  expect((await draft())?.['files']).toEqual(source.files);
  const grade = page.getByRole('button', { name: '判定する', exact: true });
  await expect(grade).toBeEnabled({ timeout: 30_000 });
  const localGrade = page.waitForResponse(response =>
    new URL(response.url()).pathname === '/api/grades' &&
    response.request().method() === 'POST', { timeout: 30_000 });
  await grade.click();
  expect((await localGrade).ok()).toBe(true);
  await expect(page.getByRole('heading', { name: 'ピースがはまりました', exact: true })).toBeVisible({ timeout: 30_000 });
  expect((await draft())?.['files']).toEqual(source.files);
  expect(hash(await readFile(jsonPath))).toBe(expectedHash);
});
