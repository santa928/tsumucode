import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { parse } from 'yaml';
import {
  editorText,
  readStoredProgress,
  replaceEditorText,
  waitForStoredDraftContent,
} from './helpers/progress';
import { testBasePath } from './helpers/testBasePath';

const base = testBasePath();
const lessonId = 'python-basics-ch01-l01';
const exerciseId = `${lessonId}-e01`;
const sourceRoot = `content/python-basics/chapters/python-basics-ch01/lessons/${lessonId}/exercises/${exerciseId}`;
const exerciseRoute = `${base}#/courses/python-basics/lessons/${lessonId}/exercises/${exerciseId}`;

/** Python以外の保存値を除き、通常UIで書いた実行履歴を確認する。 */
async function draft(page: Page) {
  return (await readStoredProgress(page)).drafts.find(
    (value) => value['courseId'] === 'python-basics',
  );
}

test('PythonのHome・Path・読書はcoreを取得せず、狭幅で予測を開閉できる', async ({ page }, info) => {
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  await page.goto(`${base}#/`);
  await expect(page.getByText('Python 値と変数の第一歩', { exact: true }).first()).toBeVisible();
  await page.goto(`${base}#/paths/python-basics`);
  await expect(
    page.getByRole('heading', { name: 'Python入門の学習パス', exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}#/courses/python-basics/lessons/${lessonId}/slides/${lessonId}-s03`);
  await expect(
    page.getByRole('heading', { name: '変数の値と計算の結果を表示する', exact: true }),
  ).toBeVisible();
  const answer = page.getByText('count、5の順で2行を表示します。', { exact: true });
  await expect(answer).toBeHidden();
  await page.getByText('答えと理由を見る', { exact: true }).click();
  await expect(answer).toBeVisible();
  expect(requests.filter((url) => /python-runtime\/|assets\/pythonRuntime-/u.test(url))).toEqual(
    [],
  );
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: info.outputPath('python-mobile-reading.png'), fullPage: true });
});

test('公開Pythonの実Worker・取得障害後の再試行・別タブ通知・新規Contextへの移送を確認する', async ({
  page,
  browser,
}, info) => {
  test.setTimeout(120_000);
  await page.goto(exerciseRoute);
  await expect(page.locator('.cm-content')).toBeVisible();
  const solution = await readFile(`${sourceRoot}/solution/main.py`, 'utf8');
  await replaceEditorText(page, solution);
  await waitForStoredDraftContent(page, solution);
  await page.getByRole('button', { name: '判定する', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'できました', exact: true })).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole('button', { name: '閉じる', exact: true }).click();
  await expect
    .poll(async () => draft(page))
    .toMatchObject({ files: { 'main.py': solution }, validationHistory: [{ status: 'pass' }] });
  const passed = await draft(page);
  const link = page.getByRole('link', {
    name: 'Python実行環境のライセンスと対象ソース（別タブ）',
    exact: true,
  });
  const popup = page.waitForEvent('popup');
  await link.click();
  const notices = await popup;
  await expect(
    notices.getByRole('heading', { name: 'Python実行環境のライセンスと対象ソース', exact: true }),
  ).toBeVisible();
  await expect(notices.getByRole('link', { name: 'pyodide-MPL.txt', exact: true })).toBeVisible();
  expect(await notices.evaluate(() => window.opener === null)).toBe(true);
  await notices.close();
  await page.route('**/python-runtime/314.0.7/core.wasm', (route) =>
    route.fulfill({ status: 503, body: 'unavailable' }),
  );
  await page.getByRole('button', { name: '判定する', exact: true }).click();
  await expect(
    page.getByText('実行環境で問題が起きました。採点していません。', { exact: true }),
  ).toBeVisible({ timeout: 30_000 });
  expect((await draft(page))?.['validationHistory']).toEqual(passed?.['validationHistory']);
  expect(await editorText(page)).toBe(solution);
  await expect(page.locator('iframe[title="Python実行環境"]')).toHaveCount(0);
  await page.unroute('**/python-runtime/314.0.7/core.wasm');
  await page.getByRole('button', { name: '判定する', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'できました', exact: true })).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole('button', { name: '閉じる', exact: true }).click();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: info.outputPath('python-public-exercise.png'), fullPage: true });
  await page.reload();
  await expect.poll(() => editorText(page)).toBe(solution);
  await page.goto(`${base}#/`);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '全コースの進捗と下書きを書き出す', exact: true }).click();
  const bundlePath = info.outputPath('python-progress.json');
  await (await download).saveAs(bundlePath);
  const fresh = await browser.newContext({ baseURL: page.url().split('#')[0]! });
  try {
    const imported = await fresh.newPage();
    await imported.goto('./#/');
    await imported.getByLabel('書き出した学習データを読み込む').setInputFiles({
      name: 'python-progress.json',
      mimeType: 'application/json',
      buffer: await readFile(bundlePath),
    });
    await expect(imported.getByRole('region', { name: '読み込み差分' })).toBeVisible();
    const reload = imported.waitForEvent('domcontentloaded');
    await imported.getByRole('button', { name: 'この内容を読み込む', exact: true }).click();
    await reload;
    await expect
      .poll(async () => draft(imported))
      .toMatchObject({
        files: { 'main.py': solution },
        lastPassingSnapshots: { [exerciseId]: { files: { 'main.py': solution } } },
      });
    await imported.goto(exerciseRoute);
    await expect.poll(() => editorText(imported)).toBe(solution);
  } finally {
    await fresh.close();
  }
});

test('公開Pythonの10Fixtureは実出力と2Ruleで採点する', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', '全10件はChromium、他browserは代表公開経路を検証する');
  test.setTimeout(180_000);
  const exercise = parse(await readFile(`${sourceRoot}/exercise.yaml`, 'utf8')) as {
    fixtures: {
      id: string;
      expectedStatus: string;
      expectedFeedbackRuleIds: string[];
      files: { source: string }[];
    }[];
  };
  await page.goto(exerciseRoute);
  await expect(page.locator('.cm-content')).toBeVisible();
  for (const fixture of exercise.fixtures) {
    const source = await readFile(`${sourceRoot}/${fixture.files[0]!.source}`, 'utf8');
    await replaceEditorText(page, source);
    await page.getByRole('button', { name: '判定する', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 30_000 });
    await expect
      .poll(async () => {
        const history = (await draft(page))?.['validationHistory'] as
          { status: string; checks: { passed: boolean; ruleId: string }[] }[] | undefined;
        return history?.at(-1);
      })
      .toMatchObject({ status: fixture.expectedStatus });
    const history = (await draft(page))?.['validationHistory'] as {
      checks: { passed: boolean; ruleId: string }[];
    }[];
    expect(
      history
        .at(-1)
        ?.checks.filter(({ passed }) => !passed)
        .map(({ ruleId }) => ruleId),
      fixture.id,
    ).toEqual(fixture.expectedFeedbackRuleIds);
    const close = page.getByRole('button', {
      name: '閉じる',
      exact: true,
    });
    await close.click();
    await expect(page.locator('iframe[title="Python実行環境"]')).toHaveCount(0);
  }
});
