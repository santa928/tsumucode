import { attachPythonFixtureCoverage } from './helpers/pythonFixtureCoverage';
import { observeLocalConsole } from './helpers/localConsoleDiagnostics';
import { testBasePath } from './helpers/testBasePath';
import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { parse } from 'yaml';
import { editorText, readStoredProgress, replaceEditorText } from './helpers/progress';

const base = testBasePath();
const consoleDiagnostics = new WeakMap<Page, ReturnType<typeof observeLocalConsole>>();

test('Pythonの入力・対話練習・Consoleへ通常スクロールで到達できる', async ({ page }, info) => {
  await page.setViewportSize({ width: 1200, height: 682 });
  await page.goto(
    `${base}#/courses/python-basics/lessons/python-basics-ch01-l02/exercises/python-basics-ch01-l02-e01`,
  );
  await expect(page.locator('.cm-content')).toBeVisible();
  const preview = page.getByTestId('runtime-preview-frame');
  const bounds = await preview.boundingBox();
  if (!bounds) throw new Error('Consoleの表示領域がありません');
  const consoleOutput = page.getByRole('region', { name: 'Console出力', exact: true });
  // AX clickによる自動scrollを使わず、学習者と同じwheel操作で到達する。
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.wheel(0, 1200);
  await expect(async () => {
    const frame = await preview.boundingBox();
    const output = await consoleOutput.boundingBox();
    expect(frame).not.toBeNull();
    expect(output).not.toBeNull();
    expect(output!.y).toBeGreaterThanOrEqual(Math.max(0, frame!.y));
    expect(output!.y + output!.height).toBeLessThanOrEqual(
      Math.min(682, frame!.y + frame!.height) + 1,
    );
  }).toPass();
  await expect(page.getByRole('button', { name: '判定する', exact: true })).toBeInViewport();
  // 既存のConsoleのTab停止点にも、入力欄から通常の順序で到達できる。
  const practice = page.getByRole('button', { name: '練習実行', exact: true });
  const unsupported = page.getByText(
    'このブラウザでは実行途中の入力に未対応です。上の事前入力でプレビューできます。対話練習には対応するChromiumを使ってください。',
    { exact: true },
  );
  const browserPracticeSupported = await page.evaluate(
    () =>
      typeof Reflect.get(WebAssembly, 'Suspending') === 'function' &&
      typeof Reflect.get(WebAssembly, 'promising') === 'function',
  );
  await expect(practice.or(unsupported)).toBeVisible({ timeout: 30_000 });
  if (!browserPracticeSupported && (await unsupported.isVisible())) {
    // 未対応時は練習を実行せず、説明と事前入力からConsoleへの経路を確認する。
    await expect(practice).toHaveCount(0);
    await page.getByLabel('実行前の入力（1行につきinput 1回）').focus();
    await page.keyboard.press('Tab');
    await expect(consoleOutput).toBeFocused();
    await expect(consoleOutput).toBeInViewport();
    await info.attach('explicit-unsupported', {
      body: '対話入力のブラウザ機能なし。未対応説明と事前入力からConsoleへの経路だけを確認し、練習の実行成功には数えない。',
      contentType: 'text/plain',
    });
    return;
  }
  await expect(unsupported).toHaveCount(0);
  await expect(practice).toBeEnabled({ timeout: 30_000 });
  await page.getByLabel('実行前の入力（1行につきinput 1回）').focus();
  await page.keyboard.press('Tab');
  await expect(practice).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('region', { name: '練習のConsole出力', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(consoleOutput).toBeFocused();
  await expect(consoleOutput).toBeInViewport();
});

test.beforeEach(async ({ page }) => {
  consoleDiagnostics.set(page, observeLocalConsole(page));
});
test.afterEach(async ({ page }, info) => {
  const observer = consoleDiagnostics.get(page);
  observer?.stop();
  if (info.status !== info.expectedStatus) {
    // 診断の保存失敗で元の検証結果を上書きしない。
    await observer?.attach(info).catch(() => undefined);
  }
});

/** 同じ通常画面をCPython/Pyodide双方で検証する。合成の実行結果は使わない。 */
async function storedDraft(page: Page, id: string) {
  return (await readStoredProgress(page)).drafts.find((draft) => draft['workspaceId'] === id);
}

for (const number of [2, 3, 4, 5, 6, 7]) {
  const lessonId = `python-basics-ch01-l0${String(number)}`;
  const exerciseId = `${lessonId}-e01`;
  const sourceRoot = `content/python-basics/chapters/python-basics-ch01/lessons/${lessonId}/exercises/${exerciseId}`;
  test(
    `Python l0${String(number)}の正負Fixtureを実入力とASTで確認する`,
    { annotation: { type: 'release-exercise', description: exerciseId } },
    async ({ page }, info) => {
      test.setTimeout(240_000);
      const exercise = parse(await readFile(`${sourceRoot}/exercise.yaml`, 'utf8')) as {
        fixtures: {
          id: string;
          expectedStatus: string;
          expectedLocalStatus?: string;
          expectedFeedbackRuleIds: string[];
          inputLines: string[];
          files: { source: string }[];
        }[];
      };
      await page.goto(`${base}#/courses/python-basics/lessons/${lessonId}/exercises/${exerciseId}`);
      await expect(page.locator('.cm-content')).toBeVisible();
      const local = (await page.getByRole('region', { name: 'CPythonの練習実行' }).count()) > 0;
      for (const fixture of exercise.fixtures) {
        await test.step(fixture.id, async () => {
          // 初回Previewの準備中はEditorが読取専用のため、編集可能になってから操作する。
          await expect(page.getByRole('button', { name: '判定する', exact: true })).toBeEnabled({
            timeout: 30_000,
          });
          const source = await readFile(`${sourceRoot}/${fixture.files[0]!.source}`, 'utf8');
          await replaceEditorText(page, source);
          if (number === 2 || number === 3)
            await page
              .getByLabel('実行前の入力（1行につきinput 1回）')
              .fill(fixture.inputLines.join('\n'));
          const previous = (await storedDraft(page, exerciseId))?.['validationHistory'];
          // Localの採点入力は固定。空の事前入力によるValueErrorはPreviewで引き続き確認する。
          if (local && number === 3 && fixture.id === 'empty') {
            await page.getByRole('button', { name: 'プレビューを更新', exact: true }).click();
            await expect(
              page.getByRole('region', { name: 'Console出力', exact: true }),
            ).toContainText('ValueError', { timeout: 30_000 });
            expect((await storedDraft(page, exerciseId))?.['validationHistory']).toEqual(previous);
          }
          const expectedStatus = local
            ? (fixture.expectedLocalStatus ?? fixture.expectedStatus)
            : fixture.expectedStatus;
          await page.getByRole('button', { name: '判定する', exact: true }).click();
          if (expectedStatus === 'system-error') {
            await expect(page.getByText(/入力行が不足しています/).first()).toBeVisible({
              timeout: 30_000,
            });
            expect(
              (await storedDraft(page, exerciseId))?.['validationHistory'],
              fixture.id,
            ).toEqual(previous);
            expect(await editorText(page)).toBe(source);
            await expect(page.getByRole('dialog')).toHaveCount(0);
            await attachPythonFixtureCoverage(info, {
              exerciseId,
              fixtureId: fixture.id,
              mode: local ? 'cpython' : 'pyodide',
              files: { 'main.py': source },
              ...(!local ? { inputLines: fixture.inputLines } : {}),
              actualStatus: 'system-error',
            });
            return;
          }
          await expect(page.getByRole('dialog')).toBeVisible({ timeout: 30_000 });
          await expect
            .poll(
              async () => {
                const history = (await storedDraft(page, exerciseId))?.['validationHistory'] as
                  { status: string; checks: { passed: boolean; ruleId: string }[] }[] | undefined;
                return history?.at(-1);
              },
              { message: fixture.id },
            )
            .toMatchObject({ status: expectedStatus });
          const history = (await storedDraft(page, exerciseId))?.['validationHistory'] as {
            checks: { passed: boolean; ruleId: string }[];
          }[];
          expect(
            history
              .at(-1)
              ?.checks.filter((check) => !check.passed)
              .map((check) => check.ruleId),
            fixture.id,
          ).toEqual(fixture.expectedFeedbackRuleIds);
          await page.getByRole('button', { name: '閉じる', exact: true }).click();
          if (number >= 5 && fixture.id === 'empty') {
            await expect(
              page
                .getByRole('region', { name: 'Console出力', exact: true })
                .getByText('0', { exact: true }),
            ).toBeVisible();
          }
          if (number >= 5 && fixture.expectedStatus === 'code-error') {
            expect(await editorText(page)).toBe(source);
          }
          await attachPythonFixtureCoverage(info, {
            exerciseId,
            fixtureId: fixture.id,
            mode: local ? 'cpython' : 'pyodide',
            files: { 'main.py': source },
            ...(!local ? { inputLines: fixture.inputLines } : {}),
            actualStatus: expectedStatus as 'pass' | 'incomplete' | 'code-error' | 'system-error',
          });
        });
      }
      if (number >= 5) {
        const solution = await readFile(`${sourceRoot}/solution/main.py`, 'utf8');
        await replaceEditorText(page, solution);
        await page.getByRole('button', { name: '判定する', exact: true }).click();
        await expect(page.getByRole('heading', { name: 'できました', exact: true })).toBeVisible({
          timeout: 30_000,
        });
        await page.getByRole('button', { name: '閉じる', exact: true }).click();
        expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
        await page.screenshot({
          path: info.outputPath(`python-l0${String(number)}-exercise.png`),
          fullPage: true,
        });
        await page.reload();
        await expect.poll(() => editorText(page)).toBe(solution);
        await expect(page.getByRole('button', { name: '最初に戻す', exact: true })).toBeEnabled({
          timeout: 30_000,
        });
        await page.getByRole('button', { name: '最初に戻す', exact: true }).click();
        await page
          .getByRole('dialog', { name: '最初のコードに戻しますか？' })
          .getByRole('button', { name: '最初のコードに戻す', exact: true })
          .click();
        const starter = await readFile(`${sourceRoot}/starter/main.py`, 'utf8');
        await expect.poll(() => editorText(page)).toBe(starter);
        await page.getByRole('button', { name: '判定する', exact: true }).click();
        await expect(page.getByRole('dialog')).toBeVisible({ timeout: 30_000 });
        await expect
          .poll(async () => {
            const history = (await storedDraft(page, exerciseId))?.['validationHistory'] as
              { status: string }[] | undefined;
            return history?.at(-1)?.status;
          })
          .toBe('incomplete');
        await page.getByRole('button', { name: '閉じる', exact: true }).click();
      }
    },
  );
}

test('事前入力の上限・非保存・実行中止・出力上限から復帰する', async ({ page }, info) => {
  test.setTimeout(120_000);
  const id = 'python-basics-ch01-l02-e01';
  await page.goto(`${base}#/courses/python-basics/lessons/python-basics-ch01-l02/exercises/${id}`);
  await expect(page.locator('.cm-content')).toBeVisible();
  const solution = 'name = input()\nprint(name)\n';
  await replaceEditorText(page, solution);
  const input = page.getByLabel('実行前の入力（1行につきinput 1回）');
  await input.fill('x'.repeat(1024));
  await page.getByRole('button', { name: '判定する', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'できました', exact: true })).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole('button', { name: '閉じる', exact: true }).click();
  await input.fill('input-only-140-marker');
  await page.getByRole('button', { name: 'プレビューを更新', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Console出力', exact: true })).toContainText(
    'input-only-140-marker',
    { timeout: 30_000 },
  );
  expect(JSON.stringify(await readStoredProgress(page))).not.toContain('input-only-140-marker');
  const history = (await storedDraft(page, id))?.['validationHistory'];
  await input.fill('あ'.repeat(342));
  // 入力上限は事前Previewの契約。固定採点はこの入力欄を読まない。
  await page.getByRole('button', { name: 'プレビューを更新', exact: true }).click();
  await expect(page.getByText(/入力は16行・1 KiB以内/).first()).toBeVisible();
  expect((await storedDraft(page, id))?.['validationHistory']).toEqual(history);
  await input.fill('つむ');
  // 実行準備中も停止できる。LocalのAPI/Browserの固定core取得だけを短く遅らせる。
  await page.route(/\/api\/session$|\/python-runtime\/314\.0\.7\/core\.wasm$/u, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await route.continue().catch(() => undefined);
  });
  await page.getByRole('button', { name: '判定する', exact: true }).click();
  await expect(input).toBeDisabled();
  await page.getByRole('button', { name: '実行を停止', exact: true }).click();
  await expect(
    page.getByText('実行を停止しました。採点していません。', { exact: true }).first(),
  ).toBeVisible({ timeout: 30_000 });
  expect((await storedDraft(page, id))?.['validationHistory']).toEqual(history);
  expect(await editorText(page)).toBe(solution);
  await page.unrouteAll({ behavior: 'wait' });
  const output = 'for number in range(100000):\n    print(number)\n';
  await replaceEditorText(page, output);
  await page.getByRole('button', { name: '判定する', exact: true }).click();
  await expect(
    page.getByText('実行を停止しました。採点していません。', { exact: true }).first(),
  ).toBeVisible({ timeout: 30_000 });
  expect((await storedDraft(page, id))?.['validationHistory']).toEqual(history);
  await replaceEditorText(page, solution);
  await page.getByRole('button', { name: '判定する', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'できました', exact: true })).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole('button', { name: '閉じる', exact: true }).click();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await input.focus();
  await page.screenshot({ path: info.outputPath('python-input-exercise.png'), fullPage: true });
  await page.reload();
  await expect(page.locator('.cm-content')).toBeVisible();
  await expect(input).toHaveValue('');
  expect(await editorText(page)).toBe(solution);
});

test('整数変換エラー中のEOFErrorという入力を行不足へ誤分類しない', async ({ page }) => {
  await page.goto(
    `${base}#/courses/python-basics/lessons/python-basics-ch01-l03/exercises/python-basics-ch01-l03-e01`,
  );
  await expect(page.locator('.cm-content')).toBeVisible();
  await page.getByLabel('実行前の入力（1行につきinput 1回）').fill('EOFError');
  const local = (await page.getByRole('region', { name: 'CPythonの練習実行' }).count()) > 0;
  if (local) {
    const before = (await storedDraft(page, 'python-basics-ch01-l03-e01'))?.['validationHistory'];
    await page.getByRole('button', { name: 'プレビューを更新', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Console出力', exact: true })).toContainText(
      'ValueError',
      {
        timeout: 30_000,
      },
    );
    expect((await storedDraft(page, 'python-basics-ch01-l03-e01'))?.['validationHistory']).toEqual(
      before,
    );
    return;
  }
  await page.getByRole('button', { name: '判定する', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 30_000 });
  await expect
    .poll(async () => {
      const history = (await storedDraft(page, 'python-basics-ch01-l03-e01'))?.[
        'validationHistory'
      ] as { status: string }[] | undefined;
      return history?.at(-1)?.status;
    })
    .toBe('code-error');
});

test('Python Collection・Functionの読書と予測を狭幅・キーボードで確認する', async ({
  page,
}, info) => {
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  await page.setViewportSize({ width: 390, height: 844 });
  for (const number of [5, 6, 7]) {
    const id = `python-basics-ch01-l0${String(number)}`;
    await page.goto(`${base}#/courses/python-basics/lessons/${id}/slides/${id}-s01`);
    const answer = page.getByText('答えと理由を見る', { exact: true });
    await expect(answer).toBeVisible();
    await answer.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('section[aria-label="結果を予測する"] details')).toHaveAttribute(
      'open',
      '',
    );
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath(`python-l0${String(number)}-reading.png`),
      fullPage: true,
    });
  }
  expect(requests.filter((url) => /python-runtime\/|assets\/pythonRuntime-/u.test(url))).toEqual(
    [],
  );
});
