import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import {
  editorText,
  readStoredProgress,
  replaceEditorText,
  waitForStoredDraftContent,
} from '../e2e/helpers/progress';

const root =
  'content/javascript/chapters/javascript-ch03/lessons/javascript-ch03-l05/exercises/javascript-ch03-l05-e01';
const path = '/#/courses/javascript/lessons/javascript-ch03-l05/exercises/javascript-ch03-l05-e01';

/** 実Node実行後の出力を待つ。起動受付だけを成功とは扱わない。 */
async function preview(page: Page) {
  await page.getByRole('button', { name: 'プレビューを更新', exact: true }).click();
  await expect(page.getByText('実行できました（合否は「判定する」で確認）')).toBeVisible();
  await expect(page.getByLabel('実行環境')).toContainText('v24.18.0');
}

test('実NodeのClosureで編集・Reset・再編集・採点・再読込をつなぐ', async ({
  page,
  browser,
}, info) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'ClosureをNode.jsで実行する', exact: true }).click();
  await expect(page.getByTestId('code-workspace')).toBeVisible();
  await expect(page.locator('iframe')).toHaveCount(0);
  await preview(page);
  await expect(page.getByRole('region', { name: 'Console出力' }).locator('code')).toHaveText([
    '0',
    '0',
  ]);
  await page.getByRole('button', { name: '判定する', exact: true }).click();
  await expect(
    page.getByRole('dialog', { name: '判定結果' }).getByRole('heading', { name: 'あと一歩' }),
  ).toBeVisible();
  await page.getByRole('button', { name: '閉じる', exact: true }).click();
  const solution = await readFile(`${root}/solution/script.js`, 'utf8');
  await replaceEditorText(page, solution);
  await page.getByRole('button', { name: '最初に戻す', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '最初のコードに戻しますか？' });
  await dialog.getByRole('button', { name: '最初のコードに戻す', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect
    .poll(() => editorText(page))
    .toBe(await readFile(`${root}/starter/script.js`, 'utf8'));
  await expect(page.getByRole('button', { name: '判定する', exact: true })).toBeEnabled();
  await replaceEditorText(page, solution);
  await waitForStoredDraftContent(page, solution);
  await preview(page);
  await expect(page.getByRole('region', { name: 'Console出力' }).locator('code')).toHaveText([
    '10',
    '20',
  ]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.screenshot({ path: info.outputPath('node-closure-console.png') });
  await page.getByRole('button', { name: '判定する', exact: true }).click();
  await expect(
    page.getByRole('dialog', { name: '判定結果' }).getByRole('heading', { name: 'できました' }),
  ).toBeVisible();
  await page.screenshot({ path: info.outputPath('node-closure-pass.png') });
  await page.getByRole('button', { name: '閉じる', exact: true }).click();
  const before = await readStoredProgress(page);
  expect(before.drafts[0]?.['validationHistory']).toEqual(
    expect.arrayContaining([expect.objectContaining({ status: 'pass' })]),
  );
  await page.reload();
  await expect.poll(() => editorText(page)).toBe(solution);
  expect((await readStoredProgress(page)).drafts).toEqual(before.drafts);
  await preview(page);
  await page.goto('/');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '全コースの進捗を書き出す' }).click();
  const bundle = info.outputPath('node-progress.json');
  await (await download).saveAs(bundle);
  const fresh = await browser.newContext();
  const imported = await fresh.newPage();
  await imported.goto('http://127.0.0.1:4173/');
  await expect(imported.getByLabel('進捗Bundleを選ぶ')).toBeEnabled();
  await imported.getByLabel('進捗Bundleを選ぶ').setInputFiles({
    name: 'progress.json',
    mimeType: 'application/json',
    buffer: await readFile(bundle),
  });
  await expect(imported.getByRole('region', { name: '読み込み差分' })).toBeVisible();
  const reloaded = imported.waitForEvent('domcontentloaded');
  await imported.getByRole('button', { name: 'この内容を読み込む' }).click();
  await reloaded;
  await imported.goto(`http://127.0.0.1:4173${path}`);
  await expect.poll(() => editorText(imported)).toBe(solution);
  expect((await readStoredProgress(imported)).drafts[0]?.['validationHistory']).toEqual(
    before.drafts[0]?.['validationHistory'],
  );
  await fresh.close();
});

for (const fixture of [
  { file: 'arrow-pass.js', heading: 'できました' },
  { file: 'output-only.js', heading: 'あと一歩' },
  { file: 'global-score.js', heading: 'あと一歩' },
]) {
  test(`実Nodeの採点は教材factと出力を両方照合する: ${fixture.file}`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByTestId('code-workspace')).toBeVisible();
    const source = await readFile(`${root}/fixtures/${fixture.file}`, 'utf8');
    await replaceEditorText(
      page,
      `${source}\nconst values=[1]; const i=0; Promise.resolve(values[i]);`,
    );
    await page.getByRole('button', { name: '判定する', exact: true }).click();
    await expect(
      page
        .getByRole('dialog', { name: '判定結果' })
        .getByRole('heading', { name: fixture.heading }),
    ).toBeVisible();
  });
}

test('実行中に編集・離脱しても古い結果や通知を新しい画面へ残さない', async ({ page }) => {
  await page.goto(path);
  await expect(page.getByTestId('code-workspace')).toBeVisible();
  await replaceEditorText(page, 'while(true) {}');
  const created = page.waitForResponse(
    (response) => response.url().endsWith('/api/runs') && response.status() === 202,
  );
  await page.getByRole('button', { name: '判定する', exact: true }).click();
  await created;
  const source = await readFile(`${root}/solution/script.js`, 'utf8');
  await replaceEditorText(page, source);
  await expect(page.getByRole('button', { name: '判定する', exact: true })).toBeEnabled({
    timeout: 15000,
  });
  expect((await readStoredProgress(page)).drafts[0]?.['validationHistory']).toEqual([]);
  await preview(page);
  await replaceEditorText(page, 'while(true) {}');
  const second = page.waitForResponse(
    (response) => response.url().endsWith('/api/runs') && response.status() === 202,
  );
  await page.getByRole('button', { name: '判定する', exact: true }).click();
  await second;
  const cancelled = page.waitForResponse(
    (response) => response.url().endsWith('/cancel') && response.status() === 200,
  );
  await page.getByRole('link', { name: 'TsumuCodeホームへ（ベータ版）', exact: true }).click();
  await cancelled;
  await expect(page.getByRole('heading', { name: '学びたいピースを選ぶ' })).toBeVisible();
  await expect(page.getByText(/学習データ.*読.*失敗/)).toHaveCount(0);
  expect((await readStoredProgress(page)).drafts[0]?.['validationHistory']).toEqual([]);
});

test('計算添字とPromiseを実Nodeで実行し、停止と接続障害を不正解保存しない', async ({ page }) => {
  await page.goto(path);
  await expect(page.getByTestId('code-workspace')).toBeVisible();
  const source =
    'const values=[10,20]; const i=1; Promise.resolve(values[i]).then(value=>console.log(value));';
  await replaceEditorText(page, source);
  await preview(page);
  await expect(page.getByRole('region', { name: 'Console出力' }).locator('code')).toHaveText([
    '20',
  ]);
  await replaceEditorText(page, 'while(true) {}');
  const created = page.waitForResponse(
    (response) => response.url().endsWith('/api/runs') && response.status() === 202,
  );
  await page.getByRole('button', { name: '判定する', exact: true }).click();
  await created;
  await page.getByRole('button', { name: '実行を停止', exact: true }).click();
  await expect(
    page.getByText('実行を停止しました。採点していません。', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: '判定する', exact: true })).toBeEnabled();
  await expect(page.getByRole('dialog', { name: '判定結果' })).toBeHidden();
  await waitForStoredDraftContent(page, 'while(true) {}');
  expect((await readStoredProgress(page)).drafts[0]?.['validationHistory']).toEqual([]);
  await page.route('**/api/**', (route) => route.abort('connectionfailed'));
  await page.getByRole('button', { name: '判定する', exact: true }).click();
  await expect(page.getByText(/ローカル実行に失敗しました/).first()).toBeVisible();
  expect((await readStoredProgress(page)).drafts[0]?.['validationHistory']).toEqual([]);
  await page.unroute('**/api/**');
  await replaceEditorText(page, source);
  await preview(page);
});
