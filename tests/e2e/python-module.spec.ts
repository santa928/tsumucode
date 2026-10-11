import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { strFromU8, unzipSync } from 'fflate';
import { parse } from 'yaml';
import { testBasePath } from './helpers/testBasePath';
import { editorText, replaceEditorText, readStoredProgress } from './helpers/progress';

const base = testBasePath();
const lessons = ['python-basics-ch01-l08', 'python-basics-ch01-l09', 'python-basics-ch02-l01'];
const paths = ['main.py', 'lesson_tools.py'];
const root = (id: string) =>
  `content/python-basics/chapters/${id.slice(0, -4)}/lessons/${id}/exercises/${id}-e01`;
const route = (id: string) => `${base}#/courses/python-basics/lessons/${id}/exercises/${id}-e01`;

/** 通常保存の実値だけを読み、実行結果を合成しない。 */
async function draft(page: Page, id: string) {
  return (await readStoredProgress(page)).drafts.find(
    (item) => item['workspaceId'] === `${id}-e01`,
  );
}

async function editFiles(page: Page, files: Readonly<Record<string, string>>) {
  for (const path of paths) {
    await page.getByRole('tab', { name: path, exact: true }).click();
    await replaceEditorText(page, files[path]!);
  }
}

async function sources(id: string, directory: string): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  for (const path of paths) {
    files[path] = await readFile(`${root(id)}/${directory}/${path}`, 'utf8');
  }
  return files;
}

/** 小制作の成功時は通常の完成画面を経て、同じWorkspaceで編集を再開する。 */
async function finishPassing(page: Page, id: string) {
  if (id === lessons[2]) {
    await expect(
      page.getByRole('heading', { name: 'ピースがはまりました', exact: true }),
    ).toBeVisible({
      timeout: 30_000,
    });
    await page.goto(route(id));
    await expect(page.locator('.cm-content')).toBeVisible();
  } else {
    await expect(page.getByRole('heading', { name: 'できました', exact: true })).toBeVisible({
      timeout: 30_000,
    });
    await page.getByRole('button', { name: '閉じる', exact: true }).click();
  }
}

for (const id of lessons) {
  const exercise = parse(readFileSync(`${root(id)}/exercise.yaml`, 'utf8')) as {
    fixtures: {
      id: string;
      expectedStatus: string;
      inputLines: string[];
      expectedFeedbackRuleIds: string[];
      files: { path: string; source: string }[];
    }[];
  };
  // 多数のWASM実行を作者Browserの単一contextへ蓄積しない。
  for (let offset = 0; offset < exercise.fixtures.length; offset += 4) {
    const fixtures = exercise.fixtures.slice(offset, offset + 4);
    test(`Python ${id}の実Fixture ${String(offset + 1)}〜${String(offset + fixtures.length)}`, async ({
      page,
    }) => {
      test.setTimeout(180_000);
      await page.goto(route(id));
      await expect(page.locator('.cm-content')).toBeVisible();
      for (const fixture of fixtures) {
        await expect(page.getByRole('button', { name: '判定する', exact: true })).toBeEnabled({
          timeout: 30_000,
        });
        const files: Record<string, string> = {};
        for (const file of fixture.files) {
          files[file.path] = await readFile(`${root(id)}/${file.source}`, 'utf8');
        }
        await editFiles(page, files);
        if (id !== lessons[0]) {
          await page
            .getByLabel('入力を渡さない（行不足を確認する）')
            .setChecked(fixture.inputLines.length === 0);
          if (fixture.inputLines.length > 0)
            await page
              .getByLabel('実行前の入力（1行につきinput 1回）')
              .fill(fixture.inputLines.join('\n'));
        }
        const before = (await draft(page, id))?.['validationHistory'];
        await page.getByRole('button', { name: '判定する', exact: true }).click();
        if (fixture.expectedStatus === 'system-error') {
          await expect(page.getByText(/採点していません/).first()).toBeVisible({ timeout: 30_000 });
          await expect(page.getByRole('button', { name: '判定する', exact: true })).toBeEnabled({
            timeout: 30_000,
          });
          expect((await draft(page, id))?.['validationHistory'], fixture.id).toEqual(before);
          await expect(page.getByRole('dialog')).toHaveCount(0);
        } else {
          if (fixture.expectedStatus === 'pass') await finishPassing(page, id);
          else await expect(page.getByRole('dialog')).toBeVisible({ timeout: 30_000 });
          await expect
            .poll(
              async () =>
                (
                  (await draft(page, id))?.['validationHistory'] as { status: string }[] | undefined
                )?.at(-1)?.status,
              { message: fixture.id },
            )
            .toBe(fixture.expectedStatus);
          const history = (await draft(page, id))?.['validationHistory'] as {
            checks: { passed: boolean; ruleId: string }[];
          }[];
          expect(
            history
              .at(-1)
              ?.checks.filter((check) => !check.passed)
              .map((check) => check.ruleId),
            fixture.id,
          ).toEqual(fixture.expectedFeedbackRuleIds);
          if (fixture.expectedStatus !== 'pass')
            await page.getByRole('button', { name: '閉じる', exact: true }).click();
        }
        await expect.poll(async () => (await draft(page, id))?.['files']).toEqual(files);
        await expect(page.locator('iframe[title="Python実行環境"]')).toHaveCount(0);
      }
    });
  }
  test(`Python ${id}の両file保存・再開・Resetを確認する`, async ({ page }, info) => {
    await page.goto(route(id));
    await expect(page.locator('.cm-content')).toBeVisible();
    const solution = await sources(id, 'solution');
    await editFiles(page, solution);
    if (id !== lessons[0]) {
      await page.getByLabel('入力を渡さない（行不足を確認する）').uncheck();
      await page
        .getByLabel('実行前の入力（1行につきinput 1回）')
        .fill(id === lessons[1] ? '18' : '3\n5');
    }
    await page.getByRole('button', { name: '判定する', exact: true }).click();
    await finishPassing(page, id);
    await expect
      .poll(async () => draft(page, id))
      .toMatchObject({
        files: solution,
        lastPassingSnapshots: { [`${id}-e01`]: { files: solution } },
      });
    await page.getByRole('tab', { name: 'lesson_tools.py', exact: true }).focus();
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByRole('tab', { name: 'main.py', exact: true })).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: 'lesson_tools.py', exact: true })).toBeFocused();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({ path: info.outputPath(`${id}.png`), fullPage: true });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('.cm-content')).toBeVisible();
    await page.getByRole('tab', { name: 'lesson_tools.py', exact: true }).click();
    await expect.poll(() => editorText(page)).toBe(solution['lesson_tools.py']);
    await expect.poll(async () => (await draft(page, id))?.['files']).toEqual(solution);
    if (id !== lessons[0])
      await expect(page.getByLabel('実行前の入力（1行につきinput 1回）')).toHaveValue('');
    await page.getByRole('button', { name: '最初に戻す', exact: true }).click();
    await page
      .getByRole('dialog', { name: '最初のコードに戻しますか？' })
      .getByRole('button', { name: '最初のコードに戻す', exact: true })
      .click();
    await expect
      .poll(async () => (await draft(page, id))?.['files'])
      .toEqual(await sources(id, 'starter'));
  });
}

test('Python 2fileのcache非混入・古い結果拒否・ZIP・JSON再開を確認する', async ({
  page,
  browser,
}, info) => {
  test.setTimeout(180_000);
  const id = lessons[2]!;
  const solution = await sources(id, 'solution');
  await page.goto(route(id));
  await expect(page.getByRole('button', { name: '判定する', exact: true })).toBeEnabled({
    timeout: 30_000,
  });
  await editFiles(page, solution);
  const input = page.getByLabel('実行前の入力（1行につきinput 1回）');
  await input.fill('3\n5');
  await page.getByRole('button', { name: '判定する', exact: true }).click();
  await finishPassing(page, id);
  await input.fill('3\n5');
  const history = (await draft(page, id))?.['validationHistory'];
  await page.route(/\/api\/session$|\/python-runtime\/314\.0\.7\/core\.wasm$/u, async (request) => {
    await new Promise((resolve) => setTimeout(resolve, 1200));
    await request.continue().catch(() => undefined);
  });
  await page.getByRole('button', { name: '判定する', exact: true }).click();
  await page.getByRole('tab', { name: 'lesson_tools.py', exact: true }).click();
  const changed = solution['lesson_tools.py']!.replace('left + right', 'left + left');
  await replaceEditorText(page, changed);
  await page.unrouteAll({ behavior: 'wait' });
  await expect(page.getByRole('button', { name: '判定する', exact: true })).toBeEnabled({
    timeout: 30_000,
  });
  expect((await draft(page, id))?.['validationHistory']).toEqual(history);
  await page.getByRole('button', { name: 'プレビューを更新', exact: true }).click();
  await expect(
    page.getByRole('region', { name: 'Console出力' }).getByText('0', { exact: true }),
  ).toBeVisible({ timeout: 30_000 });
  await page.goto(route(lessons[0]!));
  await expect(page.getByRole('button', { name: '判定する', exact: true })).toBeEnabled({
    timeout: 30_000,
  });
  await editFiles(page, await sources(lessons[0]!, 'solution'));
  await page.getByRole('button', { name: 'プレビューを更新', exact: true }).click();
  await expect(
    page.getByRole('region', { name: 'Console出力' }).getByText('8', { exact: true }),
  ).toBeVisible({ timeout: 30_000 });
  await page.goto(route(id));
  await expect(page.getByRole('button', { name: '判定する', exact: true })).toBeEnabled({
    timeout: 30_000,
  });
  await page.getByRole('tab', { name: 'lesson_tools.py', exact: true }).click();
  await expect.poll(() => editorText(page)).toBe(changed);
  await editFiles(page, solution);
  await input.fill('3\n5');
  await page.getByRole('button', { name: '判定する', exact: true }).click();
  await finishPassing(page, id);
  const beforeZip = await draft(page, id);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '制作Sourceを持ち出す', exact: true }).click();
  const zipPath = info.outputPath('python-source.zip');
  await (await download).saveAs(zipPath);
  const entries = unzipSync(await readFile(zipPath));
  expect(Object.keys(entries).sort()).toEqual(['README.md', ...paths].sort());
  for (const path of paths) expect(strFromU8(entries[path]!)).toBe(solution[path]);
  expect(await draft(page, id)).toEqual(beforeZip);
  await page.goto(`${base}#/`);
  const jsonDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: '全コースの進捗と下書きを書き出す', exact: true }).click();
  const jsonPath = info.outputPath('python-progress.json');
  await (await jsonDownload).saveAs(jsonPath);
  const fresh = await browser.newContext({ baseURL: page.url().split('#')[0]! });
  try {
    const imported = await fresh.newPage();
    await imported.goto('./#/');
    await imported.getByLabel('書き出した学習データを読み込む').setInputFiles({
      name: 'progress.json',
      mimeType: 'application/json',
      buffer: await readFile(jsonPath),
    });
    await expect(imported.getByRole('region', { name: '読み込み差分' })).toBeVisible();
    const reload = imported.waitForEvent('domcontentloaded');
    await imported.getByRole('button', { name: 'この内容を読み込む', exact: true }).click();
    await reload;
    await expect
      .poll(async () => draft(imported, id))
      .toMatchObject({
        files: solution,
        lastPassingSnapshots: { [`${id}-e01`]: { files: solution } },
      });
    await imported.goto(route(id));
    await expect(imported.locator('.cm-content')).toBeVisible();
    await imported.getByRole('tab', { name: 'lesson_tools.py', exact: true }).click();
    await expect.poll(() => editorText(imported)).toBe(solution['lesson_tools.py']);
    await expect(imported.getByLabel('実行前の入力（1行につきinput 1回）')).toHaveValue('');
  } finally {
    await fresh.close();
  }
});

test('Python Module・例外・小制作の読書と予測を狭幅で確認する', async ({ page }, info) => {
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  await page.setViewportSize({ width: 390, height: 844 });
  for (const id of lessons) {
    await page.goto(`${base}#/courses/python-basics/lessons/${id}/slides/${id}-s01`);
    const answer = page.getByText('答えと理由を見る', { exact: true });
    await expect(answer).toBeVisible();
    await answer.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('section[aria-label="結果を予測する"] details')).toHaveAttribute(
      'open',
      '',
    );
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({ path: info.outputPath(`${id}-reading.png`), fullPage: true });
  }
  expect(requests.filter((url) => /python-runtime\/|assets\/pythonRuntime-/u.test(url))).toEqual(
    [],
  );
});
