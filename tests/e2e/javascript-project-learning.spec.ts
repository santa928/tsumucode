import { readFile, writeFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import type { CourseProgress, ExerciseDraft } from '../../src/core/persistence/contracts';
import {
  openEditableJavaScriptExercise,
  javascriptExerciseRoute,
} from './helpers/javascriptCourse';
import {
  editorText,
  readStoredProgress,
  waitForStoredDraftContent,
  type StoredProgressProbe,
} from './helpers/progress';
import { testBasePath } from './helpers/testBasePath';

test.use({
  actionTimeout: 15_000,
  navigationTimeout: 20_000,
  viewport: { width: 1280, height: 720 },
});

const TITLES = [
  '問題を画面へ表示する',
  '回答を受け取り、次の問題へ進む',
  '正解だけ得点へ積む',
  '全問の後に結果を出す',
  'もう一度、最初から挑戦する',
];

/** 実教材のAuthoring Sourceを読み、UIへ入力する内容だけを得る。 */
async function source(n: number, kind = 'solution', file = 'main.js'): Promise<string> {
  const lesson = n === 6 ? 'javascript-ch13-l01' : `javascript-ch12-l0${String(n)}`;
  return readFile(
    `content/javascript/chapters/${lesson.slice(0, 15)}/lessons/${lesson}/exercises/${lesson}-e01/${kind}/${file}`,
    'utf8',
  );
}

/** 読み取り専用DB probeからJavaScriptの正本recordを選ぶ。 */
function course(probe: StoredProgressProbe): CourseProgress {
  const record = probe.courses.find((item) => item['courseId'] === 'javascript');
  expect(record).toBeDefined();
  return record as unknown as CourseProgress;
}

/** 読み取り専用DB probeから共有制作Draftを選ぶ。 */
function draft(probe: StoredProgressProbe, workspaceId = 'javascript-quiz-guided'): ExerciseDraft {
  const record = probe.drafts.find((item) => item['workspaceId'] === workspaceId);
  expect(record).toBeDefined();
  return record as unknown as ExerciseDraft;
}

/** 実キーボード入力を保存まで待つ。virtualized DOMの全行一致を要求しない。 */
async function writeSource(page: Page, value: string): Promise<void> {
  const editor = page.locator('.cm-content');
  await expect(editor).toHaveAttribute('contenteditable', 'true');
  await editor.click();
  await expect(editor).toBeFocused();
  await expect(editor).toHaveAttribute('aria-readonly', 'false');
  await editor.press('Control+A');
  await expect(editor).toBeFocused();
  await page.keyboard.insertText(value);
  try {
    await waitForStoredDraftContent(page, value);
  } catch (error: unknown) {
    await writeFile(
      test.info().outputPath('source-input-failure.json'),
      JSON.stringify(
        {
          expected: value,
          saved: await readStoredProgress(page),
          focus: await page.evaluate(() => ({
            tag: document.activeElement?.tagName,
            className: document.activeElement?.className,
            contenteditable: document.querySelector('.cm-content')?.getAttribute('contenteditable'),
          })),
          visible: await editorText(page),
        },
        null,
        2,
      ),
    );
    throw error;
  }
}

/** 保存正本の全Sourceと、再表示Editorの先頭・末尾を実scrollで照合する。 */
async function restoredSource(page: Page, value: string): Promise<void> {
  await expect
    .poll(async () =>
      (await readStoredProgress(page)).drafts.some((record) => {
        const files = record['files'];
        return (
          typeof files === 'object' &&
          files !== null &&
          (files as Record<string, unknown>)['main.js'] === value
        );
      }),
    )
    .toBe(true);
  const lines = value.trimEnd().split('\n');
  await page.locator('.cm-content').press('Control+Home');
  await expect.poll(() => editorText(page)).toContain(lines[0]);
  await page.locator('.cm-content').press('Control+End');
  await expect.poll(() => editorText(page)).toContain(lines.at(-1));
}

/** 保存済みのSourceをUIから実判定し、Feedback drawerを閉じる。 */
async function grade(page: Page, heading = 'できました'): Promise<number> {
  const route = page.url();
  const before = await page.evaluate(
    () => performance.getEntriesByName('tsumucode:validation').length,
  );
  await page.getByRole('button', { name: '判定する', exact: true }).click();
  await expect(
    page.getByRole('heading', {
      name: heading === 'できました' ? 'ピースがはまりました' : heading,
      exact: true,
    }),
  ).toBeVisible({
    timeout: 20_000,
  });
  await expect
    .poll(() => page.evaluate(() => performance.getEntriesByName('tsumucode:validation').length))
    .toBe(before + 1);
  const duration = await page.evaluate(
    () => performance.getEntriesByName('tsumucode:validation').at(-1)!.duration,
  );
  if (heading === 'できました') {
    await page.goto(route);
    await expect(page.getByRole('button', { name: '判定する', exact: true })).toBeEnabled();
  } else await page.getByRole('button', { name: '閉じる', exact: true }).click();
  return duration;
}

/** 古い実行画面へ操作しないよう、編集後のPreviewをUIから更新する。 */
async function refresh(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'プレビューを更新', exact: true }).click();
  await expect(page.getByRole('button', { name: '判定する', exact: true })).toBeEnabled();
}

test('Guidedを累積制作し、編集・取消・確定Reset・持出しを実UIで区別する', async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(8 * 60_000);
  page.on('crash', () => {
    console.log('UI_PAGE_CRASH', page.url());
  });
  const evidence: Record<string, unknown> = {};
  evidence['environment'] = { browserVersion: browser.version(), viewport: page.viewportSize() };
  let inherited: string | undefined;
  for (let n = 1; n <= 5; n += 1) {
    console.log('UI_GUIDED_OPEN', n);
    await openEditableJavaScriptExercise(page, {
      lessonId: `javascript-ch12-l0${String(n)}`,
      exerciseId: `javascript-ch12-l0${String(n)}-e01`,
      title: TITLES[n - 1]!,
    });
    await page.getByRole('tab', { name: 'main.js', exact: true }).click();
    if (inherited !== undefined) await restoredSource(page, inherited);
    await page.getByRole('button', { name: 'ヒントを見る', exact: true }).click();
    const hint = page.getByRole('dialog', { name: 'ヒント', exact: true });
    await expect(hint.getByRole('button', { name: 'ヒント1を見る：観察ポイント' })).toBeVisible();
    await hint.getByRole('button', { name: 'ヒント1を見る：観察ポイント' }).click();
    await expect(hint.locator('details[open]')).toBeVisible();
    await hint.getByRole('button', { name: '閉じる', exact: true }).click();
    await expect(hint).not.toBeVisible();
    const currentHint = `javascript-ch12-l0${String(n)}-e01-h01`;
    await expect
      .poll(
        async () =>
          (await readStoredProgress(page)).drafts.find(
            (record) => record['workspaceId'] === 'javascript-quiz-guided',
          )?.['revealedHintIds'],
      )
      .toEqual([currentHint]);
    inherited = await source(n);
    await writeSource(page, inherited);
    await waitForStoredDraftContent(page, inherited);
    await grade(page);
    console.log('UI_GUIDED_GRADED', n);
    await page.reload();
    await expect(page.getByRole('tab', { name: 'main.js', exact: true })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await restoredSource(page, inherited);
    await page.getByRole('button', { name: 'ヒントを見る', exact: true }).click();
    await expect(hint.locator('details[open]')).toBeVisible();
    await expect(hint.getByRole('button', { name: 'ヒント2を見る：考え方' })).toBeVisible();
    await hint.getByRole('button', { name: '閉じる', exact: true }).click();
    expect(draft(await readStoredProgress(page)).revealedHintIds).toEqual([currentHint]);
    evidence['stage' + String(n)] = await readStoredProgress(page);
    await writeFile(
      testInfo.outputPath('project-learning-evidence.json'),
      JSON.stringify(evidence, null, 2),
    );
  }
  const completed = await readStoredProgress(page);
  const originalFirst = course(completed).lessons['javascript-ch12-l01']!.firstCompletedAt;
  for (let n = 1; n <= 5; n += 1)
    expect(course(completed).lessons[`javascript-ch12-l0${String(n)}`]?.currentComplete).toBe(true);
  expect(draft(completed).revealedHintIds).toEqual(['javascript-ch12-l05-e01-h01']);
  evidence['completed'] = completed;

  const badScore = await source(5, 'fixtures/always-score');
  await writeSource(page, badScore);
  await waitForStoredDraftContent(page, badScore);
  const edited = await readStoredProgress(page);
  for (let n = 1; n <= 5; n += 1)
    expect(course(edited).lessons[`javascript-ch12-l0${String(n)}`]?.currentComplete).toBe(false);
  expect(draft(edited).lastPassingSnapshots).toEqual(draft(completed).lastPassingSnapshots);
  expect(course(edited).lessons['javascript-ch12-l01']!.firstCompletedAt).toBe(originalFirst);
  await grade(page, 'あと一歩');
  const beforeCancel = await readStoredProgress(page);
  await page.getByRole('button', { name: '最初に戻す', exact: true }).click();
  const reset = page.getByRole('dialog', { name: '最初のコードに戻しますか？' });
  await reset.getByRole('button', { name: '編集を続ける', exact: true }).click();
  expect(await readStoredProgress(page)).toEqual(beforeCancel);
  await restoredSource(page, badScore);
  evidence['cancelledReset'] = beforeCancel;
  console.log('UI_CANCELLED_RESET_KEPT');
  await page.getByRole('button', { name: '最初に戻す', exact: true }).click();
  await reset.getByRole('button', { name: '最初のコードに戻す', exact: true }).click();
  const starter = await source(5, 'starter');
  await waitForStoredDraftContent(page, starter);
  const confirmed = await readStoredProgress(page);
  for (const file of ['index.html', 'styles.css', 'questions.js', 'main.js'])
    expect(draft(confirmed).files[file]).toBe(await source(5, 'starter', file));
  expect(draft(confirmed).revealedHintIds).toEqual([]);
  expect(draft(confirmed).validationHistory).toEqual([]);
  expect(draft(confirmed).lastPassingSnapshots).toEqual({});
  for (let n = 1; n <= 5; n += 1)
    expect(course(confirmed).lessons[`javascript-ch12-l0${String(n)}`]?.currentComplete).toBe(
      false,
    );
  evidence['confirmedReset'] = confirmed;
  console.log('UI_CONFIRMED_RESET_RESTORED');

  const valid = await source(5);
  await writeSource(page, valid);
  await waitForStoredDraftContent(page, valid);
  await grade(page);
  const previousPass = await readStoredProgress(page);
  const unsafe = valid + '\ntry { const key = -1; [1][key]; } catch (error) {}\n';
  await writeSource(page, unsafe);
  await waitForStoredDraftContent(page, unsafe);
  await page.getByRole('button', { name: '判定する', exact: true }).click();
  await expect(
    page.getByText('この環境では未対応です。採点していません。', { exact: true }),
  ).toBeVisible({
    timeout: 20_000,
  });
  const rejected = await readStoredProgress(page);
  expect(draft(rejected).validationHistory).toEqual(draft(previousPass).validationHistory);
  expect(draft(rejected).lastPassingSnapshots).toEqual(draft(previousPass).lastPassingSnapshots);
  evidence['unsupportedKeptPreviousPass'] = rejected;
  console.log('UI_UNSUPPORTED_KEPT_PASS');
  await writeSource(page, valid);
  await waitForStoredDraftContent(page, valid);
  await grade(page);

  await refresh(page);
  const frame = page.getByTestId('runtime-preview-frame').locator('iframe').contentFrame();
  await frame.locator('#fail-load').click();
  await expect(frame.locator('#status')).toHaveText('読み込めませんでした。開始でやり直せます');
  await frame.locator('#start').press('Enter');
  await expect(frame.locator('#question')).toHaveText('見た目を整えるのは？');
  await frame.locator('#choice-0').press('Enter');
  await expect(frame.locator('#feedback')).toHaveText('正解は CSS です');
  await expect(frame.locator('#score')).toHaveText('得点: 0');
  await frame.locator('#next').press('Space');
  await expect(frame.locator('#question')).toHaveText('Webページの骨組みを作るのは？');
  await frame.locator('#choice-0').press('Enter');
  await frame.locator('#next').press('Enter');
  await expect(frame.locator('#result')).toHaveText('2問中1問正解');
  await frame.locator('#restart').press('Space');
  await expect(frame.locator('#score')).toHaveText('得点: 0');
  await expect(frame.locator('#choice-0')).toBeFocused();
  await page.screenshot({ path: testInfo.outputPath('guided-desktop-1280.png') });

  await openEditableJavaScriptExercise(page, {
    lessonId: 'javascript-ch13-l01',
    exerciseId: 'javascript-ch13-l01-e01',
    title: '自分で設計する学習クイズ',
  });
  await page.getByRole('tab', { name: 'main.js', exact: true }).click();
  await expect.poll(() => editorText(page)).toContain((await source(6, 'starter')).trimEnd());
  const alternate = await source(6, 'fixtures/alternate-name');
  await writeSource(page, alternate);
  await waitForStoredDraftContent(page, alternate);
  await grade(page);
  await refresh(page);
  await frame.locator('#category').selectOption('logic');
  await frame.locator('#start').press('Enter');
  await expect(frame.locator('#progress')).toHaveText('問題1 / 2');
  await expect(frame.locator('#question')).toHaveText('1 + 1 は？');
  await page.screenshot({ path: testInfo.outputPath('capstone-desktop-1280.png') });
  const exported = await readStoredProgress(page);
  await page.goto(`${testBasePath()}#/`);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '全コースの進捗と下書きを書き出す', exact: true }).click();
  const bundle = testInfo.outputPath('project-progress.json');
  await (await download).saveAs(bundle);
  const fresh = await browser.newContext();
  try {
    const imported = await fresh.newPage();
    await imported.goto(`${testBasePath()}#/`);
    const importInput = imported.getByLabel('書き出した学習データを読み込む');
    await expect(importInput).toBeEnabled();
    // Chromium's path upload can lose a file under a non-ASCII artifact directory.
    // The selected file still contains exactly the bytes downloaded through the UI.
    await importInput.setInputFiles({
      name: 'project-progress.json',
      mimeType: 'application/json',
      buffer: await readFile(bundle),
    });
    await expect(imported.getByRole('region', { name: '読み込み差分' })).toBeVisible();
    const loaded = imported.waitForEvent('domcontentloaded');
    await imported.getByRole('button', { name: 'この内容を読み込む' }).click();
    await loaded;
    await openEditableJavaScriptExercise(imported, {
      lessonId: 'javascript-ch12-l05',
      exerciseId: 'javascript-ch12-l05-e01',
      title: TITLES[4]!,
    });
    await imported.getByRole('tab', { name: 'main.js', exact: true }).click();
    await restoredSource(imported, valid);
    expect(draft(await readStoredProgress(imported)).lastPassingSnapshots).toEqual(
      draft(exported).lastPassingSnapshots,
    );
    await grade(imported);
    await openEditableJavaScriptExercise(imported, {
      lessonId: 'javascript-ch13-l01',
      exerciseId: 'javascript-ch13-l01-e01',
      title: '自分で設計する学習クイズ',
    });
    await imported.getByRole('tab', { name: 'main.js', exact: true }).click();
    await restoredSource(imported, alternate);
    await grade(imported);
    evidence['importedAndRegraded'] = await readStoredProgress(imported);
    await imported.setViewportSize({ width: 390, height: 844 });
    await imported.goto(
      javascriptExerciseRoute({
        lessonId: 'javascript-ch13-l01',
        exerciseId: 'javascript-ch13-l01-e01',
        title: '自分で設計する学習クイズ',
      }),
    );
    await expect(
      imported.getByRole('heading', { name: 'PCで演習を開く', exact: true }),
    ).toBeVisible();
    await expect(imported.getByText('この端末の完成状態を確認しています')).toHaveCount(0);
    await expect(imported.getByText('端末の進捗を読み込めませんでした')).toHaveCount(0);
    expect(await imported.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(
      false,
    );
    await imported.screenshot({
      path: testInfo.outputPath('capstone-mobile-390.png'),
      fullPage: true,
    });
  } finally {
    await fresh.close();
  }
  await writeFile(
    testInfo.outputPath('project-learning-evidence.json'),
    JSON.stringify(evidence, null, 2),
  );
});

for (const project of [
  { n: 5, title: TITLES[4]!, kind: 'solution', label: 'G5全5prefix' },
  {
    n: 6,
    title: '自分で設計する学習クイズ',
    kind: 'fixtures/alternate-name',
    label: 'Capstone別解',
  },
] as const) {
  test(`${project.label}の実Controller判定をwarmup3＋20で測定する`, async ({
    page,
    browser,
  }, testInfo) => {
    test.setTimeout(150_000);
    const lessonId = project.n === 6 ? 'javascript-ch13-l01' : 'javascript-ch12-l05';
    await openEditableJavaScriptExercise(page, {
      lessonId,
      exerciseId: `${lessonId}-e01`,
      title: project.title,
    });
    await page.getByRole('tab', { name: 'main.js', exact: true }).click();
    const value = await source(project.n, project.kind);
    await writeSource(page, value);
    const rows: { run: number; warmup: boolean; validationMs: number }[] = [];
    for (let run = 0; run < 23; run += 1) {
      const validationMs = await grade(page);
      rows.push({ run, warmup: run < 3, validationMs });
      await writeFile(
        testInfo.outputPath('project-performance.json'),
        JSON.stringify(
          { lessonId, browserVersion: browser.version(), viewport: page.viewportSize(), rows },
          null,
          2,
        ),
      );
      console.log('PROJECT_CONTROLLER_MEASURE', project.label, run, validationMs);
    }
    const times = rows
      .filter((row) => !row.warmup)
      .map((row) => row.validationMs)
      .sort((a, b) => a - b);
    const p95 = times[Math.ceil(times.length * 0.95) - 1]!;
    const stored = await readStoredProgress(page);
    const targets =
      project.n === 5
        ? [1, 2, 3, 4, 5].map((n) => `javascript-ch12-l0${String(n)}`)
        : ['javascript-ch13-l01'];
    for (const target of targets)
      expect(course(stored).lessons[target]?.currentComplete).toBe(true);
    const workspaceId = project.n === 5 ? 'javascript-quiz-guided' : 'javascript-quiz-capstone';
    expect(draft(stored, workspaceId).files['main.js']).toBe(value);
    await writeFile(
      testInfo.outputPath('project-performance.json'),
      JSON.stringify(
        {
          lessonId,
          browserVersion: browser.version(),
          viewport: page.viewportSize(),
          rows,
          warmup: 3,
          iterations: 20,
          p95,
          targets,
          savedSource: draft(stored, workspaceId).files,
        },
        null,
        2,
      ),
    );
    expect(p95).toBeLessThanOrEqual(3000);
  });
}
