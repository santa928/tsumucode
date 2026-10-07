import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readStoredProgress, waitForStoredDraftContent } from './helpers/progress';
import { testBasePath } from './helpers/testBasePath';
import { expectStoredViewedSlide } from './helpers/releaseCourse';

/** 画面外の行も含め、CodeMirrorの通常の全文コピーから編集Sourceを読む。 */
async function copyEditorSource(page: Page): Promise<string> {
  await page.locator('.cm-content').click();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+C' : 'Control+C');
  return page.evaluate(() => navigator.clipboard.readText());
}

/** キーボードで全文を置換し、保存とコピーの両方で欠落のないSourceを確認する。 */
async function replaceSource(page: Page, source: string): Promise<void> {
  await page.locator('.cm-content').click();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
  await page.keyboard.insertText(source);
  await waitForStoredDraftContent(page, source);
  await expect.poll(() => copyEditorSource(page)).toBe(source);
}

for (const lesson of ['react-ch01-l08', 'react-ch01-l09']) {
  const exercise = `${lesson}-e01`;
  const root = `content/react/chapters/react-ch01/lessons/${lesson}/exercises/${exercise}`;
  const route = `${testBasePath()}#/courses/react/lessons/${lesson}/exercises/${exercise}`;
  test(`${lesson}のReducer・Context修正を実操作・判定・保存・ResetとKeyboard Hintへ接続する`, async ({
    page,
  }, info) => {
    test.setTimeout(90_000);
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    for (let index = 1; index <= 3; index += 1) {
      const slide = `${lesson}-s0${String(index)}`;
      await page.goto(`${testBasePath()}#/courses/react/lessons/${lesson}/slides/${slide}`);
      await expect(page.getByTestId('slide-stage')).toHaveAttribute('data-slide-id', slide);
      await expectStoredViewedSlide(page, lesson, slide);
    }
    await page.goto(route);
    const editableFile = lesson.endsWith('08') ? 'reducer.ts' : 'components.tsx';
    const starter = await readFile(`${root}/starter/${editableFile}`, 'utf8');
    await expect.poll(() => copyEditorSource(page)).toBe(starter);
    const trigger = page.getByRole('button', { name: 'ヒントを見る', exact: true });
    await expect(trigger).toBeEnabled();
    await trigger.focus();
    await expect(trigger).toBeFocused();
    await page.keyboard.press('Enter');
    const hint = page
      .getByRole('dialog', { name: 'ヒント', exact: true })
      .getByRole('button', { name: /^ヒント1を見る/u });
    await hint.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', { name: 'ヒント', exact: true })).toContainText(
      lesson.endsWith('08')
        ? 'reducer.tsのsubmitted分岐と送信直後の表示を見比べます。'
        : 'components.tsxのNameSummaryが表示する文字列に注目します。',
    );
    await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();
    const solution = await readFile(`${root}/solution/${editableFile}`, 'utf8');
    await replaceSource(page, solution);
    const update = page.getByRole('button', { name: 'プレビューを更新', exact: true });
    await expect(update).toBeEnabled();
    await update.focus();
    await expect(update).toBeFocused();
    await page.keyboard.press('Enter');
    const preview = page.frameLocator('iframe[title="Reactコードのプレビュー"]');
    await expect(
      preview.getByRole('heading', {
        name: lesson.endsWith('08') ? '名前のForm' : 'Contextで共有する名前',
        exact: true,
      }),
    ).toBeVisible({ timeout: 20_000 });
    const input = preview.getByRole('textbox', { name: '名前', exact: true });
    await expect(input).toHaveValue('');
    await input.fill('   ');
    await expect(preview.locator('#length')).toHaveText('3');
    if (lesson.endsWith('08')) {
      await input.press('Enter');
      await expect(preview.locator('#message')).toHaveText('名前を入力してください');
      await expect(input).toHaveAttribute('aria-invalid', 'true');
      await input.fill('Ada');
      await expect(input).toHaveAttribute('aria-invalid', 'false');
      await expect(preview.locator('#message')).toHaveText('入力中');
      await input.press('Enter');
      await expect(preview.locator('#message')).toHaveText('送信を受け付けました');
    } else {
      await input.fill('Ada');
      await expect(preview.locator('#name-summary')).toHaveText('Ada');
    }
    await input.fill('TypeScript');
    await expect(input).toHaveValue('TypeScript');
    await expect(preview.locator('#length')).toHaveText('10');
    if (lesson.endsWith('09'))
      await expect(preview.locator('#name-summary')).toHaveText('TypeScript');
    await preview.getByRole('button', { name: 'やり直し', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(input).toHaveValue('');
    await expect(preview.locator('#length')).toHaveText('0');
    await input.fill('React');
    await expect(preview.locator('#length')).toHaveText('5');
    await page.screenshot({ path: info.outputPath(`${lesson}-real-dom.png`), fullPage: true });
    await page.getByRole('button', { name: '判定する', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'ピースがはまりました', exact: true }),
    ).toBeVisible({ timeout: 20_000 });
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
    // 保存されるのはSource。新しいrunではReactの一時Stateを初期値から描画する。
    await page.getByRole('button', { name: 'プレビューを更新', exact: true }).click();
    await expect(preview.getByRole('textbox', { name: '名前', exact: true })).toHaveValue('');
    await expect(preview.locator('#length')).toHaveText('0');
    await page.getByRole('button', { name: '最初に戻す', exact: true }).click();
    await page
      .getByRole('dialog', { name: '最初のコードに戻しますか？' })
      .getByRole('button', { name: '最初のコードに戻す', exact: true })
      .click();
    await expect.poll(() => copyEditorSource(page)).toBe(starter);
    await waitForStoredDraftContent(page, starter);
  });
}

test('390pxでReducer・Contextの6SlideとPC案内を読める', async ({ page }, info) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  for (const lesson of ['react-ch01-l08', 'react-ch01-l09']) {
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
    `${testBasePath()}#/courses/react/lessons/react-ch01-l09/exercises/react-ch01-l09-e01`,
  );
  await expect(page.getByRole('heading', { name: 'PCで演習を開く', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '判定する', exact: true })).toHaveCount(0);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({
    path: info.outputPath('reducer-context-mobile-pc-notice.png'),
    fullPage: true,
  });
});
