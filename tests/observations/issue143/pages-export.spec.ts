import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test'; import { z } from 'zod'; const syntheticProgressSchema = z.object({ drafts: z.record(z.string(), z.object({ files: z.record(z.string(), z.string()), validationHistory: z.array(z.object({ status: z.string() }).loose()), lastPassingSnapshots: z.record(z.string(), z.object({ files: z.record(z.string(), z.string()) }).loose()) }).loose()), courses: z.record(z.string(), z.object({ lessons: z.record(z.string(), z.object({ currentComplete: z.boolean() }).loose()) }).loose()) }).loose();
import { readStoredProgress, replaceEditorText, waitForStoredDraftContent } from '../../e2e/helpers/progress';

const site = 'https://santa928.github.io/tsumucode/';
const lesson = 'python-basics-ch02-l01';
const exercise = `${lesson}-e01`;
const files: Record<string, string> = {
  'main.py': '# synthetic observation\nfrom lesson_tools import add, parse_number\ntexts = [input(), input()]\ntotal = 0\ntry:\n    for text in texts:\n        total = add(total, parse_number(text))\n    print(total)\nexcept ValueError:\n    print("整数を入力してください")\nprint("終了")\n',
  'lesson_tools.py': '# synthetic observation\ndef add(left, right):\n    return left + right\n\ndef parse_number(text):\n    return int(text)\n',
};

test('export synthetic Pages project through the normal UI', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto(`${site}#/courses/python-basics/lessons/${lesson}/exercises/${exercise}`);
  await expect(page.getByRole('button', { name: '判定する', exact: true })).toBeEnabled({ timeout: 30_000 });
  for (const [path, value] of Object.entries(files)) {
    await page.getByRole('tab', { name: path, exact: true }).click();
    await replaceEditorText(page, value);
    await waitForStoredDraftContent(page, value);
  }
  await page.getByLabel('実行前の入力（1行につきinput 1回）').fill('310719\n502819');
  await page.getByRole('button', { name: '判定する', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'ピースがはまりました', exact: true })).toBeVisible({ timeout: 30_000 });
  const draft = (await readStoredProgress(page)).drafts.find(row => row['workspaceId'] === exercise);
  expect(draft?.['files']).toEqual(files);
  await page.goto(`${site}#/`);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '全コースの進捗と下書きを書き出す', exact: true }).click();
  await (await download).saveAs('/exchange/synthetic-progress.json');
  const raw = await readFile('/exchange/synthetic-progress.json');
  expect(raw.length).toBeGreaterThan(0);
  expect(raw.toString('utf8')).not.toContain('310719');
  expect(raw.toString('utf8')).not.toContain('502819');
  const data = syntheticProgressSchema.parse(JSON.parse(raw.toString('utf8')) as unknown);
  const key = `python-basics:${exercise}`;
  expect(Object.keys(data.drafts)).toEqual([key]);
  expect(data.drafts[key]!.files).toEqual(files);
  expect(data.drafts[key]!.validationHistory).toHaveLength(1);
  expect(data.drafts[key]!.validationHistory[0]!.status).toBe('pass');
  expect(data.drafts[key]!.lastPassingSnapshots[exercise]!.files).toEqual(files);
  expect(data.courses['python-basics']!.lessons[lesson]!.currentComplete).toBe(true);
});
