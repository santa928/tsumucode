import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { openEditableJavaScriptExercise } from './helpers/javascriptCourse';
import {
  RUNTIME_EXERCISE_PATH,
  editorText,
  readStoredProgress,
  replaceEditorText,
  waitForStoredDraftContent,
} from './helpers/progress';

const closureId = 'javascript-ch03-l05-e01';
const closureRoot =
  'content/javascript/chapters/javascript-ch03/lessons/javascript-ch03-l05/exercises/javascript-ch03-l05-e01';

/** 現在のClosure下書きだけを観測し、他の教材や保存形式を変更しない。 */
async function closureDraft(page: Page) {
  return (await readStoredProgress(page)).drafts.find((draft) => draft['exerciseId'] === closureId);
}

test('Worker起動障害を採点履歴へ保存せず、再読込後に実行を回復する', async ({ page }) => {
  await openEditableJavaScriptExercise(page, {
    lessonId: 'javascript-ch03-l05',
    exerciseId: closureId,
    title: 'Closureで得点を10ずつ増やす',
    consoleOnly: true,
  });
  const solution = await readFile(`${closureRoot}/solution/script.js`, 'utf8');
  await replaceEditorText(page, solution);
  await waitForStoredDraftContent(page, solution);
  await page.getByRole('button', { name: '判定する', exact: true }).click();
  await expect(
    page.getByRole('dialog', { name: '判定結果' }).getByRole('heading', { name: 'できました' }),
  ).toBeVisible();
  const previous = await closureDraft(page);
  // 実Worker生成を追加CSPで拒否し、Runnerモックではなく起動障害を作る。
  const documentUrl = page.url().split('#')[0]!;
  await page.route(documentUrl, async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      headers: { ...response.headers(), 'content-security-policy': "worker-src 'none'" },
    });
  });
  await page.reload();
  await expect(
    page.getByText('実行環境で問題が起きました。採点していません。', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: '判定する', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: '実行環境の準備に失敗' })).toBeVisible();
  await expect(page.getByRole('dialog', { name: '判定結果' })).toHaveCount(0);
  expect((await closureDraft(page))?.['validationHistory']).toEqual(
    previous?.['validationHistory'],
  );
  expect((await closureDraft(page))?.['lastPassingSnapshots']).toEqual(
    previous?.['lastPassingSnapshots'],
  );
  await expect.poll(() => editorText(page)).toBe(solution);
  await page.unroute(documentUrl);
  await page.reload();
  await expect(page.getByText('実行できました（合否は「判定する」で確認）')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Console出力' }).locator('code')).toHaveText([
    '10',
    '20',
  ]);
});

test('HTML/CSS導入はBrowser環境表示から実行と既存採点へつながる', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(RUNTIME_EXERCISE_PATH);
  await expect(page.getByLabel('実行環境')).toHaveText('ブラウザで実行');
  await expect(page.getByText('実行できました（合否は「判定する」で確認）')).toBeVisible();
  const root =
    'content/html-css/chapters/html-css-ch00/lessons/html-css-ch00-l01/exercises/html-css-ch00-l01-e01';
  for (const file of ['index.html', 'styles.css']) {
    await page.getByRole('tab', { name: file, exact: true }).click();
    const source = await readFile(`${root}/solution/${file}`, 'utf8');
    await replaceEditorText(page, source);
    await waitForStoredDraftContent(page, source);
  }
  await expect(
    page
      .frameLocator('iframe[title="コードのプレビュー"]')
      .getByRole('heading', { name: 'わたしの学習ノート' }),
  ).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('html-browser.png') });
  await page.getByRole('button', { name: '判定する', exact: true }).click();
  await expect(
    page.getByRole('dialog', { name: '判定結果' }).getByRole('heading', { name: 'できました' }),
  ).toBeVisible();
});

test('実JS Runnerで編集→Reset→再編集→Preview→判定を再読込なしで実行する', async ({ page }) => {
  await openEditableJavaScriptExercise(page, {
    lessonId: 'javascript-ch03-l05',
    exerciseId: closureId,
    title: 'Closureで得点を10ずつ増やす',
    consoleOnly: true,
  });
  const solution = await readFile(`${closureRoot}/solution/script.js`, 'utf8');
  const starter = await readFile(`${closureRoot}/starter/script.js`, 'utf8');
  await replaceEditorText(page, solution);
  await waitForStoredDraftContent(page, solution);
  await page.getByRole('button', { name: '最初に戻す', exact: true }).click();
  const reset = page.getByRole('dialog', { name: '最初のコードに戻しますか？' });
  await reset.getByRole('button', { name: '最初のコードに戻す', exact: true }).click();
  await expect(reset).toBeHidden();
  await expect.poll(() => editorText(page)).toBe(starter);
  await waitForStoredDraftContent(page, starter);

  await replaceEditorText(page, solution);
  await waitForStoredDraftContent(page, solution);
  await page.getByRole('button', { name: 'プレビューを更新', exact: true }).click();
  await expect(page.getByText('実行できました（合否は「判定する」で確認）')).toBeVisible();
  const output = page.getByRole('region', { name: 'Console出力' });
  await expect(output).toContainText('10');
  await expect(output).toContainText('20');
  await page.getByRole('button', { name: '判定する', exact: true }).click();
  await expect(
    page.getByRole('dialog', { name: '判定結果' }).getByRole('heading', { name: 'できました' }),
  ).toBeVisible();
});

test('Closureの実行・合否・未対応・制限停止・下書き復旧を分離する', async ({ page }, testInfo) => {
  await openEditableJavaScriptExercise(page, {
    lessonId: 'javascript-ch03-l05',
    exerciseId: closureId,
    title: 'Closureで得点を10ずつ増やす',
    consoleOnly: true,
  });
  await expect(page.getByLabel('実行環境')).toHaveText('ブラウザで実行（Console専用）');
  await expect(page.getByText('実行できました（合否は「判定する」で確認）')).toBeVisible();
  // 成功終了でもStarterは教材要件を満たさない。
  await page.getByRole('button', { name: '判定する', exact: true }).click();
  await expect(
    page.getByRole('dialog', { name: '判定結果' }).getByRole('heading', { name: 'あと一歩' }),
  ).toBeVisible();
  await page.getByRole('button', { name: '閉じる', exact: true }).click();

  const solution = await readFile(`${closureRoot}/solution/script.js`, 'utf8');
  await replaceEditorText(page, solution);
  await waitForStoredDraftContent(page, solution);
  await page.getByRole('button', { name: '判定する', exact: true }).click();
  await expect(
    page.getByRole('dialog', { name: '判定結果' }).getByRole('heading', { name: 'できました' }),
  ).toBeVisible();
  await page.getByRole('button', { name: '閉じる', exact: true }).click();
  const previous = await closureDraft(page);

  const supported = `${solution}\nconst items = [10,20]; const i = 1; console.log(items[i]);\nconst scores = { alice: 10 }; const key = 'alice'; console.log(scores[key]);\nnew Promise(resolve => resolve(30)).then(console.log);`;
  await replaceEditorText(page, supported);
  await waitForStoredDraftContent(page, supported);
  await expect(page.getByRole('region', { name: 'Console出力' }).locator('code')).toHaveText([
    '10',
    '20',
    '20',
    '10',
    '30',
  ]);
  await expect(page.getByText('実行できました（合否は「判定する」で確認）')).toBeVisible();
  expect((await closureDraft(page))?.['validationHistory']).toEqual(
    previous?.['validationHistory'],
  );
  await page.screenshot({ path: testInfo.outputPath('closure-console-supported.png') });

  const unsupported = `${solution}\nfetch('/not-provided');`;
  await replaceEditorText(page, unsupported);
  await waitForStoredDraftContent(page, unsupported);
  await expect(
    page.getByText('この環境では未対応です。採点していません。', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: '判定する', exact: true }).click();
  await expect(
    page
      .getByRole('alert')
      .filter({ hasText: /この環境では.*未対応/u })
      .first(),
  ).toBeVisible();
  await expect(page.getByRole('dialog', { name: '判定結果' })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Console出力' })).toContainText(
    '前回成功時のConsoleです',
  );
  await expect.poll(() => editorText(page)).toBe(unsupported);
  expect((await closureDraft(page))?.['validationHistory']).toEqual(
    previous?.['validationHistory'],
  );
  expect((await closureDraft(page))?.['lastPassingSnapshots']).toEqual(
    previous?.['lastPassingSnapshots'],
  );
  await page.screenshot({ path: testInfo.outputPath('closure-unsupported.png') });
  await page.reload();
  await expect.poll(() => editorText(page)).toBe(unsupported);

  await replaceEditorText(page, 'while (true) {}');
  await waitForStoredDraftContent(page, 'while (true) {}');
  await page.getByRole('button', { name: '判定する', exact: true }).click();
  await expect(
    page.getByText('実行を停止しました。採点していません。', { exact: true }),
  ).toBeVisible();
  expect((await closureDraft(page))?.['validationHistory']).toEqual(
    previous?.['validationHistory'],
  );
  await replaceEditorText(page, solution);
  await waitForStoredDraftContent(page, solution);
  await page.getByRole('button', { name: '判定する', exact: true }).click();
  await expect(
    page.getByRole('dialog', { name: '判定結果' }).getByRole('heading', { name: 'できました' }),
  ).toBeVisible();
});
