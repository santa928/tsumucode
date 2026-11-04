import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import {
  editorText,
  readStoredProgress,
  replaceEditorText,
  waitForStoredDraftContent,
} from './helpers/progress';
import { testBasePath } from './helpers/testBasePath';

const base = testBasePath();
const lesson = 'python-basics-ch01-l02';
const exercise = `${lesson}-e01`;
const route = `${base}#/courses/python-basics/lessons/${lesson}/exercises/${exercise}`;
async function preserved(page: Page) {
  const progress = await readStoredProgress(page);
  const draft = progress.drafts.find((value) => value['workspaceId'] === exercise);
  return {
    firstCompletions: progress.courses.map((course) => ({
      courseId: course['courseId'],
      firstCompletedAt: course['firstCompletedAt'],
      lessons: Object.entries(course['lessons'] as Record<string, Record<string, unknown>>).map(
        ([id, state]) => ({ lessonId: id, firstCompletedAt: state['firstCompletedAt'] }),
      ),
    })),
    history: draft?.['validationHistory'],
    success: draft?.['lastPassingSnapshots'],
  };
}

test('対話入力の送信・空行・EOF・中止と編集/離脱後の復旧を実画面で確認する', async ({
  page,
}, info) => {
  test.setTimeout(600_000);
  // 固定coreの取得90秒と初期化15秒を許容する。製品側の計算/待機期限は変えない。
  const preparationTimeout = 110_000;
  const source = 'name = input()\nprint(name)\n';
  await page.goto(route);
  await expect(page.getByRole('button', { name: '判定する', exact: true })).toBeEnabled({
    timeout: 30_000,
  });
  await replaceEditorText(page, source);
  await page.getByLabel('実行前の入力（1行につきinput 1回）').fill('保存しない事前入力');
  await page.getByRole('button', { name: '判定する', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'できました', exact: true })).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole('button', { name: '閉じる', exact: true }).click();
  const before = await preserved(page);
  const courseBefore = (await readStoredProgress(page)).courses;
  const panel = page.getByRole('region', { name: /^(CPython|Pyodide)の練習実行$/u });
  if ((await panel.count()) === 0) {
    expect(info.project.name).not.toBe('chromium');
    await expect(page.getByText(/このブラウザでは実行途中の入力に未対応/u)).toBeVisible();
    expect(await preserved(page)).toEqual(before);
    expect(await editorText(page)).toBe(source);
    await info.attach('explicit-unsupported', {
      body: 'ブラウザ機能なし。事前入力の実採点を確認し、対話成功には数えない。',
      contentType: 'text/plain',
    });
    return;
  }
  const input = panel.getByLabel('練習へ送る1行（空欄は空文字列）');
  const consoleOutput = panel.getByRole('region', { name: '練習のConsole出力' });
  const start = panel.getByRole('button', { name: '練習実行', exact: true });
  await start.click();
  await expect(input.or(panel.getByText(/この実行環境は対話練習に未対応/u))).toBeVisible({
    timeout: preparationTimeout,
  });
  if ((await input.count()) === 0) {
    expect(info.project.name).not.toBe('chromium');
    await expect(panel).not.toHaveAttribute('aria-label', 'CPythonの練習実行');
    expect(await preserved(page)).toEqual(before);
    expect(await editorText(page)).toBe(source);
    await expect(start).toBeEnabled();
    await info.attach('explicit-unsupported', {
      body: '機能名は存在するが能力除去後の自己検査で未対応。事前入力の実採点を確認し、対話成功には数えない。',
      contentType: 'text/plain',
    });
    return;
  }
  await expect(input).toBeFocused({ timeout: preparationTimeout });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  // axeの検査用tabを閉じた後、keyboard検証の対象tabへfocusを戻す。
  await page.bringToFront();
  await page.screenshot({ path: info.outputPath('interactive-waiting.png'), fullPage: true });
  await expect(page.getByRole('button', { name: '判定する', exact: true })).toBeDisabled();
  const marker = '対話196専用の未保存入力';
  await input.fill(marker);
  await input.press('Enter');
  await expect(panel.getByText('正常終了しました。未採点です。', { exact: true })).toBeVisible();
  await expect(consoleOutput).toContainText(marker);
  await expect(start).toBeFocused();
  expect(await preserved(page)).toEqual(before);
  expect(JSON.stringify(await readStoredProgress(page))).not.toContain(marker);

  await start.click();
  await expect(input).toBeFocused({ timeout: preparationTimeout });
  await input.press('Enter');
  await expect(panel.getByText('正常終了しました。未採点です。', { exact: true })).toBeVisible();
  await expect(panel).toContainText('1/16行');
  await start.click();
  await expect(input).toBeFocused({ timeout: preparationTimeout });
  await panel.getByRole('button', { name: '入力を終了（EOF）', exact: true }).click();
  await expect(start).toBeEnabled();
  await expect(panel).toContainText(/EOF/u);
  expect(await preserved(page)).toEqual(before);

  await start.click();
  await expect(input).toBeFocused({ timeout: preparationTimeout });
  await input.fill('中止する未送信入力196');
  await panel.getByRole('button', { name: '練習を中止', exact: true }).click();
  await expect(panel.getByText('練習を中止しました。未採点です。', { exact: true })).toBeVisible();
  await expect(input).toHaveCount(0);
  expect(await preserved(page)).toEqual(before);
  expect(await editorText(page)).toBe(source);
  // Sourceを変えない練習と中止は、現在の合格evidenceも変更しない。
  expect((await readStoredProgress(page)).courses).toEqual(courseBefore);

  await start.click();
  await expect(input).toBeFocused({ timeout: preparationTimeout });
  await input.fill('編集で破棄する入力196');
  const changed = `${source}# 自分の下書き196\n`;
  await replaceEditorText(page, changed);
  await expect(input).toHaveCount(0);
  await waitForStoredDraftContent(page, changed);
  // Source編集時の現在passの失効は既存仕様。履歴・過去成功・初回完了を保持する。
  expect(await preserved(page)).toEqual(before);
  await expect(start).toBeEnabled({ timeout: 30_000 });
  await start.click();
  await expect(input).toBeFocused({ timeout: preparationTimeout });
  await input.fill('離脱で破棄する入力196');
  await page.goto(`${base}#/`);
  await page.goto(route);
  await expect(page.locator('.cm-content')).toBeVisible();
  await expect(input).toHaveCount(0);
  expect(await editorText(page)).toBe(changed);
  expect(await preserved(page)).toEqual(before);
  await start.click();
  await expect(input).toBeFocused({ timeout: preparationTimeout });
  await input.fill('復旧196');
  await input.press('Enter');
  await expect(panel.getByText('正常終了しました。未採点です。', { exact: true })).toBeVisible();
  expect(await preserved(page)).toEqual(before);
  const progress = JSON.stringify(await readStoredProgress(page));
  for (const value of [
    marker,
    '中止する未送信入力196',
    '編集で破棄する入力196',
    '離脱で破棄する入力196',
    '復旧196',
  ])
    expect(progress).not.toContain(value);
  await page.setViewportSize({ width: 390, height: 844 });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('interactive-mobile.png'), fullPage: true });
  await page.goto(`${base}#/`);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '全コースの進捗と下書きを書き出す', exact: true }).click();
  const path = info.outputPath('interactive-progress.json');
  await (await download).saveAs(path);
  expect(await readFile(path, 'utf8')).not.toContain(marker);
});
