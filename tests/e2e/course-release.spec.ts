import { readFile } from 'node:fs/promises';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { editorText, readStoredProgress } from './helpers/progress';
import {
  CAPSTONE_STEP,
  CAPSTONE_WORKSPACE_ID,
  PROFILE_STEPS,
  PROFILE_WORKSPACE_ID,
  STANDARD_EXERCISE_ID,
  STANDARD_EXERCISE_TITLE,
  STANDARD_LESSON_ID,
  appendWorkspaceMarker,
  expectStoredViewedSlide,
  expectStoredWorkspaceMarker,
  openEditableExercise,
  readExerciseSolution,
  replaceWorkspaceFiles,
} from './helpers/releaseCourse';

test.describe.configure({ timeout: 90_000 });

/** Homeの端末データPanelからBundleをdownloadし、テスト出力先へ保存する。 */
async function exportBundle(page: Page, testInfo: TestInfo): Promise<string> {
  await page.goto('./#/');
  const button = page.getByRole('button', { name: '全コースの進捗を書き出す' });
  await expect(button).toBeEnabled();
  const download = page.waitForEvent('download');
  await button.click();
  const path = testInfo.outputPath('release-progress.json');
  await (await download).saveAs(path);
  await expect(page.getByRole('status')).toContainText('書き出しました');
  return path;
}

/** Bundleを差分確認後に適用し、Homeの再読込完了まで待つ。 */
async function importBundle(page: Page, path: string): Promise<void> {
  await page.goto('./#/');
  await page.getByLabel('進捗Bundleを選ぶ').setInputFiles({
    name: 'progress.json',
    mimeType: 'application/json',
    buffer: await readFile(path),
  });
  await expect(page.getByRole('region', { name: '読み込み差分' })).toBeVisible();
  const reloaded = page.waitForEvent('domcontentloaded');
  await page.getByRole('button', { name: 'この内容を読み込む' }).click();
  await reloaded;
  await expect(page.getByRole('heading', { level: 1, name: '学びたいピースを選ぶ' })).toBeVisible();
}

test('HomeからSlide、演習、見直しを経て代表Lessonを完了する', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('./#/');
  await page.getByRole('link', { name: 'HTML/CSS はじめの一歩：最初のピースを置く' }).click();
  await page.getByRole('link', { name: '← コースマップへ戻る' }).click();
  await page.getByRole('link', { name: 'Webページを作る3つの役割レッスンを始める' }).click();
  await expect(page.getByRole('progressbar', { name: 'スライドの現在位置' })).toHaveAttribute(
    'value',
    '1',
  );
  await expectStoredViewedSlide(page, STANDARD_LESSON_ID, 'html-css-ch00-l01-s01');
  await page.getByRole('link', { name: '次のスライドへ →' }).click();
  await expectStoredViewedSlide(page, STANDARD_LESSON_ID, 'html-css-ch00-l01-s02');
  await page.getByRole('link', { name: '次のスライドへ →' }).click();
  await expectStoredViewedSlide(page, STANDARD_LESSON_ID, 'html-css-ch00-l01-s03');
  await page
    .getByRole('link', { name: '「内容と見た目を1箇所ずつ変える」のコード演習を始める' })
    .click();
  await expect(page.getByTestId('code-workspace')).toBeVisible();

  await replaceWorkspaceFiles(page, {
    'index.html': '<main><p>まだ見出しはありません</p></main>',
    'styles.css': 'body { background-color: white; }',
  });
  await page.getByRole('button', { name: '判定する' }).click();
  await expect(page.getByRole('heading', { name: 'あと一歩' })).toBeVisible();
  await page
    .getByRole('button', { name: /次のヒントを見る/u })
    .first()
    .click();
  await page
    .getByRole('button', { name: /関連スライドを見直す/u })
    .first()
    .click();
  await expect(page).toHaveURL(/\/review\//u);
  await page.getByRole('button', { name: '演習へ戻る' }).click();
  await expect(page.getByTestId('code-workspace')).toBeVisible();

  const solution = await readExerciseSolution(
    'html-css-ch00',
    STANDARD_LESSON_ID,
    STANDARD_EXERCISE_ID,
  );
  await replaceWorkspaceFiles(page, solution);
  await page.getByRole('button', { name: '判定する' }).click();
  await expect(page.getByTestId('learning-completion')).toBeVisible();
  await expect(page.getByRole('link', { name: '次のピースへ進む' })).toHaveAttribute(
    'href',
    /html-css-ch00-l02\/slides\/html-css-ch00-l02-s01/u,
  );
});

test('Chapter 12の5工程が同じProfile workspaceへ追加内容を積み上げる', async ({ page }) => {
  const accumulatedMarkers: string[] = [];
  for (const [index, step] of PROFILE_STEPS.entries()) {
    await openEditableExercise(page, step.lessonId, step.exerciseId, step.title);
    const source = await editorText(page);
    for (const marker of accumulatedMarkers) expect(source).toContain(marker);
    const marker = `profile-step-${String(index + 1)}`;
    accumulatedMarkers.push(marker);
    await appendWorkspaceMarker(page, marker);
  }

  for (const marker of accumulatedMarkers) {
    await expectStoredWorkspaceMarker(page, PROFILE_WORKSPACE_ID, marker);
  }
  const stored = await readStoredProgress(page);
  expect(
    stored.drafts.filter((draft) => draft['workspaceId'] === PROFILE_WORKSPACE_ID),
  ).toHaveLength(1);
});

test('Chapter 13 CapstoneをProfileとは別workspaceへ保存する', async ({ page }) => {
  const profile = PROFILE_STEPS[0];
  await openEditableExercise(page, profile.lessonId, profile.exerciseId, profile.title);
  await appendWorkspaceMarker(page, 'profile-only-marker');

  await openEditableExercise(
    page,
    CAPSTONE_STEP.lessonId,
    CAPSTONE_STEP.exerciseId,
    CAPSTONE_STEP.title,
  );
  expect(await editorText(page)).not.toContain('profile-only-marker');
  await appendWorkspaceMarker(page, 'capstone-only-marker');

  await openEditableExercise(page, profile.lessonId, profile.exerciseId, profile.title);
  expect(await editorText(page)).toContain('profile-only-marker');
  expect(await editorText(page)).not.toContain('capstone-only-marker');
  await expectStoredWorkspaceMarker(page, CAPSTONE_WORKSPACE_ID, 'capstone-only-marker');
});

test('実進捗、Profile、Capstone、現在地を空のContextへExportとImportで復元する', async ({
  browser,
  page,
}, testInfo) => {
  await openEditableExercise(
    page,
    STANDARD_LESSON_ID,
    STANDARD_EXERCISE_ID,
    STANDARD_EXERCISE_TITLE,
  );
  await replaceWorkspaceFiles(
    page,
    await readExerciseSolution('html-css-ch00', STANDARD_LESSON_ID, STANDARD_EXERCISE_ID),
  );
  await page.getByRole('button', { name: '判定する' }).click();
  await expect(page.getByRole('heading', { name: 'できました' })).toBeVisible();

  const profile = PROFILE_STEPS[0];
  await openEditableExercise(page, profile.lessonId, profile.exerciseId, profile.title);
  await appendWorkspaceMarker(page, 'export-profile-marker');
  await openEditableExercise(
    page,
    CAPSTONE_STEP.lessonId,
    CAPSTONE_STEP.exerciseId,
    CAPSTONE_STEP.title,
  );
  await appendWorkspaceMarker(page, 'export-capstone-marker');
  const before = await readStoredProgress(page);
  const bundlePath = await exportBundle(page, testInfo);

  const fresh = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const imported = await fresh.newPage();
  try {
    await importBundle(imported, bundlePath);
    const after = await readStoredProgress(imported);
    expect(after.courses).toEqual(before.courses);
    await expectStoredWorkspaceMarker(imported, PROFILE_WORKSPACE_ID, 'export-profile-marker');
    await expectStoredWorkspaceMarker(imported, CAPSTONE_WORKSPACE_ID, 'export-capstone-marker');
    await openEditableExercise(imported, profile.lessonId, profile.exerciseId, profile.title);
    expect(await editorText(imported)).toContain('export-profile-marker');
    await openEditableExercise(
      imported,
      CAPSTONE_STEP.lessonId,
      CAPSTONE_STEP.exerciseId,
      CAPSTONE_STEP.title,
    );
    expect(await editorText(imported)).toContain('export-capstone-marker');
  } finally {
    await fresh.close();
  }
});

test('Guided Projectの完了後は次LessonのSlideではなく先頭Exerciseへ進む', async ({ page }) => {
  const current = PROFILE_STEPS[0];
  const next = PROFILE_STEPS[1];
  await openEditableExercise(page, current.lessonId, current.exerciseId, current.title);
  await replaceWorkspaceFiles(
    page,
    await readExerciseSolution(current.chapterId, current.lessonId, current.exerciseId),
  );
  await page.getByRole('button', { name: '判定する' }).click();
  await expect(page.getByTestId('learning-completion')).toBeVisible();
  await expect(page.getByRole('link', { name: '次のピースへ進む' })).toHaveAttribute(
    'href',
    new RegExp(`${next.lessonId}/exercises/${next.exerciseId}$`, 'u'),
  );
});
