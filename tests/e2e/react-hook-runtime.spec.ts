import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readStoredProgress, waitForStoredDraftContent } from './helpers/progress';
import { testBasePath } from './helpers/testBasePath';
import { expectStoredViewedSlide } from './helpers/releaseCourse';

/** CodeMirrorの通常の全文コピーから、画面外も含む編集Sourceを読む。 */
async function copyEditorSource(page: Page): Promise<string> {
  await page.locator('.cm-content').click();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+C' : 'Control+C');
  return page.evaluate(() => navigator.clipboard.readText());
}

/** 通常の編集操作でSourceを置き換え、保存と全文コピーの一致を確認する。 */
async function replaceSource(page: Page, source: string): Promise<void> {
  await page.locator('.cm-content').click();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
  await page.keyboard.insertText(source);
  await waitForStoredDraftContent(page, source);
  await expect.poll(() => copyEditorSource(page)).toBe(source);
}

const lessons = ['react-ch01-l10', 'react-ch01-l11', 'react-ch01-l12'];
for (const lesson of lessons) {
  const exercise = `${lesson}-e01`;
  const root = `content/react/chapters/react-ch01/lessons/${lesson}/exercises/${exercise}`;
  const route = `${testBasePath()}#/courses/react/lessons/${lesson}/exercises/${exercise}`;
  const editableFile = lesson.endsWith('12') ? 'sourceHook.ts' : 'components.tsx';
  test(`${lesson}の修正を実操作・再判定・保存・ResetとKeyboard Hintへ接続する`, async ({
    page,
  }, info) => {
    test.setTimeout(120_000);
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    for (let index = 1; index <= 3; index += 1) {
      const slide = `${lesson}-s0${String(index)}`;
      await page.goto(`${testBasePath()}#/courses/react/lessons/${lesson}/slides/${slide}`);
      await expect(page.getByTestId('slide-stage')).toHaveAttribute('data-slide-id', slide);
      await expectStoredViewedSlide(page, lesson, slide);
    }
    await page.goto(route);
    const starter = await readFile(`${root}/starter/${editableFile}`, 'utf8');
    await expect.poll(() => copyEditorSource(page)).toBe(starter);
    const trigger = page.getByRole('button', { name: 'ヒントを見る', exact: true });
    await expect(trigger).toBeEnabled();
    await trigger.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'ヒント', exact: true });
    const hint = dialog.getByRole('button', { name: /^ヒント1を見る/u });
    await hint.focus();
    await page.keyboard.press('Enter');
    const hintText = lesson.endsWith('10')
      ? 'components.tsxのfocusInputと、入力へ移るボタンを見比べます。'
      : lesson.endsWith('11')
        ? 'Bに値を入力してから「Bを選ぶ」を押し、表示値と依存配列を見比べます。'
        : 'sourceHook.tsが最後に返す値と、用意済み2つの表示Componentを見比べます。';
    await expect(dialog).toContainText(hintText);
    await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();
    await page.getByRole('button', { name: '判定する', exact: true }).click();
    await expect
      .poll(async () => (await readStoredProgress(page)).drafts[0]?.validationHistory, {
        timeout: 20_000,
      })
      .toEqual(expect.arrayContaining([expect.objectContaining({ status: 'incomplete' })]));
    await expect(page.getByRole('dialog', { name: '判定結果', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: '判定結果', exact: true })).toHaveCount(0);
    const solution = await readFile(`${root}/solution/${editableFile}`, 'utf8');
    await replaceSource(page, solution);
    const update = page.getByRole('button', { name: 'プレビューを更新', exact: true });
    await expect(update).toBeEnabled();
    await update.focus();
    await page.keyboard.press('Enter');
    const preview = page.frameLocator('iframe[title="Reactコードのプレビュー"]');
    await expect(preview.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 20_000 });
    if (lesson.endsWith('10')) {
      const input = preview.getByRole('textbox', { name: '名前', exact: true });
      await preview.getByRole('button', { name: '入力へ移る', exact: true }).focus();
      await page.keyboard.press('Enter');
      await expect(input).toBeFocused();
      await input.fill('React');
      await expect(preview.locator('#length')).toHaveText('5');
      await expect(preview.locator('#name-summary')).toHaveText('React');
    } else if (lesson.endsWith('11')) {
      await expect(preview.locator('#observed')).toHaveText('初期A');
      await preview.getByRole('textbox', { name: '外部入力B', exact: true }).fill('Bの現在値');
      await preview.getByRole('button', { name: 'Bを選ぶ', exact: true }).focus();
      await page.keyboard.press('Enter');
      await expect(preview.locator('#observed')).toHaveText('Bの現在値');
      await preview.getByRole('textbox', { name: '外部入力A', exact: true }).fill('旧Aの通知');
      await expect(preview.locator('#observed')).toHaveText('Bの現在値');
      await expect(preview.locator('#active')).toHaveText('1');
      await expect(preview.locator('#notifications')).toHaveText('0');
      await preview.getByRole('button', { name: '表示を切り替える', exact: true }).click();
      await expect(preview.locator('#observed')).toHaveCount(0);
      await expect(preview.locator('#active')).toHaveText('0');
      await preview.getByRole('textbox', { name: '外部入力B', exact: true }).fill('再表示の現在値');
      await preview.getByRole('button', { name: '表示を切り替える', exact: true }).click();
      await expect(preview.locator('#observed')).toHaveText('再表示の現在値');
      await expect(preview.locator('#active')).toHaveText('1');
    } else {
      await expect(preview.locator('#observed-a')).toHaveText('初期A');
      await expect(preview.locator('#observed-b')).toHaveText('初期B');
      await preview.getByRole('textbox', { name: '外部入力A', exact: true }).fill('Aだけ更新');
      await expect(preview.locator('#observed-a')).toHaveText('Aだけ更新');
      await expect(preview.locator('#observed-b')).toHaveText('初期B');
      await preview.locator('#toggle').focus();
      await page.keyboard.press('Enter');
      await expect(preview.locator('#observed-a')).toHaveCount(0);
      await expect(preview.locator('#active')).toHaveText('1');
      await preview.getByRole('textbox', { name: '外部入力A', exact: true }).fill('再表示A');
      await preview.getByRole('textbox', { name: '外部入力B', exact: true }).fill('Bだけ更新');
      await expect(preview.locator('#observed-b')).toHaveText('Bだけ更新');
      await expect(preview.locator('#notifications')).toHaveText('2');
      await preview.locator('#toggle').click();
      await expect(preview.locator('#observed-a')).toHaveText('再表示A');
      await expect(preview.locator('#observed-b')).toHaveText('Bだけ更新');
      await expect(preview.locator('#active')).toHaveText('2');
    }
    await page.screenshot({ path: info.outputPath(`${lesson}-real-dom.png`), fullPage: true });
    await page.getByRole('button', { name: 'プレビューを広く表示', exact: true }).click();
    await page.getByRole('button', { name: '100%で見る', exact: true }).click();
    await page.screenshot({ path: info.outputPath(`${lesson}-expanded.png`), fullPage: true });
    await page.getByRole('button', { name: '編集画面に戻す', exact: true }).click();
    await page.getByRole('button', { name: '判定する', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'ピースがはまりました', exact: true }),
    ).toBeVisible({
      timeout: 20_000,
    });
    const before = await readStoredProgress(page);
    expect((before.drafts[0]?.validationHistory as { status: string }[]).at(-1)?.status).toBe(
      'pass',
    );
    expect((await new AxeBuilder({ page }).exclude('iframe').analyze()).violations).toEqual([]);
    await page.goto(route);
    await expect.poll(() => copyEditorSource(page)).toBe(solution);
    await page.reload();
    await expect.poll(() => copyEditorSource(page)).toBe(solution);
    expect((await readStoredProgress(page)).drafts[0]?.files).toEqual(before.drafts[0]?.files);
    await page.getByRole('button', { name: 'プレビューを更新', exact: true }).click();
    if (lesson.endsWith('10')) {
      await expect(preview.getByRole('textbox', { name: '名前', exact: true })).toHaveValue('');
      await expect(preview.locator('#length')).toHaveText('0');
    } else {
      await expect(preview.getByRole('textbox', { name: '外部入力A', exact: true })).toHaveValue(
        '初期A',
      );
      await expect(preview.locator('#active')).toHaveText(lesson.endsWith('11') ? '1' : '2');
    }
    await page.getByRole('button', { name: '最初に戻す', exact: true }).click();
    await page
      .getByRole('dialog', { name: '最初のコードに戻しますか？' })
      .getByRole('button', { name: '最初のコードに戻す', exact: true })
      .click();
    await expect.poll(() => copyEditorSource(page)).toBe(starter);
    await waitForStoredDraftContent(page, starter);
  });
}

test('390pxでRef・Effect・Custom Hookの9SlideとPC案内を読める', async ({ page }, info) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  for (const lesson of lessons) {
    for (let index = 1; index <= 3; index += 1) {
      const slide = `${lesson}-s0${String(index)}`;
      await page.goto(`${testBasePath()}#/courses/react/lessons/${lesson}/slides/${slide}`);
      await expect(page.getByTestId('slide-stage')).toHaveAttribute('data-slide-id', slide);
      await expectStoredViewedSlide(page, lesson, slide);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        390,
      );
      await page.screenshot({ path: info.outputPath(`${slide}-mobile.png`), fullPage: true });
    }
  }
  await page.goto(
    `${testBasePath()}#/courses/react/lessons/react-ch01-l12/exercises/react-ch01-l12-e01`,
  );
  await expect(page.getByRole('heading', { name: 'PCで演習を開く', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '判定する', exact: true })).toHaveCount(0);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: info.outputPath('hooks-mobile-pc-notice.png'), fullPage: true });
});
