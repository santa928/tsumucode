import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { testBasePath } from './helpers/testBasePath';
import { editorText, readStoredProgress, replaceEditorText } from './helpers/progress';

const base = testBasePath();
const lessonId = 'python-practice-ch02-l01';
const exerciseId = `${lessonId}-e01`;
const directory = `content/python-practice/chapters/python-practice-ch02/lessons/${lessonId}/exercises/${exerciseId}`;
const route = `${base}#/courses/python-practice/lessons/${lessonId}/exercises/${exerciseId}`;

async function draft(page: Page, id = exerciseId) {
  return (await readStoredProgress(page)).drafts.find((value) => value['workspaceId'] === id);
}

async function grade(page: Page, status: string, id = exerciseId) {
  await page.getByRole('button', { name: '判定する', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 30_000 });
  await expect
    .poll(async () => {
      const history = (await draft(page, id))?.['validationHistory'] as
        { status: string }[] | undefined;
      return history?.at(-1)?.status;
    })
    .toBe(status);
  await page.getByRole('button', { name: '閉じる', exact: true }).click();
}

for (const offset of [0, 4, 8, 12]) {
  test(`Context managerの正負Fixture ${String(offset + 1)}〜${String(Math.min(offset + 4, 14))}と実Previewを通常UIで確認する`, async ({
    page,
  }, info) => {
    test.setTimeout(180_000);
    test.skip(['firefox', 'webkit'].includes(info.project.name) && ![0, 4].includes(offset));
    const exercise = parse(await readFile(`${directory}/exercise.yaml`, 'utf8')) as {
      fixtures: { id: string; expectedStatus: string; files: { source: string }[] }[];
    };
    await page.goto(route);
    await expect(page.locator('.cm-content')).toBeVisible();
    const update = page.getByRole('button', { name: 'プレビューを更新', exact: true });
    await expect(update).toBeEnabled({ timeout: 30_000 });
    await expect(page.getByLabel('実行前の入力（1行につきinput 1回）')).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'CPythonの練習実行' })).toHaveCount(0);
    for (const fixture of exercise.fixtures.slice(offset, offset + 4)) {
      // Firefox/WebKitは実withと、stdoutを合わせたmanual closeの代表だけを確認する。
      if (
        ['firefox', 'webkit'].includes(info.project.name) &&
        !['solution', 'manual-close'].includes(fixture.id)
      )
        continue;
      await test.step(fixture.id, async () => {
        await expect(update).toBeEnabled({ timeout: 30_000 });
        const source = await readFile(`${directory}/${fixture.files[0]!.source}`, 'utf8');
        await replaceEditorText(page, source);
        const previous = (await draft(page))?.['validationHistory'] ?? [];
        if (fixture.expectedStatus === 'system-error') {
          await page.getByRole('button', { name: '判定する', exact: true }).click();
          await expect(page.getByText(/採点していません/).last()).toBeVisible({ timeout: 30_000 });
          await expect(update).toBeEnabled({ timeout: 30_000 });
          expect((await draft(page))?.['validationHistory'] ?? []).toEqual(previous);
          await expect(page.getByRole('dialog')).toHaveCount(0);
        } else {
          await grade(page, fixture.expectedStatus);
        }
        expect(await editorText(page), fixture.id).toBe(source);
      });
    }
    const solution = await readFile(`${directory}/solution/main.py`, 'utf8');
    await replaceEditorText(page, solution);
    await grade(page, 'pass');
    await update.click();
    await expect(page.getByRole('region', { name: 'Console出力', exact: true })).toContainText(
      '終了後は利用できない',
      { timeout: 30_000 },
    );
    await expect(update).toBeEnabled({ timeout: 30_000 });
    await update.focus();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: '判定する', exact: true })).toBeFocused();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({ path: info.outputPath('python-context-preview.png'), fullPage: true });
  });
}

test('Context managerの停止・再試行はSourceと採点履歴を保持する', async ({ page }, info) => {
  test.skip(['firefox', 'webkit'].includes(info.project.name));
  const solution = await readFile(`${directory}/solution/main.py`, 'utf8');
  await page.goto(route);
  await expect(page.locator('.cm-content')).toBeVisible();
  await expect(page.getByRole('button', { name: '判定する', exact: true })).toBeEnabled({
    timeout: 30_000,
  });
  await replaceEditorText(page, solution);
  await grade(page, 'pass');
  const history = (await draft(page))?.['validationHistory'];
  // 実行準備の実通信だけを遅らせ、中止操作の時間を確保する。
  await page.route(/\/api\/session$|\/python-runtime\/314\.0\.7\/core\.wasm$/u, async (request) => {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await request.continue().catch(() => undefined);
  });
  await page.getByRole('button', { name: '判定する', exact: true }).click();
  await page.getByRole('button', { name: '実行を停止', exact: true }).click();
  await expect(
    page.getByText('実行を停止しました。採点していません。', { exact: true }).first(),
  ).toBeVisible({ timeout: 30_000 });
  expect((await draft(page))?.['validationHistory']).toEqual(history);
  expect(await editorText(page)).toBe(solution);
  await page.unrouteAll({ behavior: 'wait' });
  await grade(page, 'pass');
});

test('旧実践revisionの移行とContextの保存・Reset・JSON移送を確認する', async ({
  page,
  browser,
}, info) => {
  test.setTimeout(180_000);
  test.skip(['firefox', 'webkit'].includes(info.project.name));
  const oldId = 'python-practice-ch01-l01-e01';
  const oldSolution = await readFile(
    'content/python-practice/chapters/python-practice-ch01/lessons/python-practice-ch01-l01/exercises/python-practice-ch01-l01-e01/solution/main.py',
    'utf8',
  );
  await page.goto(
    `${base}#/courses/python-practice/lessons/python-practice-ch01-l01/exercises/${oldId}`,
  );
  await expect(page.locator('.cm-content')).toBeVisible();
  await expect(page.getByRole('button', { name: '判定する', exact: true })).toBeEnabled({
    timeout: 30_000,
  });
  await replaceEditorText(page, oldSolution);
  await grade(page, 'pass', oldId);
  const previous = await draft(page, oldId);
  const course = parse(await readFile('content/python-practice/course.yaml', 'utf8')) as {
    revision: string;
  };
  // 同じ旧3教材IDの実成功記録を、前revisionの保存状態としてseedする。
  await page.goto(`${base}generated/content/catalog-v3.json`);
  await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const opening = indexedDB.open('tsumucode-progress');
      opening.onsuccess = () => {
        resolve(opening.result);
      };
      opening.onerror = () => {
        reject(opening.error ?? new Error('migration seed open failed'));
      };
    });
    try {
      const transaction = database.transaction(['courses', 'drafts'], 'readwrite');
      for (const storeName of ['courses', 'drafts']) {
        const store = transaction.objectStore(storeName);
        const cursor = store.openCursor();
        cursor.onsuccess = () => {
          const current = cursor.result;
          if (current === null) return;
          const record = current.value as Record<string, unknown>;
          if (record['courseId'] === 'python-practice') {
            record['contentRevision'] = '2026-10-12.1';
            const snapshots = record['lastPassingSnapshots'] as
              Record<string, Record<string, unknown>> | undefined;
            for (const snapshot of Object.values(snapshots ?? {}))
              snapshot['contentRevision'] = '2026-10-12.1';
            current.update(record);
          }
          current.continue();
        };
      }
      await new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => {
          resolve();
        };
        transaction.onerror = () => {
          reject(transaction.error ?? new Error('migration seed failed'));
        };
        transaction.onabort = () => {
          reject(transaction.error ?? new Error('migration seed aborted'));
        };
      });
    } finally {
      database.close();
    }
  });
  await page.goto(route);
  await expect(page.locator('.cm-content')).toBeVisible();
  await expect
    .poll(async () => (await draft(page, oldId))?.['contentRevision'])
    .toBe(course.revision);
  expect((await draft(page, oldId))?.['files']).toEqual(previous?.['files']);
  expect((await draft(page, oldId))?.['validationHistory']).toEqual(
    previous?.['validationHistory'],
  );
  expect((await draft(page, oldId))?.['lastPassingSnapshots']).toEqual(
    previous?.['lastPassingSnapshots'],
  );
  const solution = await readFile(`${directory}/solution/main.py`, 'utf8');
  const starter = await readFile(`${directory}/starter/main.py`, 'utf8');
  await expect(page.getByRole('button', { name: '判定する', exact: true })).toBeEnabled({
    timeout: 30_000,
  });
  await replaceEditorText(page, solution);
  await grade(page, 'pass');
  const passing = (await draft(page))?.['lastPassingSnapshots'];
  await page.reload();
  await expect(page.locator('.cm-content')).toBeVisible();
  await expect.poll(() => editorText(page)).toBe(solution);
  expect((await draft(page))?.['lastPassingSnapshots']).toEqual(passing);
  await page.getByRole('button', { name: '最初に戻す', exact: true }).click();
  await page
    .getByRole('dialog', { name: '最初のコードに戻しますか？' })
    .getByRole('button', { name: '最初のコードに戻す', exact: true })
    .click();
  await expect.poll(() => editorText(page)).toBe(starter);
  expect((await draft(page, oldId))?.['files']).toEqual(previous?.['files']);
  await replaceEditorText(page, solution);
  await grade(page, 'pass');
  await page.goto(`${base}#/`);
  await expect(page.getByRole('link', { name: /Pythonの反復とデータ処理/ })).toHaveCount(0);
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: '全コースの進捗と下書きを書き出す', exact: true }).click();
  const file = info.outputPath('python-context-progress.json');
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
      .poll(async () => (await draft(imported))?.['files'])
      .toEqual({ 'main.py': solution });
    expect((await draft(imported, oldId))?.['files']).toEqual(previous?.['files']);
    await imported.goto(route);
    await expect(imported.locator('.cm-content')).toBeVisible();
    await expect.poll(() => editorText(imported)).toBe(solution);
  } finally {
    await fresh.close();
  }
});
