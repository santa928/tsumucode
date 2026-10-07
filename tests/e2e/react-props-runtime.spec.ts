import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {
  editorText,
  readStoredProgress,
  replaceEditorText,
  waitForStoredDraftContent,
} from './helpers/progress';
import { testBasePath } from './helpers/testBasePath';
import { expectStoredViewedSlide } from './helpers/releaseCourse';
import {
  installTypeScriptOperationProbe,
  readTypeScriptOperationProbe,
} from './helpers/typescriptOperationProbe';

const lesson = 'react-ch01-l01';
const exercise = `${lesson}-e01`;
const root = `content/react/chapters/react-ch01/lessons/${lesson}/exercises/${exercise}`;
const route = `${testBasePath()}#/courses/react/lessons/${lesson}/exercises/${exercise}`;

test('Propsの型修正を実React描画・判定・保存・Resetへ接続する', async ({ page }, info) => {
  test.setTimeout(90_000);
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  await page.goto(`${testBasePath()}#/`);
  await expect(
    page.getByRole('heading', { name: '学びたいピースを選ぶ', exact: true }),
  ).toBeVisible();
  await page.goto(`${testBasePath()}#/paths/frontend`);
  await expect(
    page.getByRole('heading', { name: 'フロントエンド学習パス', exact: true }),
  ).toBeVisible();
  for (let i = 1; i <= 4; i += 1) {
    const id = `${lesson}-s0${String(i)}`;
    await page.goto(`${testBasePath()}#/courses/react/lessons/${lesson}/slides/${id}`);
    await expect(page.getByTestId('slide-stage')).toHaveAttribute('data-slide-id', id);
    await expectStoredViewedSlide(page, lesson, id);
  }
  expect(
    requests.filter((url) => /compilerWorker-|ReactRunnerAdapter-|reactEditorLanguage-/u.test(url)),
  ).toEqual([]);
  await page.screenshot({ path: info.outputPath('props-checkpoint.png') });
  await page.getByRole('link', { name: /のコード演習を始める/u }).click();
  const typeError = page.getByText('型を確認してください。まだ実行・採点していません。', {
    exact: true,
  });
  await expect(typeError).toBeVisible({ timeout: 20_000 });
  const starter = await readFile(`${root}/starter/main.tsx`, 'utf8');
  await expect.poll(() => editorText(page)).toBe(starter);
  const solution = await readFile(`${root}/solution/main.tsx`, 'utf8');
  await replaceEditorText(page, solution);
  await waitForStoredDraftContent(page, solution);
  // 編集後の自動再描画だけで復帰し、前の型失敗のalertを残さない。
  await expect(
    page
      .frameLocator('iframe[title="Reactコードのプレビュー"]')
      .getByRole('heading', { name: 'HTMLが受け持つものは？' }),
  ).toBeVisible({ timeout: 20_000 });
  await expect(
    page
      .getByRole('alert')
      .filter({ hasText: "Type 'number' is not assignable to type 'string'." }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'プレビューを更新', exact: true }).click();
  const preview = page.frameLocator('iframe[title="Reactコードのプレビュー"]');
  await expect(preview.getByRole('heading', { name: 'HTMLが受け持つものは？' })).toBeVisible({
    timeout: 20_000,
  });
  await expect(preview.locator('li')).toHaveText(['内容', '見た目']);
  await expect(preview.locator('section p')).toHaveText('選択肢は2個です');
  await page.screenshot({ path: info.outputPath('props-real-dom.png') });
  expect(
    await page.locator('iframe[title="Reactコードのプレビュー"]').getAttribute('sandbox'),
  ).toBe('allow-scripts');
  expect(
    await preview.locator('body').evaluate(() => {
      let parentBlocked = false;
      let cookieBlocked = false;
      try {
        void parent.document;
      } catch {
        parentBlocked = true;
      }
      try {
        void document.cookie;
      } catch {
        cookieBlocked = true;
      }
      return {
        parentBlocked,
        cookieBlocked,
        storageDisabled: typeof localStorage === 'undefined',
        origin: location.origin,
        networkDisabled: typeof fetch === 'undefined',
      };
    }),
  ).toMatchObject({
    parentBlocked: true,
    cookieBlocked: true,
    storageDisabled: true,
    origin: 'null',
    networkDisabled: true,
  });
  await page.getByRole('button', { name: '判定する', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'ピースがはまりました', exact: true }),
  ).toBeVisible({ timeout: 20_000 });
  const stored = await readStoredProgress(page);
  expect((stored.drafts[0]?.validationHistory as { status: string }[]).at(-1)?.status).toBe('pass');
  await page.goto(route);
  await expect.poll(() => editorText(page)).toBe(solution);
  await page.reload();
  await expect.poll(() => editorText(page)).toBe(solution);
  expect((await readStoredProgress(page)).drafts[0]?.files).toEqual(stored.drafts[0]?.files);
  expect((await new AxeBuilder({ page }).exclude('iframe').analyze()).violations).toEqual([]);
  await page.getByRole('button', { name: '最初に戻す', exact: true }).click();
  await page
    .getByRole('dialog', { name: '最初のコードに戻しますか？' })
    .getByRole('button', { name: '最初のコードに戻す', exact: true })
    .click();
  await expect.poll(() => editorText(page)).toBe(starter);
  await expect(typeError).toBeVisible({ timeout: 20_000 });
});

test('compile中の停止と編集で旧世代を採点せず、再実行できる', async ({ page }) => {
  test.setTimeout(90_000);
  await installTypeScriptOperationProbe(page);
  await page.goto(route);
  await expect(
    page.getByText('型を確認してください。まだ実行・採点していません。', { exact: true }),
  ).toBeVisible({ timeout: 20_000 });
  const solution = await readFile(`${root}/solution/main.tsx`, 'utf8');
  await replaceEditorText(page, solution);
  await waitForStoredDraftContent(page, solution);
  const before = await readStoredProgress(page);
  await page.getByRole('button', { name: '判定する', exact: true }).click();
  await page.waitForFunction(() => {
    const probe = (window as Window & { __typescriptOperationProbe?: { pendingCompiles: number } })
      .__typescriptOperationProbe;
    return probe !== undefined && probe.pendingCompiles > 0;
  });
  await page.getByRole('button', { name: '実行を停止', exact: true }).click();
  await expect(
    page.getByText('実行を停止しました。採点していません。', { exact: true }),
  ).toBeVisible();
  const after = await readStoredProgress(page);
  expect(after.drafts[0]?.files).toEqual(before.drafts[0]?.files);
  expect(after.drafts[0]?.validationHistory).toEqual(before.drafts[0]?.validationHistory);
  expect((await readTypeScriptOperationProbe(page)).pendingCompiles).toBe(0);
  await page.getByRole('button', { name: '判定する', exact: true }).click();
  await page.waitForFunction(() => {
    const probe = (window as Window & { __typescriptOperationProbe?: { pendingCompiles: number } })
      .__typescriptOperationProbe;
    return probe !== undefined && probe.pendingCompiles > 0;
  });
  const wrong = await readFile(`${root}/fixtures/wrong-display.tsx`, 'utf8');
  await replaceEditorText(page, wrong);
  await waitForStoredDraftContent(page, wrong);
  await expect(page.getByRole('button', { name: '判定する', exact: true })).toBeEnabled();
  expect((await readStoredProgress(page)).drafts[0]?.validationHistory).toEqual(
    before.drafts[0]?.validationHistory,
  );
  await page.getByRole('button', { name: '判定する', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'あと一歩', exact: true })).toBeVisible({
    timeout: 20_000,
  });
});

test('React非同期chunkの読み込み失敗で下書きを保ち、キーボードで再試行できる', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto(route);
  await expect(
    page.getByText('型を確認してください。まだ実行・採点していません。', { exact: true }),
  ).toBeVisible({ timeout: 20_000 });
  const solution = await readFile(`${root}/solution/main.tsx`, 'utf8');
  await replaceEditorText(page, solution);
  await waitForStoredDraftContent(page, solution);
  const before = await readStoredProgress(page);
  let failures = 0;
  await page.route('**/ReactRunnerAdapter-*.js', async (request) => {
    failures += 1;
    await request.abort('failed');
  });
  await page.reload();
  const alert = page.getByRole('alert').filter({ hasText: '演習環境を読み込めませんでした' });
  await expect(alert).toBeVisible();
  await expect(alert).toBeFocused();
  expect(failures).toBeGreaterThan(0);
  expect((await readStoredProgress(page)).drafts).toEqual(before.drafts);
  await page.unroute('**/ReactRunnerAdapter-*.js');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'もう一度読み込む', exact: true })).toBeFocused();
  await Promise.all([page.waitForEvent('load'), page.keyboard.press('Enter')]);
  await expect.poll(() => editorText(page)).toBe(solution);
  await expect(
    page
      .frameLocator('iframe[title="Reactコードのプレビュー"]')
      .getByRole('heading', { name: 'HTMLが受け持つものは？' }),
  ).toBeVisible({ timeout: 20_000 });
  expect((await readStoredProgress(page)).drafts[0]?.validationHistory).toEqual(
    before.drafts[0]?.validationHistory,
  );
});

test('390pxで導入とPC案内を読み、PCの段階HintからキーボードでPropsを修正する', async ({
  page,
}, info) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  for (let i = 1; i <= 4; i += 1) {
    const id = `${lesson}-s0${String(i)}`;
    await page.goto(`${testBasePath()}#/courses/react/lessons/${lesson}/slides/${id}`);
    await expect(page.getByTestId('slide-stage')).toHaveAttribute('data-slide-id', id);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      390,
    );
    await page.screenshot({
      path: info.outputPath(`props-mobile-s0${String(i)}.png`),
      fullPage: true,
    });
  }
  await page.goto(route);
  await expect(page.getByRole('heading', { name: 'PCで演習を開く', exact: true })).toBeVisible();
  await expect(
    page.getByText('幅1024px以上で、マウスやトラックパッドを使える環境から開いてください。', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: '判定する', exact: true })).toHaveCount(0);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: info.outputPath('props-mobile-pc-notice.png'), fullPage: true });
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(
    page.getByText('型を確認してください。まだ実行・採点していません。', { exact: true }),
  ).toBeVisible({ timeout: 20_000 });
  const hintTrigger = page.getByRole('button', { name: 'ヒントを見る', exact: true });
  await hintTrigger.focus();
  await page.keyboard.press('Enter');
  const hint = page
    .getByRole('dialog', { name: 'ヒント', exact: true })
    .getByRole('button', { name: /^ヒント1を見る/u });
  await hint.focus();
  await page.keyboard.press('Enter');
  await expect(
    page.getByText('QuestionCard.tsxのQuestion型を読み、promptの型とmain.tsxの値を比べます。', {
      exact: true,
    }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(hintTrigger).toBeFocused();
  const solution = await readFile(`${root}/solution/main.tsx`, 'utf8');
  await replaceEditorText(page, solution);
  const update = page.getByRole('button', { name: 'プレビューを更新', exact: true });
  await update.focus();
  await page.keyboard.press('Enter');
  await expect(
    page
      .frameLocator('iframe[title="Reactコードのプレビュー"]')
      .getByRole('heading', { name: 'HTMLが受け持つものは？' }),
  ).toBeVisible({ timeout: 20_000 });
  expect((await new AxeBuilder({ page }).exclude('iframe').analyze()).violations).toEqual([]);
  await page.screenshot({ path: info.outputPath('props-keyboard-exercise.png'), fullPage: true });
});
