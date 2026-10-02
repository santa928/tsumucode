/** 実DownloadのZIPをサイト外で開き、ソースと永続化状態の対応を確認する。 */
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { strFromU8, unzipSync } from 'fflate';
import { expect, test } from '@playwright/test';
import { editorText, readStoredProgress, waitForStoredDraftContent } from './helpers/progress';
import {
  STANDARD_EXERCISE_ID,
  STANDARD_EXERCISE_TITLE,
  STANDARD_LESSON_ID,
  exerciseRoute,
  expectStoredViewedSlide,
  openEditableExercise,
  readExerciseSolution,
  replaceWorkspaceFiles,
} from './helpers/releaseCourse';

test.describe.configure({ timeout: 90_000, retries: 0 });

test('持ち出した最新HTML/CSSをサイト外で開き、下書き・進捗・履歴を保持する', async ({
  page,
  context,
}, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('./#/courses/html-css/lessons/html-css-ch00-l01/slides/html-css-ch00-l01-s01');
  for (let index = 1; index <= 4; index += 1) {
    await expectStoredViewedSlide(page, STANDARD_LESSON_ID, `html-css-ch00-l01-s0${String(index)}`);
    if (index < 4) await page.getByRole('link', { name: '次のスライドへ →' }).click();
  }
  await openEditableExercise(
    page,
    STANDARD_LESSON_ID,
    STANDARD_EXERCISE_ID,
    STANDARD_EXERCISE_TITLE,
  );
  const solution = await readExerciseSolution(
    'html-css-ch00',
    STANDARD_LESSON_ID,
    STANDARD_EXERCISE_ID,
  );
  await replaceWorkspaceFiles(page, solution);
  await page.getByRole('button', { name: '判定する' }).click();
  await expect(page.getByTestId('learning-completion')).toBeVisible();
  await page.goto(exerciseRoute(STANDARD_LESSON_ID, STANDARD_EXERCISE_ID));
  const exportButton = page.getByRole('button', { name: 'HTML/CSSを持ち出す' });
  await expect(exportButton).toBeEnabled();
  const before = await readStoredProgress(page);
  const originalDraft = before.drafts.find(
    (draft) => draft['workspaceId'] === STANDARD_EXERCISE_ID,
  )!;
  expect(originalDraft['validationHistory']).not.toEqual([]);
  expect(originalDraft['lastPassingSnapshots']).not.toEqual({});

  const firstDownloadPromise = page.waitForEvent('download');
  await exportButton.click();
  const firstDownload = await firstDownloadPromise;
  expect(firstDownload.suggestedFilename()).toBe('tsumucode-html-intro.zip');
  await firstDownload.saveAs(testInfo.outputPath('passed-source.zip'));
  expect(await firstDownload.failure()).toBeNull();
  expect(await readStoredProgress(page)).toEqual(before);

  // 最後の編集に保存待ちを挟まず持ち出す。ZIPは表示中のソースを使う。
  const latest = {
    'index.html': `${solution['index.html']!}\n<!-- 持ち出した最新の日本語ソース 🌱 -->`,
    'styles.css': `${solution['styles.css']!}\n/* 持ち出した最新CSS */`,
  };
  await page.getByRole('tab', { name: 'index.html', exact: true }).click();
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText(latest['index.html']);
  await page.getByRole('tab', { name: 'styles.css', exact: true }).click();
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText(latest['styles.css']);
  const downloadPromise = page.waitForEvent('download');
  await exportButton.click();
  const download = await downloadPromise;
  const zipPath = testInfo.outputPath('latest-source.zip');
  await download.saveAs(zipPath);
  expect(await download.failure()).toBeNull();
  const entries = unzipSync(new Uint8Array(await readFile(zipPath)));
  expect(Object.keys(entries).sort()).toEqual(['README.md', 'index.html', 'styles.css']);
  for (const [path, source] of Object.entries(latest)) {
    expect(strFromU8(entries[path]!)).toBe(source);
  }
  expect(strFromU8(entries['README.md']!)).toContain('合格や保存完了の証明ではありません');
  await waitForStoredDraftContent(page, latest['styles.css']);
  const after = await readStoredProgress(page);
  const afterDraft = after.drafts.find((draft) => draft['workspaceId'] === STANDARD_EXERCISE_ID)!;
  expect(afterDraft['files']).toEqual(latest);
  expect(afterDraft['validationHistory']).toEqual(originalDraft['validationHistory']);
  expect(afterDraft['lastPassingSnapshots']).toEqual(originalDraft['lastPassingSnapshots']);
  await exportButton.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('portable-workspace.png') });
  await page.reload();
  await expect(page.getByTestId('code-workspace')).toBeVisible();
  expect(await readStoredProgress(page)).toEqual(after);
  await expect.poll(() => editorText(page)).toBe(latest['styles.css']);

  // Browserが保存したZIPをそのまま展開し、HTTPアプリではないfile:で開く。
  const folder = testInfo.outputPath('outside-site');
  await mkdir(folder, { recursive: true });
  for (const name of ['index.html', 'styles.css', 'README.md']) {
    await writeFile(join(folder, name), entries[name]!);
  }
  const outside = await context.newPage();
  const errors: string[] = [];
  outside.on('pageerror', (error) => {
    errors.push(error.message);
  });
  outside.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await outside.goto(pathToFileURL(join(folder, 'index.html')).href);
  expect(outside.url()).toMatch(/^file:/u);
  await expect(
    outside.getByRole('heading', { name: 'わたしの学習ノート', exact: true }),
  ).toBeVisible();
  await expect(outside.locator('body')).toHaveCSS('background-color', 'rgb(255, 250, 240)');
  expect(errors).toEqual([]);
  await outside.screenshot({ path: testInfo.outputPath('outside-site.png') });
});

test('狭いPC工程票でも持ち出し操作の境界と主要Workspaceを保つ', async ({
  page,
  browserName,
}, testInfo) => {
  test.skip(
    browserName !== 'chromium',
    'レイアウトは代表Browser、Downloadは上の3Browser経路で確認する',
  );
  await page.setViewportSize({ width: 1024, height: 720 });
  await page.goto(exerciseRoute(STANDARD_LESSON_ID, STANDARD_EXERCISE_ID));
  const button = page.getByRole('button', { name: 'HTML/CSSを持ち出す' });
  await button.scrollIntoViewIfNeeded();
  await expect(page.getByTestId('code-workspace')).toBeVisible();
  const geometry = await button.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const parent = element.closest('aside')!.getBoundingClientRect();
    return {
      height: rect.height,
      right: rect.right,
      bottom: rect.bottom,
      parentRight: parent.right,
      parentBottom: parent.bottom,
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
    };
  });
  expect(geometry.height).toBeGreaterThanOrEqual(44);
  expect(geometry.right).toBeLessThanOrEqual(geometry.parentRight);
  expect(geometry.bottom).toBeLessThanOrEqual(geometry.parentBottom);
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.viewportWidth);
  await page.screenshot({ path: testInfo.outputPath('portable-narrow.png') });
});
