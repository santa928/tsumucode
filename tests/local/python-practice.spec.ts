import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { unzipSync, strFromU8 } from 'fflate';
import {
  replaceEditorText,
  readStoredProgress,
  waitForStoredDraftContent,
} from '../e2e/helpers/progress';

const route = (lesson: string) =>
  `/#/courses/python-basics/lessons/${lesson}/exercises/${lesson}-e01`;
async function draft(page: Page, id: string) {
  return (await readStoredProgress(page)).drafts.find(
    (value) => value['workspaceId'] === `${id}-e01`,
  );
}

test('対話練習は同runへ入力し、空行/EOF/中止を分けて進捗と成功版を保持する', async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  const id = 'python-basics-ch01-l02';
  const source = 'name = input()\nprint(name)\n';
  await page.goto(route(id));
  await expect(page.getByRole('button', { name: '判定する', exact: true })).toBeEnabled({
    timeout: 30_000,
  });
  await replaceEditorText(page, source);
  await page.getByLabel('実行前の入力（1行につきinput 1回）').fill('採点に使わない任意入力');
  await page.getByRole('button', { name: '判定する', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'できました', exact: true })).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole('button', { name: '閉じる', exact: true }).click();
  const before = await draft(page, id);
  const progressBefore = (await readStoredProgress(page)).courses;
  const panel = page.getByRole('region', { name: 'CPythonの練習実行', exact: true });
  const input = panel.getByLabel('練習へ送る1行（空欄は空文字列）');
  const consoleOutput = panel.getByRole('region', { name: '練習のConsole出力' });
  const marker = '同じrunだけで使う196入力';
  await panel.getByRole('button', { name: '練習実行', exact: true }).click();
  await expect(input).toBeFocused({ timeout: 10_000 });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: info.outputPath('python-practice-waiting.png'), fullPage: true });
  await expect(page.getByRole('button', { name: '判定する', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: '実行を停止', exact: true })).toHaveCount(0);
  await input.fill(marker);
  await input.press('Enter');
  await expect(panel.getByText('正常終了しました。未採点です。', { exact: true })).toBeVisible();
  await expect(consoleOutput).toContainText(marker);
  await expect(input).toHaveCount(0);
  await expect(panel.getByRole('button', { name: '練習実行', exact: true })).toBeEnabled();
  await expect(panel.getByRole('button', { name: '練習実行', exact: true })).toBeFocused();
  expect((await draft(page, id))?.['validationHistory']).toEqual(before?.['validationHistory']);
  expect((await draft(page, id))?.['lastPassingSnapshots']).toEqual(
    before?.['lastPassingSnapshots'],
  );
  expect((await readStoredProgress(page)).courses).toEqual(progressBefore);
  expect(JSON.stringify(await readStoredProgress(page))).not.toContain(marker);

  await panel.getByRole('button', { name: '練習実行', exact: true }).click();
  await expect(input).toBeFocused();
  await input.press('Enter');
  await expect(panel.getByText('正常終了しました。未採点です。', { exact: true })).toBeVisible();
  await expect(panel).toContainText('1/16行');
  await expect(consoleOutput).not.toContainText('EOFError');
  await panel.getByRole('button', { name: '練習実行', exact: true }).click();
  await expect(input).toBeFocused();
  await panel.getByRole('button', { name: '入力を終了（EOF）', exact: true }).click();
  await expect(consoleOutput).toContainText('EOFError');
  await expect(panel.getByRole('button', { name: '練習実行', exact: true })).toBeEnabled();
  await panel.getByRole('button', { name: '練習実行', exact: true }).click();
  await expect(input).toBeFocused();
  await input.fill('未送信の196入力');
  await panel.getByRole('button', { name: '練習を中止', exact: true }).click();
  await expect(panel.getByText('練習を中止しました。未採点です。', { exact: true })).toBeVisible();
  await expect(input).toHaveCount(0);
  expect((await draft(page, id))?.['validationHistory']).toEqual(before?.['validationHistory']);
  expect(JSON.stringify(await readStoredProgress(page))).not.toContain('未送信の196入力');
  await page.setViewportSize({ width: 390, height: 844 });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: info.outputPath('python-practice-mobile-gate.png'),
    fullPage: true,
  });
  await page.goto('/#/');
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: '全コースの進捗と下書きを書き出す', exact: true }).click();
  const path = info.outputPath('practice-progress.json');
  await (await downloading).saveAs(path);
  expect(await readFile(path, 'utf8')).not.toContain(marker);
});

test('偽装した入力要求も未採点の練習に留め、Source編集と離脱で旧入力を破棄する', async ({
  page,
}) => {
  const id = 'python-basics-ch01-l02';
  await page.goto(route(id));
  await expect(page.getByRole('button', { name: '判定する', exact: true })).toBeEnabled({
    timeout: 30_000,
  });
  const forged =
    'import os, json\npacket = {"type": "request-input", "runId": input.__globals__["_RUN_ID"], "sequence": 1}\nos.write(3, ("TSUMUCODE_INPUT " + json.dumps(packet) + "\\n").encode())\nwhile True:\n    pass\n';
  await replaceEditorText(page, forged);
  await waitForStoredDraftContent(page, forged);
  const panel = page.getByRole('region', { name: 'CPythonの練習実行', exact: true });
  const forgedCreate = page.waitForResponse(
    (response) => response.url().endsWith('/api/practice/runs') && response.status() === 202,
  );
  await panel.getByRole('button', { name: '練習実行', exact: true }).click();
  const forgedRun = (await (await forgedCreate).json()) as { identity: { runId: string } };
  const input = panel.getByLabel('練習へ送る1行（空欄は空文字列）');
  await expect(input).toBeVisible();
  await expect(panel).toContainText('本物のinput待機の証明ではありません');
  expect((await draft(page, id))?.['validationHistory']).toEqual([]);
  await input.fill('離脱で消す入力');
  const leaving = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/practice/runs/${forgedRun.identity.runId}/cancel`) &&
      response.status() === 200,
  );
  await page.goto('/#/');
  expect(await (await leaving).json()).toMatchObject({ removed: true, purged: true });
  await page.goto(route(id));
  await expect(panel.getByRole('button', { name: '練習実行', exact: true })).toBeEnabled({
    timeout: 10_000,
  });
  await expect(input).toHaveCount(0);
  await replaceEditorText(page, 'name = input()\nprint(name)\n');
  await waitForStoredDraftContent(page, 'name = input()\nprint(name)\n');
  await expect(panel.getByRole('region', { name: '練習のConsole出力' })).not.toContainText(
    '離脱で消す入力',
  );
  expect((await draft(page, id))?.['validationHistory']).toEqual([]);
  const creating = page.waitForResponse(
    (response) => response.url().endsWith('/api/practice/runs') && response.status() === 202,
  );
  await panel.getByRole('button', { name: '練習実行', exact: true }).click();
  const old = (await (await creating).json()) as { identity: { runId: string } };
  await expect(input).toBeVisible();
  await input.fill('Source更新で消す未送信入力');
  const cancelling = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/practice/runs/${old.identity.runId}/cancel`) &&
      response.status() === 200,
  );
  const changed = 'name = input()\nprint(name)\n# Source更新196\n';
  await replaceEditorText(page, changed);
  expect(await (await cancelling).json()).toMatchObject({ removed: true, purged: true });
  await expect(input).toHaveCount(0);
  await expect.poll(async () => (await draft(page, id))?.['files']).toEqual({ 'main.py': changed });
  expect((await draft(page, id))?.['validationHistory']).toEqual([]);
  expect(JSON.stringify(await readStoredProgress(page))).not.toContain(
    'Source更新で消す未送信入力',
  );
});

test('固定2fileの対話練習の入力はSource ZIPとJSONへ混入しない', async ({ page }, info) => {
  test.setTimeout(120_000);
  const id = 'python-basics-ch02-l01';
  await page.goto(route(id));
  await expect(page.getByRole('button', { name: '判定する', exact: true })).toBeEnabled({
    timeout: 30_000,
  });
  const root = `content/python-basics/chapters/python-basics-ch02/lessons/${id}/exercises/${id}-e01/solution`;
  const files: Record<string, string> = {};
  for (const path of ['main.py', 'lesson_tools.py']) {
    files[path] = await readFile(`${root}/${path}`, 'utf8');
    await page.getByRole('tab', { name: path, exact: true }).click();
    await replaceEditorText(page, files[path]);
  }
  const panel = page.getByRole('region', { name: 'CPythonの練習実行', exact: true });
  await panel.getByRole('button', { name: '練習実行', exact: true }).click();
  const input = panel.getByLabel('練習へ送る1行（空欄は空文字列）');
  const marker = 'ZIPへ含めない実入力';
  await expect(input).toBeVisible();
  await input.fill(marker);
  await input.press('Enter');
  await expect(input).toHaveValue('');
  await expect(input).toBeEnabled();
  await input.fill('6');
  await input.press('Enter');
  await expect(panel.getByText('正常終了しました。未採点です。', { exact: true })).toBeVisible();
  expect((await draft(page, id))?.['validationHistory']).toEqual([]);
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: '制作Sourceを持ち出す', exact: true }).click();
  const path = info.outputPath('practice-source.zip');
  await (await downloading).saveAs(path);
  const entries = unzipSync(await readFile(path));
  expect(Object.keys(entries).sort()).toEqual(['README.md', 'main.py', 'lesson_tools.py'].sort());
  for (const name of ['main.py', 'lesson_tools.py'])
    expect(strFromU8(entries[name]!)).toBe(files[name]);
  expect(JSON.stringify(await readStoredProgress(page))).not.toContain(marker);
});
