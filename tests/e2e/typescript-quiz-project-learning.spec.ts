/** 同じ作品を通常UIで3工程へ積み上げ、Source保存と失敗からの復帰を確認する。 */
import { readFile, writeFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {
  editorText,
  readStoredProgress,
  waitForDraftSaved,
  waitForStoredDraftContent,
} from './helpers/progress';
import { testBasePath } from './helpers/testBasePath';
const workspaceId = 'typescript-quiz-guided';
function route(suffix: string): string {
  const lesson = `typescript-ch06-l${suffix}`;
  return `${testBasePath()}#/courses/typescript/lessons/${lesson}/exercises/${lesson}-e01`;
}
async function source(suffix: string, role = 'solution', file = 'main.ts'): Promise<string> {
  const lesson = `typescript-ch06-l${suffix}`;
  return readFile(
    `content/typescript/chapters/typescript-ch06/lessons/${lesson}/exercises/${lesson}-e01/${role}/${file}`,
    'utf8',
  );
}
/** 長いSourceは仮想スクロールのDOM断片で比較せず、保存正本と先頭/末尾を確認する。 */
async function writeMain(page: Page, value: string): Promise<void> {
  const editor = page.getByRole('textbox', { name: 'main.ts のコードエディター', exact: true });
  await editor.focus();
  await expect(editor).toBeFocused();
  await editor.press('Control+A');
  await page.keyboard.insertText(value);
  try {
    await expect
      .poll(async () => {
        const stored = await readStoredProgress(page);
        const draft = stored.drafts.find((item) => item['workspaceId'] === workspaceId);
        return (draft?.['files'] as Record<string, string> | undefined)?.['main.ts'];
      })
      .toBe(value);
    await waitForDraftSaved(page);
  } catch (error) {
    await writeFile(
      test.info().outputPath('failed-workspace-save.json'),
      JSON.stringify(await readStoredProgress(page), null, 2),
    );
    throw error;
  }
}
async function restored(page: Page, value: string): Promise<void> {
  await expect(page.getByRole('tab', { name: 'main.ts', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect
    .poll(async () => {
      const stored = await readStoredProgress(page);
      const draft = stored.drafts.find((item) => item['workspaceId'] === workspaceId);
      return (draft?.['files'] as Record<string, string> | undefined)?.['main.ts'];
    })
    .toBe(value);
  const lines = value.trimEnd().split('\n');
  const editor = page.getByRole('textbox', { name: 'main.ts のコードエディター', exact: true });
  await editor.focus();
  await expect(editor).toBeFocused();
  await editor.press('Control+Home');
  await expect.poll(() => editorText(page)).toContain(lines[0]);
  await editor.press('Control+End');
  await expect.poll(() => editorText(page)).toContain(lines.at(-1));
}
async function preview(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'プレビューを更新', exact: true }).click();
  const frame = page.getByTestId('runtime-preview-frame').locator('iframe').contentFrame();
  await frame.locator('#start').click();
  await expect(frame.locator('#question')).toHaveText('Webページの骨組みを作るのは？');
}
async function grade(page: Page): Promise<void> {
  await preview(page);
  await page.getByRole('button', { name: '判定する', exact: true }).click();
  await expect(page.getByTestId('learning-completion')).toBeVisible({ timeout: 30000 });
}
test('3工程の原文とChecklistを積み上げ、型/実行失敗から戻り、共有ResetでJSを保護する', async ({
  page,
}, testInfo) => {
  test.setTimeout(240000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(
    `${testBasePath()}#/courses/javascript/lessons/javascript-ch01-l01/exercises/javascript-ch01-l01-e01`,
  );
  await expect(page.locator('.cm-content')).toBeVisible();
  await page.getByRole('tab', { name: 'script.js', exact: true }).click();
  const jsSource = "console.log('JSの原文を保持');\n";
  await page.locator('.cm-content').click();
  await page.keyboard.press('Control+A');
  await page.keyboard.insertText(jsSource);
  await waitForStoredDraftContent(page, jsSource);
  const jsBefore = await readStoredProgress(page);
  const jsRecords = {
    courses: jsBefore.courses.filter((item) => item['courseId'] === 'javascript'),
    drafts: jsBefore.drafts.filter((item) => item['courseId'] === 'javascript'),
  };
  let inherited: string | undefined;
  const evidence: Record<string, unknown> = { jsBefore: jsRecords };
  for (const suffix of ['01', '02', '03']) {
    const lesson = `typescript-ch06-l${suffix}`;
    await page.goto(route(suffix));
    await expect(page.getByRole('tab', { name: 'main.ts', exact: true })).toBeVisible();
    if (inherited !== undefined) await restored(page, inherited);
    inherited = await source(suffix);
    await writeMain(page, inherited);
    await grade(page);
    await page.goto(route(suffix));
    await page.reload();
    await restored(page, inherited);
    const stored = await readStoredProgress(page);
    const draft = stored.drafts.find((item) => item['workspaceId'] === workspaceId)!;
    const history = draft['validationHistory'] as { exerciseId: string; status: string }[];
    expect(
      history.some((item) => item.exerciseId === `${lesson}-e01` && item.status === 'pass'),
    ).toBe(true);
    evidence[lesson] = stored;
    await preview(page);
    await page.screenshot({ path: testInfo.outputPath(`${lesson}-desktop.png`) });
  }
  const complete = await readStoredProgress(page);
  const progress = complete.courses.find((item) => item['courseId'] === 'typescript')!;
  const lessons = progress['lessons'] as Record<string, { currentComplete: boolean }>;
  for (const suffix of ['01', '02', '03'])
    expect(lessons[`typescript-ch06-l${suffix}`]?.currentComplete).toBe(true);
  const finalSource = inherited!;
  const invalid = finalSource.replace('choices: readonly string[];', 'choices: number;');
  expect(invalid).toContain('choices: number;');
  await writeMain(page, invalid);
  await expect(
    page.getByText('型を確認してください。まだ実行・採点していません。', { exact: true }),
  ).toBeVisible({ timeout: 20000 });
  await page.reload();
  await restored(page, invalid);
  const runtimeFailure = finalSource + "\nthrow new Error('修正して再試行する実行失敗');\n";
  await writeMain(page, runtimeFailure);
  await page.getByRole('button', { name: 'プレビューを更新', exact: true }).click();
  await expect(page.getByText('修正して再試行する実行失敗', { exact: false }).first()).toBeVisible({
    timeout: 20000,
  });
  await page.reload();
  await restored(page, runtimeFailure);
  await writeMain(page, finalSource);
  await grade(page);
  await page.goto(route('03'));
  await page.getByRole('button', { name: '最初に戻す', exact: true }).click();
  await page
    .getByRole('dialog', { name: '最初のコードに戻しますか？' })
    .getByRole('button', { name: '編集を続ける', exact: true })
    .click();
  await restored(page, finalSource);
  await page.getByRole('button', { name: '最初に戻す', exact: true }).click();
  await page
    .getByRole('dialog', { name: '最初のコードに戻しますか？' })
    .getByRole('button', { name: '最初のコードに戻す', exact: true })
    .click();
  await expect(page.getByRole('dialog', { name: '最初のコードに戻しますか？' })).toBeHidden();
  await restored(page, await source('03', 'starter'));
  const reset = await readStoredProgress(page);
  const draft = reset.drafts.find((item) => item['workspaceId'] === workspaceId)!;
  expect(draft['validationHistory']).toEqual([]);
  expect(draft['lastPassingSnapshots']).toEqual({});
  const files = draft['files'] as Record<string, string>;
  for (const file of ['main.ts', 'index.html', 'styles.css', 'quiz-ui.ts', 'questions.ts'])
    expect(files[file]).toBe(await source('03', 'starter', file));
  expect(reset.courses.filter((item) => item['courseId'] === 'javascript')).toEqual(
    jsRecords.courses,
  );
  expect(reset.drafts.filter((item) => item['courseId'] === 'javascript')).toEqual(
    jsRecords.drafts,
  );
  evidence['reset'] = reset;
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await writeFile(
    testInfo.outputPath('typescript-quiz-workspace.json'),
    JSON.stringify(evidence, null, 2),
  );
});
for (const suffix of ['01', '02', '03'])
  test(`制作${suffix}のSlideは390pxで図・本文・練習を読める`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const lesson = `typescript-ch06-l${suffix}`;
    for (const slide of ['01', '02', '03', '04']) {
      await page.goto(
        `${testBasePath()}#/courses/typescript/lessons/${lesson}/slides/${lesson}-s${slide}`,
      );
      await expect(page.getByTestId('slide-stage')).toHaveAttribute(
        'data-slide-id',
        `${lesson}-s${slide}`,
      );
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
        false,
      );
      if (slide === '01')
        await page
          .getByTestId('slide-stage')
          .getByRole('img')
          .screenshot({ path: testInfo.outputPath(`${lesson}-diagram-mobile.png`) });
      await page.screenshot({
        path: testInfo.outputPath(`${lesson}-s${slide}-mobile.png`),
        fullPage: true,
      });
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    }
  });
