import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { testBasePath } from './helpers/testBasePath';
import { readStoredProgress } from './helpers/progress';

const base = testBasePath();
const lessonId = 'python-practice-ch03-l01';
const exerciseId = `${lessonId}-e01`;
const directory = `content/python-practice/chapters/python-practice-ch03/lessons/${lessonId}/exercises/${exerciseId}`;
const route = `${base}#/courses/python-practice/lessons/${lessonId}/exercises/${exerciseId}`;

/** 画面外の行も含め、通常のコピー操作からEditorのSource全文を読む。 */
async function editorSource(page: Page): Promise<string> {
  await page.evaluate(() => {
    const copied = window as Window & { projectSourceCopy?: string | undefined };
    copied.projectSourceCopy = undefined;
    document.addEventListener(
      'copy',
      (event) => {
        copied.projectSourceCopy = event.clipboardData?.getData('text/plain');
      },
      { once: true },
    );
  });
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.press('ControlOrMeta+C');
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as Window & { projectSourceCopy?: string | undefined }).projectSourceCopy,
      ),
    )
    .not.toBeUndefined();
  const source = await page.evaluate(
    () => (window as Window & { projectSourceCopy?: string | undefined }).projectSourceCopy!,
  );
  await page.keyboard.press('ArrowRight');
  return source;
}

/** 通常入力で置換し、長いSourceも全文と保存結果を照合する。 */
async function replaceEditorSource(page: Page, source: string): Promise<void> {
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText(source);
  await expect.poll(() => editorSource(page)).toBe(source);
  await expect
    .poll(async () => {
      const stored = await readStoredProgress(page);
      return stored.drafts.some(
        (value) => (value['files'] as Record<string, string> | undefined)?.['main.py'] === source,
      );
    })
    .toBe(true);
}

async function draft(page: Page, id = exerciseId) {
  return (await readStoredProgress(page)).drafts.find((value) => value['workspaceId'] === id);
}

async function grade(page: Page, status: string, id = exerciseId) {
  await page.getByRole('button', { name: '判定する', exact: true }).click();
  if (status === 'pass' && id === exerciseId)
    await expect(
      page.getByRole('heading', { name: 'ピースがはまりました', exact: true }),
    ).toBeVisible({ timeout: 30_000 });
  else await expect(page.getByRole('dialog')).toBeVisible({ timeout: 30_000 });
  await expect
    .poll(async () => {
      const history = (await draft(page, id))?.['validationHistory'] as
        { status: string }[] | undefined;
      return history?.at(-1)?.status;
    })
    .toBe(status);
  if (status === 'pass' && id === exerciseId) {
    await page.goto(route);
    await expect(page.locator('.cm-content')).toBeVisible();
  } else await page.getByRole('button', { name: '閉じる', exact: true }).click();
}

for (const offset of [0, 4, 8, 12]) {
  test(`データProjectの正負Fixture ${String(offset + 1)}〜${String(Math.min(offset + 4, 16))}を通常UIで確認する`, async ({
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
      // Firefox/WebKitは実dataclassと、同じstdoutでTestを削除した反例の代表だけを確認する。
      if (
        ['firefox', 'webkit'].includes(info.project.name) &&
        !['solution', 'tests-removed'].includes(fixture.id)
      )
        continue;
      await test.step(fixture.id, async () => {
        await expect(update).toBeEnabled({ timeout: 30_000 });
        const source = await readFile(`${directory}/${fixture.files[0]!.source}`, 'utf8');
        await replaceEditorSource(page, source);
        const previous = (await draft(page))?.['validationHistory'] ?? [];
        if (fixture.expectedStatus === 'system-error') {
          await page.getByRole('button', { name: '判定する', exact: true }).click();
          await expect(page.getByText(/採点していません/).last()).toBeVisible({ timeout: 30_000 });
          await expect(update).toBeEnabled({ timeout: 30_000 });
          expect((await draft(page))?.['validationHistory'] ?? []).toEqual(previous);
          await expect(page.getByRole('dialog')).toHaveCount(0);
        } else {
          await grade(page, fixture.expectedStatus);
          if (fixture.id === 'test-failure' || fixture.id === 'starter')
            await expect(
              page.getByRole('region', { name: 'Console出力', exact: true }),
            ).toContainText('Test失敗');
        }
        expect(await editorSource(page), fixture.id).toBe(source);
      });
    }
  });
}

test('データProjectの完成後の実Preview・Keyboard・a11yを確認する', async ({ page }, info) => {
  test.setTimeout(90_000);
  await page.goto(route);
  await expect(page.locator('.cm-content')).toBeVisible();
  const update = page.getByRole('button', { name: 'プレビューを更新', exact: true });
  await expect(update).toBeEnabled({ timeout: 30_000 });
  const solution = await readFile(`${directory}/solution/main.py`, 'utf8');
  await replaceEditorSource(page, solution);
  await grade(page, 'pass');
  await update.click();
  await expect(page.getByRole('region', { name: 'Console出力', exact: true })).toContainText(
    'Test成功',
    { timeout: 30_000 },
  );
  await expect(update).toBeEnabled({ timeout: 30_000 });
  await update.focus();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: '判定する', exact: true })).toBeFocused();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({
    path: info.outputPath('python-data-project-preview.png'),
    fullPage: true,
  });
});

test('データProjectの停止・再試行はSourceと採点履歴を保持する', async ({ page }, info) => {
  test.skip(['firefox', 'webkit'].includes(info.project.name));
  const solution = await readFile(`${directory}/solution/main.py`, 'utf8');
  await page.goto(route);
  await expect(page.locator('.cm-content')).toBeVisible();
  await expect(page.getByRole('button', { name: '判定する', exact: true })).toBeEnabled({
    timeout: 30_000,
  });
  await replaceEditorSource(page, solution);
  await grade(page, 'pass');
  const history = (await draft(page))?.['validationHistory'];
  // reload後の自動Preview取得を拒否し、手動判定をcold要求として実際に待つ。
  let holding = false;
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requested!: () => void;
  const loading = new Promise<void>((resolve) => {
    requested = resolve;
  });
  await page.route(/\/api\/session$|\/python-runtime\/314\.0\.7\/core\.wasm$/u, async (request) => {
    if (!holding) {
      await request.fulfill({ status: 503, body: 'cold準備試験' });
      return;
    }
    requested();
    await held;
    await request.continue().catch(() => undefined);
  });
  try {
    await page.reload();
    await expect(page.locator('.cm-content')).toBeVisible();
    await expect(page.getByRole('button', { name: '判定する', exact: true })).toBeEnabled({
      timeout: 30_000,
    });
    holding = true;
    await page.getByRole('button', { name: '判定する', exact: true }).click();
    await loading;
    await page.getByRole('button', { name: '実行を停止', exact: true }).click();
    await expect(
      page.getByText('実行を停止しました。採点していません。', { exact: true }).first(),
    ).toBeVisible({ timeout: 30_000 });
    expect((await draft(page))?.['validationHistory']).toEqual(history);
    expect(await editorSource(page)).toBe(solution);
  } finally {
    release();
    await page.unrouteAll({ behavior: 'wait' });
  }
  await grade(page, 'pass');
});

test('旧実践revisionの移行とデータProjectの保存・Reset・JSON移送を確認する', async ({
  page,
  browser,
}, info) => {
  test.setTimeout(180_000);
  test.skip(['firefox', 'webkit'].includes(info.project.name));
  const oldId = 'python-practice-ch02-l01-e01';
  const oldSolution = await readFile(
    'content/python-practice/chapters/python-practice-ch02/lessons/python-practice-ch02-l01/exercises/python-practice-ch02-l01-e01/solution/main.py',
    'utf8',
  );
  await page.goto(
    `${base}#/courses/python-practice/lessons/python-practice-ch02-l01/exercises/${oldId}`,
  );
  await expect(page.locator('.cm-content')).toBeVisible();
  await expect(page.getByRole('button', { name: '判定する', exact: true })).toBeEnabled({
    timeout: 30_000,
  });
  await replaceEditorSource(page, oldSolution);
  await grade(page, 'pass', oldId);
  const previous = await draft(page, oldId);
  const course = parse(await readFile('content/python-practice/course.yaml', 'utf8')) as {
    revision: string;
  };
  // 同じ旧4教材IDの実成功記録を、前revisionの保存状態としてseedする。
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
            record['contentRevision'] = '2026-10-12.2';
            const snapshots = record['lastPassingSnapshots'] as
              Record<string, Record<string, unknown>> | undefined;
            for (const snapshot of Object.values(snapshots ?? {}))
              snapshot['contentRevision'] = '2026-10-12.2';
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
  await replaceEditorSource(page, solution);
  await grade(page, 'pass');
  const passing = (await draft(page))?.['lastPassingSnapshots'];
  await page.reload();
  await expect(page.locator('.cm-content')).toBeVisible();
  await expect.poll(() => editorSource(page)).toBe(solution);
  expect((await draft(page))?.['lastPassingSnapshots']).toEqual(passing);
  await page.getByRole('button', { name: '最初に戻す', exact: true }).click();
  await page
    .getByRole('dialog', { name: '最初のコードに戻しますか？' })
    .getByRole('button', { name: '最初のコードに戻す', exact: true })
    .click();
  await expect.poll(() => editorSource(page)).toBe(starter);
  expect((await draft(page, oldId))?.['files']).toEqual(previous?.['files']);
  await replaceEditorSource(page, solution);
  await grade(page, 'pass');
  await page.goto(`${base}#/`);
  await expect(page.getByRole('link', { name: /Pythonの反復とデータ処理/ })).toHaveCount(0);
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: '全コースの進捗と下書きを書き出す', exact: true }).click();
  const file = info.outputPath('python-data-project-progress.json');
  await (await downloading).saveAs(file);
  const fresh = await browser.newContext({ baseURL: page.url().split('#')[0]! });
  // JSONを書き出した元画面のWorkerを閉じ、移送先の通常画面へ切り替える。
  await page.close();
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
    await expect.poll(() => editorSource(imported)).toBe(solution);
  } finally {
    await fresh.close();
  }
});
