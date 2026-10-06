import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import {
  editorText,
  readStoredProgress,
  replaceEditorText,
  waitForStoredDraftContent,
} from './helpers/progress';
import { testBasePath } from './helpers/testBasePath';
import {
  installTypeScriptOperationProbe,
  readTypeScriptOperationProbe,
} from './helpers/typescriptOperationProbe';

const lessonId = 'typescript-ch05-l03';
const exerciseId = `${lessonId}-e01`;
const root = `content/typescript/chapters/typescript-ch05/lessons/${lessonId}/exercises/${exerciseId}`;
const route = `${testBasePath()}#/courses/typescript/lessons/${lessonId}/exercises/${exerciseId}`;

test('実TSのDOM演習で型誤り・compile中停止・再判定・保存を確認する', async ({ page }, info) => {
  test.setTimeout(90_000);
  await installTypeScriptOperationProbe(page);
  await page.goto(route);
  await expect(
    page.getByText('型を確認してください。まだ実行・採点していません。', { exact: true }),
  ).toBeVisible({ timeout: 20_000 });
  const starter = await readFile(`${root}/starter/main.ts`, 'utf8');
  await expect.poll(() => editorText(page)).toBe(starter);
  const solution = await readFile(`${root}/solution/main.ts`, 'utf8');
  await replaceEditorText(page, solution);
  await waitForStoredDraftContent(page, solution);
  await page.getByRole('tab', { name: 'Console', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Console出力' })).toContainText('準備できました', {
    timeout: 20_000,
  });
  const before = await readStoredProgress(page);
  for (const label of ['プレビューを更新', '判定する'] as const) {
    const cancelledBefore = (await readTypeScriptOperationProbe(page)).cancelledCompiles;
    const button = page.getByRole('button', { name: label, exact: true });
    await expect(button).toBeEnabled();
    await button.focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => {
      const probe = Reflect.get(window, '__typescriptOperationProbe') as {
        pendingCompiles: number;
      };
      return probe.pendingCompiles > 0;
    });
    const stop = page.getByRole('button', { name: '実行を停止', exact: true });
    await expect(stop).toBeEnabled();
    await expect
      .poll(
        async () => (await readTypeScriptOperationProbe(page)).observations.at(-1)?.paintedAfterMs,
      )
      .toBeGreaterThan(0);
    await stop.focus();
    await page.keyboard.press('Enter');
    await expect(
      page.getByText('実行を停止しました。採点していません。', { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: '判定する', exact: true })).toBeEnabled();
    await expect
      .poll(
        async () => (await readTypeScriptOperationProbe(page)).observations.at(-1)?.paintedAfterMs,
      )
      .toBeGreaterThan(0);
    const stopped = await readTypeScriptOperationProbe(page);
    expect(stopped.pendingCompiles).toBe(0);
    expect(stopped.cancelledCompiles).toBe(cancelledBefore + 1);
    const after = await readStoredProgress(page);
    expect(after.drafts[0]?.['files']).toEqual(before.drafts[0]?.['files']);
    expect(after.drafts[0]?.['validationHistory']).toEqual(before.drafts[0]?.['validationHistory']);
    await expect(page.getByRole('heading', { name: 'できました', exact: true })).toHaveCount(0);
  }
  const probe = await readTypeScriptOperationProbe(page);
  expect(probe.observations.filter(({ label }) => label === '実行を停止')).toHaveLength(2);
  expect(
    probe.observations
      .filter(({ label }) => label === '実行を停止')
      .every(({ compilePendingAtClick }) => compilePendingAtClick),
  ).toBe(true);
  expect(probe.cancelledCompiles).toBeGreaterThanOrEqual(2);
  await info.attach('operation-paint-observation', {
    body: JSON.stringify(
      {
        probe,
        environment: await page.evaluate(() => ({
          userAgent: navigator.userAgent,
          hardwareConcurrency: navigator.hardwareConcurrency,
        })),
      },
      null,
      2,
    ),
    contentType: 'application/json',
  });
  await page.getByRole('button', { name: '判定する', exact: true }).click();
  // 演習へ直接入ったためSlide未読。演習合格とLesson全体の完了を混同しない。
  await expect(page.getByRole('heading', { name: 'できました', exact: true })).toBeVisible({
    timeout: 20_000,
  });
  await page.reload();
  await expect
    .poll(async () => (await readStoredProgress(page)).drafts[0]?.['files'])
    .toEqual(before.drafts[0]?.['files']);
  const editor = page.getByRole('textbox', { name: 'main.ts のコードエディター', exact: true });
  await expect(editor).toBeVisible();
  // 長い原文の画面外行はCodeMirrorが描画しない。全文は保存値、末尾は実エディターで確認する。
  await editor.focus();
  await editor.press('Control+End');
  await expect.poll(() => editorText(page)).toContain("console.log('準備できました');");
  const history = (await readStoredProgress(page)).drafts[0]?.['validationHistory'] as {
    status: string;
  }[];
  const previousHistory = before.drafts[0]?.['validationHistory'] as { status: string }[];
  expect(history).toHaveLength(previousHistory.length + 1);
  expect(history.slice(0, -1)).toEqual(previousHistory);
  expect(history.at(-1)?.status).toBe('pass');
  await expect(
    page
      .getByTestId('runtime-preview-frame')
      .locator('iframe')
      .contentFrame()
      .getByRole('button', { name: '正常なデータ', exact: true }),
  ).toBeVisible({ timeout: 20_000 });
  // opaque originの学習者Previewは隔離検査で扱い、製品の操作UIをaxeで検査する。
  expect(
    (
      await new AxeBuilder({ page })
        .exclude('[data-testid="runtime-preview-frame"] iframe')
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.screenshot({ path: info.outputPath('typescript-dom-completed.png') });
});

test('コンパイルしたTSのDOM実行をopaque originと通信禁止で隔離する', async ({ page }) => {
  await page.goto(route);
  await expect(
    page.getByText('型を確認してください。まだ実行・採点していません。', { exact: true }),
  ).toBeVisible({ timeout: 20_000 });
  await replaceEditorText(page, await readFile(`${root}/solution/main.ts`, 'utf8'));
  await page.getByRole('tab', { name: 'Console', exact: true }).click();
  const iframe = page.getByTestId('runtime-preview-frame').locator('iframe');
  await expect(page.getByRole('region', { name: 'Console出力' })).toContainText('準備できました', {
    timeout: 20_000,
  });
  await expect(iframe).toHaveAttribute('sandbox', 'allow-scripts');
  const requests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('typescript-security-probe')) requests.push(request.url());
  });
  const isolation = await iframe
    .contentFrame()
    .locator('html')
    .evaluate(async () => {
      let parentBlocked = false;
      let storageBlocked = false;
      try {
        void parent.document.body;
      } catch {
        parentBlocked = true;
      }
      try {
        localStorage.setItem('typescript-security-probe', 'forbidden');
      } catch {
        storageBlocked = true;
      }
      let networkBlocked = false;
      try {
        await fetch('https://example.com/typescript-security-probe');
      } catch {
        networkBlocked = true;
      }
      return { origin: location.origin, parentBlocked, storageBlocked, networkBlocked };
    });
  expect(isolation).toEqual({
    origin: 'null',
    parentBlocked: true,
    storageBlocked: true,
    networkBlocked: true,
  });
  expect(requests).toEqual([]);
});
