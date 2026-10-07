import { readFile, writeFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readStoredProgress, waitForDraftSaved } from './helpers/progress';
import { testBasePath } from './helpers/testBasePath';
import { expectStoredViewedSlide } from './helpers/releaseCourse';
const lessons = ['react-ch02-l01', 'react-ch02-l02', 'react-ch03-l01'];
const route = (lesson: string) =>
  `${testBasePath()}#/courses/react/lessons/${lesson}/exercises/${lesson}-e01`;
/** 同じworkspaceでも工程の読込完了を見出しで確認してから操作する。 */
async function openExercise(page: Page, lesson: string): Promise<void> {
  const titles: Record<string, string> = {
    'react-ch02-l01': '型付きの問題をComponentへ渡す',
    'react-ch02-l02': 'クイズStateを純粋な関数で更新する',
    'react-ch03-l01': '誤答から再回答できる練習クイズ',
  };
  const title = titles[lesson];
  if (title === undefined) throw new Error(`未登録の工程: ${lesson}`);
  await page.goto(route(lesson));
  await expect(page.getByRole('heading', { level: 1, name: title, exact: true })).toBeVisible();
}
const workspace = (lesson: string) =>
  lesson.includes('ch03') ? 'react-quiz-capstone' : 'react-quiz-guided';
async function source(lesson: string, file: string, role = 'solution'): Promise<string> {
  const chapter = lesson.includes('ch03') ? 'react-ch03' : 'react-ch02';
  return readFile(
    `content/react/chapters/${chapter}/lessons/${lesson}/exercises/${lesson}-e01/${role}/${file}`,
    'utf8',
  );
}
async function draft(page: Page, id: string) {
  return (await readStoredProgress(page)).drafts.find((item) => item['workspaceId'] === id);
}
/** 通常Editorと保存正本を使い、画面外も含む2Fileの原文を確認する。 */
async function writeSource(page: Page, lesson: string, file: string, value: string): Promise<void> {
  await page.getByRole('tab', { name: file, exact: true }).click();
  const editor = page.getByRole('textbox', { name: `${file} のコードエディター`, exact: true });
  await editor.focus();
  await editor.press('Control+A');
  await page.keyboard.insertText(value);
  await expect
    .poll(async () => (await draft(page, workspace(lesson)))?.['files'])
    .toMatchObject({ [file]: value });
  await waitForDraftSaved(page);
}
async function preview(page: Page): Promise<void> {
  const trigger = page.getByRole('button', { name: 'プレビューを更新', exact: true });
  await expect(trigger).toBeEnabled();
  await trigger.focus();
  await expect(trigger).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(
    page.frameLocator('iframe[title="Reactコードのプレビュー"]').locator('#question'),
  ).toBeVisible({ timeout: 20000 });
}
async function grade(page: Page): Promise<void> {
  await page.getByRole('button', { name: '判定する', exact: true }).click();
  await expect(page.getByTestId('learning-completion')).toBeVisible({ timeout: 30000 });
}
async function reset(page: Page): Promise<void> {
  await page.getByRole('button', { name: '最初に戻す', exact: true }).click();
  await page
    .getByRole('dialog', { name: '最初のコードに戻しますか？' })
    .getByRole('button', { name: '最初のコードに戻す', exact: true })
    .click();
  await expect(page.getByRole('dialog', { name: '最初のコードに戻しますか？' })).toBeHidden();
  await waitForDraftSaved(page);
}

test('Guidedの工程別合格を引き継ぎ、型から復帰し、独立CapstoneとResetを保護する', async ({
  page,
}, info) => {
  test.setTimeout(240000);
  await page.setViewportSize({ width: 1280, height: 900 });
  const evidence: Record<string, unknown> = {};
  const first = lessons[0]!,
    second = lessons[1]!,
    capstone = lessons[2]!;
  for (const lesson of lessons)
    for (const n of [1, 2, 3]) {
      const slide = `${lesson}-s0${String(n)}`;
      await page.goto(`${testBasePath()}#/courses/react/lessons/${lesson}/slides/${slide}`);
      await expect(page.getByTestId('slide-stage')).toHaveAttribute('data-slide-id', slide);
      await expectStoredViewedSlide(page, lesson, slide);
    }
  await openExercise(page, first);
  const trigger = page.getByRole('button', { name: 'ヒントを見る', exact: true });
  await expect(trigger).toBeEnabled();
  await trigger.focus();
  await expect(trigger).toBeFocused();
  await page.keyboard.press('Enter');
  const hint = page.getByRole('dialog', { name: 'ヒント', exact: true });
  await expect(hint).toBeVisible();
  await hint.getByRole('button', { name: /^ヒント1を見る/u }).focus();
  await page.keyboard.press('Enter');
  await expect(hint).toContainText('mapが作るbuttonを探し、表示・Key・Callbackの3箇所を比べます。');
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await writeSource(page, first, 'QuestionCard.tsx', await source(first, 'QuestionCard.tsx'));
  await preview(page);
  const frame = page.frameLocator('iframe[title="Reactコードのプレビュー"]');
  await frame.getByRole('textbox', { name: '名前', exact: true }).fill('学習者');
  await frame.getByRole('button', { name: 'CSS', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(frame.locator('#received')).toHaveText('CSS');
  await expect(frame.locator('#score')).toHaveText('0');
  await page.screenshot({ path: info.outputPath(`${first}-real-dom.png`), fullPage: true });
  await grade(page);
  const firstComplete = await readStoredProgress(page);
  const firstCourse = firstComplete.courses.find((item) => item['courseId'] === 'react')!;
  expect(
    (firstCourse['lessons'] as Record<string, { currentComplete: boolean }>)[first]
      ?.currentComplete,
  ).toBe(true);
  evidence[first] = firstComplete;
  await openExercise(page, second);
  expect((await draft(page, 'react-quiz-guided'))?.['files']).toMatchObject({
    'QuestionCard.tsx': await source(first, 'QuestionCard.tsx'),
    'quizState.ts': await source(first, 'quizState.ts'),
  });
  await page.getByRole('button', { name: '判定する', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '判定結果', exact: true })).toBeVisible({
    timeout: 60000,
  });
  await page.screenshot({ path: info.outputPath('guided-second-incomplete.png'), fullPage: true });
  await writeFile(
    info.outputPath('guided-second-incomplete.json'),
    JSON.stringify(await readStoredProgress(page), null, 2),
  );
  await expect
    .poll(
      async () =>
        (
          (await draft(page, 'react-quiz-guided'))?.['validationHistory'] as { status: string }[]
        ).at(-1)?.status,
      { timeout: 30000 },
    )
    .toBe('incomplete');
  await expect(page.getByRole('dialog', { name: '判定結果', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  const solution = await source(second, 'quizState.ts');
  const invalid = solution.replace('score: 0,', 'score: true,');
  await writeSource(page, second, 'quizState.ts', invalid);
  await page.getByRole('button', { name: 'プレビューを更新', exact: true }).click();
  await expect(
    page.getByText('型を確認してください。まだ実行・採点していません。', { exact: true }),
  ).toBeVisible({ timeout: 20000 });
  await page.reload();
  expect((await draft(page, 'react-quiz-guided'))?.['files']).toMatchObject({
    'quizState.ts': invalid,
  });
  await writeSource(page, second, 'quizState.ts', solution);
  await preview(page);
  await frame.getByRole('textbox', { name: '名前', exact: true }).fill('学習者');
  await frame.getByRole('button', { name: 'HTML', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(frame.locator('#score')).toHaveText('1');
  await frame.locator('#next').focus();
  await page.keyboard.press('Enter');
  await frame.getByRole('button', { name: 'JavaScript', exact: true }).click();
  await expect(frame.locator('#score')).toHaveText('1');
  await frame.locator('#next').click();
  await expect(frame.locator('#result')).toHaveText('全問終了');
  await frame.locator('#retry').click();
  await expect(frame.locator('#received')).toHaveText('未回答');
  await expect(frame.locator('#score')).toHaveText('0');
  await expect(frame.getByRole('textbox', { name: '名前', exact: true })).toHaveValue('学習者');
  await page.screenshot({ path: info.outputPath(`${second}-real-dom.png`), fullPage: true });
  await grade(page);
  await openExercise(page, first);
  await preview(page);
  expect((await draft(page, 'react-quiz-guided'))?.['files']).toMatchObject({
    'quizState.ts': solution,
  });
  await grade(page);
  await openExercise(page, second);
  await page.reload();
  await preview(page);
  await expect(frame.getByRole('textbox', { name: '名前', exact: true })).toHaveValue('');
  await expect(frame.locator('#score')).toHaveText('0');
  const guidedBefore = await draft(page, 'react-quiz-guided');
  const complete = await readStoredProgress(page);
  const guidedLessons = complete.courses.find((item) => item['courseId'] === 'react')![
    'lessons'
  ] as Record<string, unknown>;
  for (const lesson of [first, second])
    expect(guidedLessons[lesson]).toMatchObject({ currentComplete: true });
  expect(Object.keys(guidedBefore?.['lastPassingSnapshots'] as object)).toEqual(
    expect.arrayContaining([`${first}-e01`, `${second}-e01`]),
  );
  evidence['guidedComplete'] = complete;
  await openExercise(page, capstone);
  await writeSource(page, capstone, 'QuestionCard.tsx', await source(capstone, 'QuestionCard.tsx'));
  await writeSource(page, capstone, 'quizState.ts', await source(capstone, 'quizState.ts'));
  await preview(page);
  await frame.getByRole('textbox', { name: '名前', exact: true }).fill('練習者');
  await frame.getByRole('button', { name: '2', exact: true }).click();
  await frame.locator('#next').click();
  await frame.getByRole('button', { name: 'true', exact: true }).click();
  await expect(frame.locator('#score')).toHaveText('1');
  await frame.getByRole('button', { name: 'false', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(frame.locator('#score')).toHaveText('2');
  await frame.locator('#next').click();
  await expect(frame.locator('#result')).toHaveText('全問終了');
  await frame.locator('#retry').focus();
  await page.keyboard.press('Enter');
  await expect(frame.locator('#received')).toHaveText('未回答');
  await expect(frame.locator('#score')).toHaveText('0');
  await expect(frame.getByRole('textbox', { name: '名前', exact: true })).toHaveValue('練習者');
  await page.screenshot({ path: info.outputPath(`${capstone}-real-dom.png`), fullPage: true });
  await page.getByRole('button', { name: 'プレビューを広く表示', exact: true }).click();
  await page.getByRole('button', { name: '100%で見る', exact: true }).click();
  await page.screenshot({ path: info.outputPath(`${capstone}-expanded.png`), fullPage: true });
  await page.getByRole('button', { name: '編集画面に戻す', exact: true }).click();
  await grade(page);
  expect(await draft(page, 'react-quiz-guided')).toEqual(guidedBefore);
  await openExercise(page, capstone);
  await page.reload();
  expect((await draft(page, 'react-quiz-capstone'))?.['files']).toMatchObject({
    'QuestionCard.tsx': await source(capstone, 'QuestionCard.tsx'),
    'quizState.ts': await source(capstone, 'quizState.ts'),
  });
  await reset(page);
  const resetCap = await readStoredProgress(page);
  const resetDraft = resetCap.drafts.find((item) => item['workspaceId'] === 'react-quiz-capstone')!;
  expect(resetDraft['validationHistory']).toEqual([]);
  expect(resetDraft['lastPassingSnapshots']).toEqual({});
  expect(resetDraft['files']).toMatchObject({
    'QuestionCard.tsx': await source(capstone, 'QuestionCard.tsx', 'starter'),
    'quizState.ts': await source(capstone, 'quizState.ts', 'starter'),
  });
  expect(await draft(page, 'react-quiz-guided')).toEqual(guidedBefore);
  const resetLessons = resetCap.courses.find((item) => item['courseId'] === 'react')![
    'lessons'
  ] as Record<string, unknown>;
  expect(resetLessons[first]).toEqual(guidedLessons[first]);
  expect(resetLessons[second]).toEqual(guidedLessons[second]);
  expect((await new AxeBuilder({ page }).exclude('iframe').analyze()).violations).toEqual([]);
  evidence['resetCapstone'] = resetCap;
  await openExercise(page, second);
  await reset(page);
  const resetGuided = await draft(page, 'react-quiz-guided');
  expect(resetGuided?.['validationHistory']).toEqual([]);
  expect(resetGuided?.['lastPassingSnapshots']).toEqual({});
  expect(resetGuided?.['files']).toMatchObject({
    'QuestionCard.tsx': await source(second, 'QuestionCard.tsx', 'starter'),
    'quizState.ts': await source(second, 'quizState.ts', 'starter'),
  });
  expect(await draft(page, 'react-quiz-capstone')).toEqual(resetDraft);
  evidence['resetGuided'] = await readStoredProgress(page);
  await writeFile(
    info.outputPath('quiz-workspace-evidence.json'),
    JSON.stringify(evidence, null, 2),
  );
});

test('390pxでProjectの9SlideとPC案内を読める', async ({ page }, info) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 390, height: 844 });
  for (const lesson of lessons)
    for (const n of [1, 2, 3]) {
      const slide = `${lesson}-s0${String(n)}`;
      await page.goto(`${testBasePath()}#/courses/react/lessons/${lesson}/slides/${slide}`);
      await expect(page.getByTestId('slide-stage')).toHaveAttribute('data-slide-id', slide);
      await expectStoredViewedSlide(page, lesson, slide);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        390,
      );
      await page.screenshot({ path: info.outputPath(`${slide}-mobile.png`), fullPage: true });
    }
  await page.goto(route('react-ch03-l01'));
  await expect(page.getByRole('heading', { name: 'PCで演習を開く', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '判定する', exact: true })).toHaveCount(0);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: info.outputPath('quiz-mobile-pc-notice.png'), fullPage: true });
});
