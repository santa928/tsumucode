import { Buffer } from 'node:buffer';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { editorText, readStoredProgress } from './helpers/progress';
import {
  STANDARD_EXERCISE_ID,
  STANDARD_LESSON_ID,
  exerciseRoute,
  readExerciseStarter,
} from './helpers/releaseCourse';

const STANDARD_CHAPTER_ID = 'html-css-ch00';

/** 指定workspaceのIndexedDB draftを取得し、欠損時は再試行可能なundefinedを返す。 */
async function readExerciseDraft(
  page: Page,
): Promise<Readonly<Record<string, unknown>> | undefined> {
  return (await readStoredProgress(page)).drafts.find(
    (draft) => draft['workspaceId'] === STANDARD_EXERCISE_ID,
  );
}

/** IndexedDB draftの対象fileが、期待するUTF-8 byte列と完全一致するかを返す。 */
function hasExactUtf8Files(
  draft: Readonly<Record<string, unknown>> | undefined,
  expected: Readonly<Record<string, string>>,
): boolean {
  const files = draft?.['files'];
  if (typeof files !== 'object' || files === null) return false;
  const stored = files as Readonly<Record<string, unknown>>;
  const expectedPaths = Object.keys(expected).sort();
  if (JSON.stringify(Object.keys(stored).sort()) !== JSON.stringify(expectedPaths)) return false;
  return expectedPaths.every((path) => {
    const actual = stored[path];
    return (
      typeof actual === 'string' &&
      Buffer.from(actual, 'utf8').equals(Buffer.from(expected[path]!, 'utf8'))
    );
  });
}

/** CodeMirrorを実UIから置換し、選択中fileのDocumentが完全一致するまで待つ。 */
async function replaceSelectedFile(page: Page, content: string): Promise<void> {
  const editor = page.locator('.cm-content');
  await editor.click();
  await page.keyboard.press('ControlOrMeta+A');
  if (content.length === 0) {
    await page.keyboard.press('Backspace');
  } else {
    await page.keyboard.insertText(content);
  }
  await expect.poll(() => editorText(page)).toBe(content);
}

/** 指定fileを実UIから置換し、対象pathに紐づくIndexedDB値まで確認する。 */
async function replaceWorkspaceFileExactly(
  page: Page,
  path: string,
  content: string,
): Promise<void> {
  const tab = page.getByRole('tab', { name: path, exact: true });
  await tab.click();
  await expect(tab).toHaveAttribute('aria-selected', 'true');
  await replaceSelectedFile(page, content);
  await expect
    .poll(async () => {
      const files = (await readExerciseDraft(page))?.['files'];
      return typeof files === 'object' && files !== null
        ? (files as Readonly<Record<string, unknown>>)[path]
        : undefined;
    })
    .toBe(content);
}

/** 操作Buttonがマウス・タッチ双方で使える44px以上の実寸を持つことを確認する。 */
async function expectMinimumTargetSize(target: Locator): Promise<void> {
  await expect(target).toBeVisible();
  const size = await target.evaluate((element) => {
    const { height, width } = element.getBoundingClientRect();
    return { height, width };
  });
  expect(size.height, '操作targetの高さ').toBeGreaterThanOrEqual(44);
  expect(size.width, '操作targetの幅').toBeGreaterThanOrEqual(44);
}

/** 現在Documentがviewport外へ縦scrollしないことを実寸で確認する。 */
async function expectDocumentFitsViewport(page: Page): Promise<void> {
  const metrics = await page.evaluate(() => ({
    clientHeight: document.documentElement.clientHeight,
    scrollHeight: document.documentElement.scrollHeight,
  }));
  expect(metrics.scrollHeight, 'DocumentのscrollHeight').toBeLessThanOrEqual(
    metrics.clientHeight + 1,
  );
}

test.describe.configure({ timeout: 90_000, retries: 0 });

test('HTML/CSSを全消去しても取消・Starter復元・再読込で安全に戻せる', async ({ page }) => {
  const starter = await readExerciseStarter(
    STANDARD_CHAPTER_ID,
    STANDARD_LESSON_ID,
    STANDARD_EXERCISE_ID,
  );
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(exerciseRoute(STANDARD_LESSON_ID, STANDARD_EXERCISE_ID));
  await expect(
    page.getByRole('heading', { level: 1, name: '内容と見た目を1箇所ずつ変える' }),
  ).toBeVisible();
  await expect(page.getByTestId('code-workspace')).toBeVisible();
  await expect(page.getByRole('button', { name: '判定する' })).toBeEnabled();

  await replaceWorkspaceFileExactly(page, 'index.html', '');
  await replaceWorkspaceFileExactly(page, 'styles.css', '');
  await expect
    .poll(async () =>
      hasExactUtf8Files(await readExerciseDraft(page), { 'index.html': '', 'styles.css': '' }),
    )
    .toBe(true);

  const resetTrigger = page.getByRole('button', { name: '最初に戻す', exact: true });
  await expect(resetTrigger).toBeEnabled();
  await expectMinimumTargetSize(resetTrigger);
  await resetTrigger.click();
  const resetDrawer = page.getByRole('dialog', { name: '最初のコードに戻しますか？' });
  await expect(resetDrawer).toBeVisible();
  const cancel = resetDrawer.getByRole('button', { name: '編集を続ける', exact: true });
  const confirm = resetDrawer.getByRole('button', { name: '最初のコードに戻す', exact: true });
  await expectMinimumTargetSize(cancel);
  await expectMinimumTargetSize(confirm);
  await cancel.click();
  await expect(resetDrawer).toBeHidden();
  for (const path of ['index.html', 'styles.css'] as const) {
    const tab = page.getByRole('tab', { name: path, exact: true });
    await tab.click();
    await expect(tab).toHaveAttribute('aria-selected', 'true');
    await expect.poll(() => editorText(page)).toBe('');
  }
  await expect
    .poll(async () =>
      hasExactUtf8Files(await readExerciseDraft(page), { 'index.html': '', 'styles.css': '' }),
    )
    .toBe(true);

  await resetTrigger.click();
  await expect(resetDrawer).toBeVisible();
  await confirm.click();
  await expect(resetDrawer).toBeHidden();
  await expect(
    page.frameLocator('iframe[title="コードのプレビュー"]').getByRole('heading', {
      name: 'ここを書き換えます',
    }),
  ).toBeVisible();
  await expect
    .poll(async () => hasExactUtf8Files(await readExerciseDraft(page), starter))
    .toBe(true);
  await expect
    .poll(async () => {
      const draft = await readExerciseDraft(page);
      return {
        hints: draft?.['revealedHintIds'],
        snapshots: draft?.['lastPassingSnapshots'],
        validation: draft?.['validationHistory'],
      };
    })
    .toEqual({ hints: [], snapshots: {}, validation: [] });

  await page.reload();
  await expect(page.getByTestId('code-workspace')).toBeVisible();
  for (const [path, content] of Object.entries(starter)) {
    const tab = page.getByRole('tab', { name: path, exact: true });
    await tab.click();
    await expect(tab).toHaveAttribute('aria-selected', 'true');
    await expect.poll(() => editorText(page)).toBe(content);
  }
  await expect(resetTrigger).toBeDisabled();
  await expectDocumentFitsViewport(page);
});
