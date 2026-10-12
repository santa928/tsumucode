import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { testBasePath } from './helpers/testBasePath';
import { editorText, readStoredProgress, replaceEditorText } from './helpers/progress';

const base = testBasePath();
const courseId = 'python-practice';
const route = (lessonId: string) =>
  `${base}#/courses/${courseId}/lessons/${lessonId}/exercises/${lessonId}-e01`;

async function draft(page: Page, exerciseId: string) {
  return (await readStoredProgress(page)).drafts.find(
    (value) => value['workspaceId'] === exerciseId,
  );
}

async function finishGrade(page: Page, exerciseId: string, status: string) {
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

test('反復の実Previewを入力なしで再実行し、Keyboardと代表画面を確認する', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'chromium' && info.project.name !== '');
  const lessonId = 'python-practice-ch01-l03';
  const exerciseId = `${lessonId}-e01`;
  const source = await readFile(
    `content/python-practice/chapters/python-practice-ch01/lessons/${lessonId}/exercises/${exerciseId}/solution/main.py`,
    'utf8',
  );
  await page.goto(route(lessonId));
  await expect(page.locator('.cm-content')).toBeVisible();
  const update = page.getByRole('button', { name: 'プレビューを更新', exact: true });
  await expect(update).toBeEnabled({ timeout: 30_000 });
  await replaceEditorText(page, source);
  await update.click();
  const output = page.getByRole('region', { name: 'Console出力', exact: true });
  await expect(output).toContainText('作成済み', { timeout: 30_000 });
  await expect(output).toContainText('[6, 10]');
  await expect(update).toBeEnabled();
  await update.focus();
  await expect(update).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: '判定する', exact: true })).toBeFocused();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: info.outputPath('python-iteration-preview.png'), fullPage: true });
});

for (const number of [1, 2, 3]) {
  const lessonId = `python-practice-ch01-l0${String(number)}`;
  const exerciseId = `${lessonId}-e01`;
  const directory = `content/python-practice/chapters/python-practice-ch01/lessons/${lessonId}/exercises/${exerciseId}`;
  test(`反復l0${String(number)}の正負Fixtureを通常画面の実行・採点で確認する`, async ({
    page,
  }, info) => {
    test.setTimeout(240_000);
    // 他BrowserはWorker変更の代表Generatorだけを確認する。
    test.skip(info.project.name !== 'chromium' && info.project.name !== '' && number !== 3);
    const exercise = parse(await readFile(`${directory}/exercise.yaml`, 'utf8')) as {
      fixtures: { id: string; expectedStatus: string; files: { source: string }[] }[];
    };
    await page.goto(route(lessonId));
    await expect(page.locator('.cm-content')).toBeVisible();
    await expect(page.getByRole('button', { name: '判定する', exact: true })).toBeEnabled({
      timeout: 30_000,
    });
    await expect(page.getByLabel('実行前の入力（1行につきinput 1回）')).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'CPythonの練習実行' })).toHaveCount(0);
    for (const fixture of exercise.fixtures) {
      if (info.project.name === 'firefox' || info.project.name === 'webkit') {
        if (!['solution', 'unused-generator'].includes(fixture.id)) continue;
      }
      await expect(page.getByRole('button', { name: '判定する', exact: true })).toBeEnabled();
      const source = await readFile(`${directory}/${fixture.files[0]!.source}`, 'utf8');
      await replaceEditorText(page, source);
      const previous = (await draft(page, exerciseId))?.['validationHistory'];
      if (fixture.expectedStatus === 'system-error') {
        await page.getByRole('button', { name: '判定する', exact: true }).click();
        await expect(page.getByText(/採点していません/).last()).toBeVisible({ timeout: 30_000 });
        await expect(page.getByRole('button', { name: '判定する', exact: true })).toBeEnabled();
        expect((await draft(page, exerciseId))?.['validationHistory']).toEqual(previous);
        await expect(page.getByRole('dialog')).toHaveCount(0);
      } else {
        await finishGrade(page, exerciseId, fixture.expectedStatus);
      }
      expect(await editorText(page), fixture.id).toBe(source);
    }
    const solution = await readFile(`${directory}/solution/main.py`, 'utf8');
    await replaceEditorText(page, solution);
    await finishGrade(page, exerciseId, 'pass');
    await expect
      .poll(async () => (await draft(page, exerciseId))?.['files'])
      .toEqual({ 'main.py': solution });
    const passing = (await draft(page, exerciseId))?.['lastPassingSnapshots'];
    await page.reload();
    await expect(page.locator('.cm-content')).toBeVisible();
    await expect.poll(() => editorText(page)).toBe(solution);
    expect((await draft(page, exerciseId))?.['lastPassingSnapshots']).toEqual(passing);
    if (number === 3 && (info.project.name === 'chromium' || info.project.name === '')) {
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await page.screenshot({
        path: info.outputPath('python-iteration-generator.png'),
        fullPage: true,
      });
    }
  });
}

test('反復Courseの保存・Reset・JSON移行は基礎Courseの成功版を保持する', async ({
  page,
  browser,
}, info) => {
  test.setTimeout(180_000);
  test.skip(info.project.name !== 'chromium' && info.project.name !== '');
  const basicsId = 'python-basics-ch01-l01-e01';
  await page.goto(
    `${base}#/courses/python-basics/lessons/python-basics-ch01-l01/exercises/${basicsId}`,
  );
  await expect(page.locator('.cm-content')).toBeVisible();
  await expect(page.getByRole('button', { name: '判定する', exact: true })).toBeEnabled({
    timeout: 30_000,
  });
  await replaceEditorText(page, 'count = 3\nprint(count)\nprint(count + 2)\n');
  await finishGrade(page, basicsId, 'pass');
  const basics = await draft(page, basicsId);
  const lessonId = 'python-practice-ch01-l01';
  const exerciseId = `${lessonId}-e01`;
  const directory = `content/python-practice/chapters/python-practice-ch01/lessons/${lessonId}/exercises/${exerciseId}`;
  const solution = await readFile(`${directory}/solution/main.py`, 'utf8');
  const starter = await readFile(`${directory}/starter/main.py`, 'utf8');
  await page.goto(route(lessonId));
  await expect(page.locator('.cm-content')).toBeVisible();
  await expect(page.getByRole('button', { name: '判定する', exact: true })).toBeEnabled({
    timeout: 30_000,
  });
  await replaceEditorText(page, solution);
  await finishGrade(page, exerciseId, 'pass');
  await page.getByRole('button', { name: '最初に戻す', exact: true }).click();
  await page
    .getByRole('dialog', { name: '最初のコードに戻しますか？' })
    .getByRole('button', { name: '最初のコードに戻す', exact: true })
    .click();
  await expect.poll(() => editorText(page)).toBe(starter);
  expect(await draft(page, basicsId)).toEqual(basics);
  await replaceEditorText(page, solution);
  await finishGrade(page, exerciseId, 'pass');
  await page.goto(`${base}#/`);
  await expect(page.getByRole('link', { name: /Pythonの反復と遅延生成/ })).toHaveCount(0);
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: '全コースの進捗と下書きを書き出す', exact: true }).click();
  const file = info.outputPath('python-iteration-progress.json');
  await (await downloading).saveAs(file);
  const fresh = await browser.newContext({ baseURL: page.url().split('#')[0]! });
  try {
    const imported = await fresh.newPage();
    await imported.goto('./#/');
    await imported.getByLabel('書き出した学習データを読み込む').setInputFiles({
      name: 'progress.json',
      mimeType: 'application/json',
      buffer: await readFile(file),
    });
    await expect(imported.getByRole('region', { name: '読み込み差分' })).toBeVisible();
    const reload = imported.waitForEvent('domcontentloaded');
    await imported.getByRole('button', { name: 'この内容を読み込む', exact: true }).click();
    await reload;
    await expect
      .poll(async () => (await draft(imported, exerciseId))?.['files'])
      .toEqual({ 'main.py': solution });
    expect((await draft(imported, basicsId))?.['lastPassingSnapshots']).toEqual(
      basics?.['lastPassingSnapshots'],
    );
    await imported.goto(route(lessonId));
    await expect(imported.locator('.cm-content')).toBeVisible();
    await expect.poll(() => editorText(imported)).toBe(solution);
  } finally {
    await fresh.close();
  }
});
