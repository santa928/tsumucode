import { readFile } from 'node:fs/promises';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { canonicalJson, sha256 } from '../../src/core/persistence/canonicalJson';
import type { ProgressBundle } from '../../src/core/persistence/contracts';
import { openEditableJavaScriptExercise } from './helpers/javascriptCourse';
import { editorText, readStoredProgress, replaceEditorText } from './helpers/progress';

const LESSON = 'javascript-ch03-l05';
const BASE = `./#/courses/javascript/lessons/${LESSON}`;
const titles = ['Closureで得点を10ずつ増やす', '毎回の初期化を直す', '2つの係を別の増分で使う'];

test('編集直後の同一URL再検証は旧Sessionの保存を待って最新下書きを復元する', async ({ page }) => {
  const location = {
    lessonId: LESSON,
    exerciseId: `${LESSON}-e02`,
    title: titles[1]!,
    consoleOnly: true,
  };
  await openEditableJavaScriptExercise(page, location);
  const starter = await editorText(page);
  for (const suffix of ['最初の編集', '直後の再編集']) {
    const source = `${starter}\n// ${suffix}`;
    await replaceEditorText(page, source);
    // autosave完了を待たず、同じDocument内でloaderを再検証する。
    await page.goto(`${BASE}/exercises/${location.exerciseId}`);
    await expect(page.getByTestId('code-workspace')).toBeVisible();
    await expect.poll(() => editorText(page)).toBe(source);
  }
});

/** 既存保存のうち任意練習で失ってはいけない値だけを読む。 */
async function preservedGuide(page: Page) {
  const stored = await readStoredProgress(page);
  const course = stored.courses.find((value) => value['courseId'] === 'javascript');
  const lessons = course?.['lessons'] as Record<string, Record<string, unknown>> | undefined;
  const lesson = lessons?.[LESSON];
  const draft = stored.drafts.find((value) => value['workspaceId'] === `${LESSON}-e01`);
  return {
    complete: lesson?.['currentComplete'],
    firstCompletedAt: lesson?.['firstCompletedAt'],
    files: draft?.['files'],
  };
}

/** Homeの公開Import/Exportを使い、テスト専用Bundleを往復する。 */
async function exportBundle(page: Page, info: TestInfo, name: string): Promise<ProgressBundle> {
  await page.goto('./#/');
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: '全コースの進捗と下書きを書き出す' }).click();
  const file = info.outputPath(name);
  await (await downloading).saveAs(file);
  return JSON.parse(await readFile(file, 'utf8')) as ProgressBundle;
}

/** 差分表示の確認後にImportし、再読込完了を待つ。 */
async function importBundle(page: Page, bundle: ProgressBundle): Promise<void> {
  await page.goto('./#/');
  await page.getByLabel('書き出した学習データを読み込む').setInputFiles({
    name: 'practice-progress.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(bundle)),
  });
  await expect(page.getByRole('region', { name: '読み込み差分' })).toBeVisible();
  const reloaded = page.waitForEvent('domcontentloaded');
  await page.getByRole('button', { name: 'この内容を読み込む' }).click();
  await reloaded;
  await expect(
    page.getByRole('button', { name: '全コースの進捗と下書きを書き出す' }),
  ).toBeEnabled();
}

/** 対象教材を実RunnerでPreview・採点する。 */
async function grade(page: Page, n: number, solution: boolean): Promise<void> {
  const exerciseId = `${LESSON}-e0${String(n)}`;
  await openEditableJavaScriptExercise(page, {
    lessonId: LESSON,
    exerciseId,
    title: titles[n - 1]!,
    consoleOnly: true,
  });
  if (n > 1) {
    const overview = page.locator('details').filter({ hasText: '追加練習の説明とルール' });
    await expect(overview).toHaveAttribute('open', '');
    await expect(overview).toContainText('この追加練習は任意です');
    await expect(overview).toContainText('この問題の確認に使うので残します');
    if (n === 3) {
      await expect(overview).toContainText('stepは係を作るときに渡す増分');
      await expect(overview).not.toContainText('score = score + step');
      await expect(overview).not.toContainText('score += step');
    }
  }
  if (solution) {
    const source = await readFile(
      `content/javascript/chapters/javascript-ch03/lessons/${LESSON}/exercises/${exerciseId}/solution/script.js`,
      'utf8',
    );
    await replaceEditorText(page, source);
  }
  await page.getByRole('button', { name: 'プレビューを更新' }).click();
  await expect(page.getByRole('button', { name: 'プレビューを更新' })).toBeEnabled();
  await page.getByRole('button', { name: '判定する' }).click();
  if (solution) {
    await expect(
      page.getByRole('heading', {
        level: 1,
        name: n === 1 ? 'ピースがはまりました' : '追加練習を確かめました',
      }),
    ).toBeVisible();
  } else {
    const dialog = page.getByRole('dialog', { name: '判定結果' });
    await expect(dialog.getByRole('heading', { name: 'あと一歩' })).toBeVisible();
    await dialog.getByRole('button', { name: '閉じる', exact: true }).click();
  }
}

test('旧版の合成完了Bundleを失効・再確認し、予測・任意課題・Reset・往復Importでもガイドを保持する', async ({
  page,
  browser,
}, info) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${BASE}/slides/${LESSON}-s04`);
  await expect(page.getByTestId('slide-stage')).toHaveAttribute('data-slide-id', `${LESSON}-s04`);
  await grade(page, 1, true);
  await expect.poll(async () => (await preservedGuide(page)).complete).toBe(true);
  const before = await preservedGuide(page);
  expect(before.firstCompletedAt).toEqual(expect.any(String));
  const exported = await exportBundle(page, info, 'before.json');
  // e01も追加25の再確認対象。旧版へ戻した合成Bundleの合格を失効し、旧コードを退避する。
  const { integrity, ...unsigned } = exported;
  expect(integrity.algorithm).toBe('SHA-256');
  const legacy = {
    ...unsigned,
    courses: Object.fromEntries(
      Object.entries(unsigned.courses).map(([id, value]) => [
        id,
        { ...value, contentRevision: id === 'javascript' ? '2026-08-10.3' : value.contentRevision },
      ]),
    ),
    drafts: Object.fromEntries(
      Object.entries(unsigned.drafts).map(([key, value]) => [
        key,
        {
          ...value,
          contentRevision: value.courseId === 'javascript' ? '2026-08-10.3' : value.contentRevision,
        },
      ]),
    ),
  };
  const legacyBundle = {
    ...legacy,
    integrity: { algorithm: 'SHA-256' as const, digest: await sha256(canonicalJson(legacy)) },
  };
  const baseURL = info.project.use.baseURL;
  if (baseURL === undefined) throw new Error('テスト用baseURLがありません');
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    baseURL,
  });
  const migrated = await context.newPage();
  try {
    await importBundle(migrated, legacyBundle);
    expect(await preservedGuide(migrated)).toEqual({
      complete: false,
      firstCompletedAt: undefined,
      files: undefined,
    });
    const imported = await readStoredProgress(migrated);
    const oldDraft = Object.values(legacyBundle.drafts).find(
      (draft) => draft.workspaceId === `${LESSON}-e01`,
    );
    expect(oldDraft).toBeDefined();
    const archived = imported.quarantined
      .map((record) => record['raw'])
      .find(
        (raw) =>
          typeof raw === 'object' &&
          raw !== null &&
          'workspaceId' in raw &&
          raw['workspaceId'] === `${LESSON}-e01`,
      );
    expect(archived).toMatchObject({
      files: oldDraft!.files,
      validationHistory: oldDraft!.validationHistory,
      updatedAt: oldDraft!.updatedAt,
    });
    const savedSnapshots = (archived as Record<string, unknown>)['lastPassingSnapshots'] as Record<
      string,
      unknown
    >;
    expect(savedSnapshots[`${LESSON}-e01`]).toMatchObject({
      files: oldDraft!.lastPassingSnapshots[`${LESSON}-e01`]!.files,
      editRevision: oldDraft!.lastPassingSnapshots[`${LESSON}-e01`]!.editRevision,
      evaluatedAt: oldDraft!.lastPassingSnapshots[`${LESSON}-e01`]!.evaluatedAt,
    });
    await migrated.goto(`${BASE}/slides/${LESSON}-s04`);
    await grade(migrated, 1, true);
    await expect.poll(async () => (await preservedGuide(migrated)).complete).toBe(true);
    const currentGuide = await preservedGuide(migrated);
    expect(currentGuide.files).toEqual(before.files);
    expect(currentGuide.firstCompletedAt).toEqual(expect.any(String));
    await migrated.goto(`${BASE}/slides/${LESSON}-s03`);
    const answer = migrated.getByText('aは30、bは20を返します。', { exact: true });
    await expect(answer).not.toBeVisible();
    await migrated.getByText('答えと理由を見る', { exact: true }).click();
    await expect(answer).toBeVisible();
    await migrated.goto(`${BASE}/slides/${LESSON}-s04`);
    await migrated.getByRole('link', { name: '追加練習：毎回の初期化を直す' }).click();
    await grade(migrated, 2, false);
    const source = await editorText(migrated);
    await migrated.getByRole('button', { name: 'ヒントを見る' }).click();
    const hint = migrated.getByRole('dialog', { name: 'ヒント' });
    await hint.getByRole('button', { name: /ヒント1を見る/ }).click();
    await migrated.keyboard.press('Escape');
    expect(await editorText(migrated)).toBe(source);
    await replaceEditorText(migrated, source + '\n// 下書きの確認\n');
    await migrated.getByRole('button', { name: '最初に戻す', exact: true }).click();
    await migrated
      .getByRole('dialog', { name: '最初のコードに戻しますか？' })
      .getByRole('button', { name: '最初のコードに戻す', exact: true })
      .click();
    await expect.poll(() => editorText(migrated)).toBe(source);
    expect(await preservedGuide(migrated)).toEqual(currentGuide);
    await grade(migrated, 2, true);
    await grade(migrated, 3, true);
    expect(await preservedGuide(migrated)).toEqual(currentGuide);
    const roundtrip = await exportBundle(migrated, info, 'after.json');
    const restoredContext = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      baseURL,
    });
    try {
      const restored = await restoredContext.newPage();
      await importBundle(restored, roundtrip);
      expect(await preservedGuide(restored)).toEqual(currentGuide);
      await restored.goto(`${BASE}/slides/${LESSON}-s03`);
      await expect(
        restored.getByText('aは30、bは20を返します。', { exact: true }),
      ).not.toBeVisible();
    } finally {
      await restoredContext.close();
    }
  } finally {
    await context.close();
  }
});
