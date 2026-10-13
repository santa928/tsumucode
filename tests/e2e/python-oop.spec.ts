import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { testBasePath } from './helpers/testBasePath';
import { readStoredProgress, replaceEditorText } from './helpers/progress';

const base = testBasePath();
const route = (lesson: string) =>
  `${base}#/courses/python-oop/lessons/${lesson}/exercises/${lesson}-e01`;

async function draft(page: Page, exerciseId: string) {
  return (await readStoredProgress(page)).drafts.find(
    (value) => value['workspaceId'] === exerciseId,
  );
}

/** 表示行の仮想化やSaveStatusのidle表示に依存せず、対象workspaceの保存全文を照合する。 */
async function expectSavedSource(page: Page, exerciseId: string, source: string) {
  await expect
    .poll(async () => {
      const files = (await draft(page, exerciseId))?.['files'];
      if (typeof files !== 'object' || files === null) return undefined;
      return (files as Record<string, unknown>)['main.py'];
    })
    .toBe(source);
}

async function grade(page: Page, exerciseId: string, status: string) {
  await page.getByRole('button', { name: '判定する', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 30_000 });
  await expect
    .poll(async () => {
      const history = (await draft(page, exerciseId))?.['validationHistory'] as
        { status: string }[] | undefined;
      return history?.at(-1)?.status;
    })
    .toBe(status);
  await page.getByRole('button', { name: '閉じる', exact: true }).click();
}

for (const number of [1, 2]) {
  const lesson = `python-oop-ch01-l0${String(number)}`;
  const exerciseId = `${lesson}-e01`;
  const directory = `content/python-oop/chapters/python-oop-ch01/lessons/${lesson}/exercises/${exerciseId}`;
  test(`OOP l0${String(number)}の実判定と、誤呼出し後のSource・成功版・Resetを確認する`, async ({
    page,
  }, info) => {
    test.setTimeout(180_000);
    const solution = await readFile(`${directory}/solution/main.py`, 'utf8');
    const starter = await readFile(`${directory}/starter/main.py`, 'utf8');
    await page.goto(route(lesson));
    await expect(page.locator('.cm-content')).toBeVisible();
    const button = page.getByRole('button', { name: '判定する', exact: true });
    await expect(button).toBeEnabled({ timeout: 30_000 });
    await expect(page.getByLabel('実行前の入力（1行につきinput 1回）')).toHaveCount(0);
    await replaceEditorText(page, solution);
    await grade(page, exerciseId, 'pass');
    const passed = (await draft(page, exerciseId))?.['lastPassingSnapshots'];
    const output = page.getByRole('region', { name: 'Console出力', exact: true });
    await expect(output).toContainText(number === 1 ? 'True' : '12');
    await button.focus();
    await expect(button).toBeFocused();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({
      path: info.outputPath(`python-oop-l0${String(number)}-passed.png`),
      fullPage: true,
    });

    if (number === 2) {
      await replaceEditorText(page, 'class Counter(:\n    pass\n');
      await grade(page, exerciseId, 'code-error');
      expect((await draft(page, exerciseId))?.['lastPassingSnapshots']).toEqual(passed);
    }
    const wrongCall = await readFile(
      `${directory}/fixtures/${number === 1 ? 'wrong-constructor' : 'wrong-call'}.py`,
      'utf8',
    );
    await replaceEditorText(page, wrongCall);
    await grade(page, exerciseId, 'code-error');
    await expectSavedSource(page, exerciseId, wrongCall);
    expect((await draft(page, exerciseId))?.['lastPassingSnapshots']).toEqual(passed);
    await page.reload();
    await expect(page.locator('.cm-content')).toBeVisible();
    await expectSavedSource(page, exerciseId, wrongCall);
    await page.locator('.cm-content').focus();
    await page.keyboard.press('ControlOrMeta+End');
    const lastLine = wrongCall.trimEnd().split('\n').at(-1)!;
    await expect(page.locator('.cm-line').filter({ hasText: lastLine }).last()).toBeVisible();
    await expect(button).toBeEnabled({ timeout: 30_000 });

    const beforeUnsupported = (await draft(page, exerciseId))?.['validationHistory'];
    const unsupported = await readFile(
      `${directory}/fixtures/${number === 2 ? 'attribute-decorator' : 'builtin-alias'}.py`,
      'utf8',
    );
    await replaceEditorText(page, unsupported);
    await button.click();
    await expect(page.getByText(/採点していません/).last()).toBeVisible({ timeout: 30_000 });
    await expect(button).toBeEnabled();
    expect((await draft(page, exerciseId))?.['validationHistory']).toEqual(beforeUnsupported);
    expect((await draft(page, exerciseId))?.['lastPassingSnapshots']).toEqual(passed);
    await page.getByRole('button', { name: '最初に戻す', exact: true }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: '最初のコードに戻す', exact: true })
      .click();
    await expectSavedSource(page, exerciseId, starter);
    await replaceEditorText(page, solution);
    await grade(page, exerciseId, 'pass');
  });
}

test('OOPの草稿Slideを狭幅で読み、Classとmethodの説明図を確認する', async ({ page }, info) => {
  for (const [lesson, slide] of [
    ['python-oop-ch01-l01', 's01'],
    ['python-oop-ch01-l01', 's02'],
    ['python-oop-ch01-l01', 's03'],
    ['python-oop-ch01-l02', 's01'],
    ['python-oop-ch01-l02', 's02'],
    ['python-oop-ch01-l02', 's03'],
    ['python-oop-ch01-l02', 's04'],
  ] as const) {
    await page.goto(`${base}#/courses/python-oop/lessons/${lesson}/slides/${lesson}-${slide}`);
    await expect(page.getByTestId('slide-stage')).toHaveAttribute(
      'data-slide-id',
      `${lesson}-${slide}`,
    );
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({
      path: info.outputPath(`${lesson}-${slide}-desktop.png`),
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({
      path: info.outputPath(`${lesson}-${slide}-mobile.png`),
      fullPage: true,
    });
    await page
      .getByTestId('slide-stage')
      .getByRole('img')
      .screenshot({
        path: info.outputPath(`${lesson}-${slide}-mobile-diagram.png`),
      });
    await page.setViewportSize({ width: 1280, height: 960 });
  }
});
