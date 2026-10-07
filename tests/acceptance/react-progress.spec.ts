import { readFile, writeFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { readStoredProgress, waitForDraftSaved } from '../e2e/helpers/progress';
import { testServerUrl } from '../e2e/helpers/testBasePath';
import { expectStoredViewedSlide } from '../e2e/helpers/releaseCourse';

const guided = 'react-ch02-l01';
const capstone = 'react-ch03-l01';

/** 保存済みSourceを比較し、編集の仮想化や単なるDOM表示へ依存しない。 */
async function writeSource(
  page: Page,
  workspace: string,
  file: string,
  source: string,
): Promise<void> {
  await page.getByRole('tab', { name: file, exact: true }).click();
  const editor = page.getByRole('textbox', { name: `${file} のコードエディター`, exact: true });
  await editor.focus();
  await editor.press('Control+A');
  await page.keyboard.insertText(source);
  await expect
    .poll(
      async () =>
        (await readStoredProgress(page)).drafts.find((row) => row['workspaceId'] === workspace)?.[
          'files'
        ],
    )
    .toMatchObject({ [file]: source });
  await waitForDraftSaved(page);
}

test('Reactの合格済みGuidedと型失敗Capstoneを実Export/Importで保持し修正できる', async ({
  page,
  browser,
}, info) => {
  test.skip(info.project.name !== 'chromium', '通常UIの保存往復を代表Browserで確認する。');
  test.setTimeout(180_000);
  for (const suffix of ['01', '02', '03']) {
    const slide = `${guided}-s${suffix}`;
    await page.goto(`${testServerUrl()}#/courses/react/lessons/${guided}/slides/${slide}`);
    await expectStoredViewedSlide(page, guided, slide);
  }
  await page.goto(`${testServerUrl()}#/courses/react/lessons/${guided}/exercises/${guided}-e01`);
  await expect(
    page.getByRole('heading', { level: 1, name: '型付きの問題をComponentへ渡す', exact: true }),
  ).toBeVisible();
  const card = await readFile(
    `content/react/chapters/react-ch02/lessons/${guided}/exercises/${guided}-e01/solution/QuestionCard.tsx`,
    'utf8',
  );
  await writeSource(page, 'react-quiz-guided', 'QuestionCard.tsx', card);
  await page.getByRole('button', { name: '判定する', exact: true }).click();
  await expect(page.getByTestId('learning-completion')).toBeVisible({ timeout: 60000 });

  await page.goto(
    `${testServerUrl()}#/courses/react/lessons/${capstone}/exercises/${capstone}-e01`,
  );
  await expect(
    page.getByRole('heading', { level: 1, name: '誤答から再回答できる練習クイズ', exact: true }),
  ).toBeVisible();
  const state = await readFile(
    `content/react/chapters/react-ch03/lessons/${capstone}/exercises/${capstone}-e01/solution/quizState.ts`,
    'utf8',
  );
  const invalid = state.replace('score: 0,', 'score: true,');
  expect(invalid).not.toBe(state);
  await writeSource(page, 'react-quiz-capstone', 'quizState.ts', invalid);
  await page.getByRole('button', { name: 'プレビューを更新', exact: true }).click();
  await expect(
    page.getByText('型を確認してください。まだ実行・採点していません。', { exact: true }),
  ).toBeVisible();
  const before = await readStoredProgress(page);
  const originalGuided = before.drafts.find((row) => row['workspaceId'] === 'react-quiz-guided');
  const originalCap = before.drafts.find((row) => row['workspaceId'] === 'react-quiz-capstone');
  if (!originalGuided || !originalCap) throw new Error('両Workspaceの保存が必要です');
  expect(Object.keys(originalGuided['lastPassingSnapshots'] as object)).toContain(`${guided}-e01`);

  await page.goto(testServerUrl());
  const exportButton = page.getByRole('button', { name: '全コースの進捗と下書きを書き出す' });
  await expect(exportButton).toBeEnabled();
  const download = page.waitForEvent('download');
  await exportButton.click();
  const path = info.outputPath('react-progress.json');
  await (await download).saveAs(path);
  const fresh = await browser.newContext();
  try {
    const imported = await fresh.newPage();
    await imported.goto(testServerUrl());
    const input = imported.getByLabel('書き出した学習データを読み込む');
    await expect(input).toBeEnabled();
    await input.setInputFiles({
      name: 'react-progress.json',
      mimeType: 'application/json',
      buffer: await readFile(path),
    });
    await expect(imported.getByRole('region', { name: '読み込み差分' })).toBeVisible();
    const reloaded = imported.waitForEvent('domcontentloaded');
    await imported.getByRole('button', { name: 'この内容を読み込む' }).click();
    await reloaded;
    const restored = await readStoredProgress(imported);
    const restoredGuided = restored.drafts.find(
      (row) => row['workspaceId'] === 'react-quiz-guided',
    );
    const restoredCap = restored.drafts.find((row) => row['workspaceId'] === 'react-quiz-capstone');
    expect(restoredGuided?.['files']).toEqual(originalGuided['files']);
    expect(restoredGuided?.['lastPassingSnapshots']).toEqual(
      originalGuided['lastPassingSnapshots'],
    );
    expect(restoredGuided?.['validationHistory']).toEqual(originalGuided['validationHistory']);
    expect(restoredCap?.['files']).toEqual(originalCap['files']);
    expect(restored.courses.find((row) => row['courseId'] === 'react')?.['lessons']).toEqual(
      before.courses.find((row) => row['courseId'] === 'react')?.['lessons'],
    );
    await imported.goto(
      `${testServerUrl()}#/courses/react/lessons/${capstone}/exercises/${capstone}-e01`,
    );
    await expect(
      imported.getByRole('heading', {
        level: 1,
        name: '誤答から再回答できる練習クイズ',
        exact: true,
      }),
    ).toBeVisible();
    await imported.getByRole('button', { name: 'プレビューを更新', exact: true }).click();
    await expect(
      imported.getByText('型を確認してください。まだ実行・採点していません。', { exact: true }),
    ).toBeVisible();
    await imported.screenshot({
      path: info.outputPath('react-import-type-error.png'),
      fullPage: true,
    });
    await writeSource(imported, 'react-quiz-capstone', 'quizState.ts', state);
    await imported.getByRole('button', { name: 'プレビューを更新', exact: true }).click();
    await expect(
      imported.frameLocator('iframe[title="Reactコードのプレビュー"]').locator('#question'),
    ).toHaveText('1 + 1 の結果は？', { timeout: 30000 });
    await writeFile(
      info.outputPath('react-progress-observation.json'),
      JSON.stringify({ before, restored, recovered: await readStoredProgress(imported) }, null, 2),
    );
  } finally {
    await fresh.close();
  }
});
