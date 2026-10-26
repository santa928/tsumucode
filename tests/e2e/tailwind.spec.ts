import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { loadAuthoringCourse } from '../../scripts/content/compileCourse';
import { testBasePath, testServerUrl } from './helpers/testBasePath';
import { replaceEditorText, readStoredProgress } from './helpers/progress';
import { expectSlideScrollReachable } from './helpers/slideScroll';
import type * as RunnerModule from '../../src/adapters/runtime/tailwind/TailwindRunnerAdapter';
import type * as SrcdocModule from '../../src/adapters/runtime/tailwind/createTailwindSrcdoc';
import type * as SharedRunnerModule from '../../src/adapters/runtime/html-css/HtmlCssRunnerAdapter';
import type * as ValidatorModule from '../../src/core/validation/validatorRuleEngine';

const base = testBasePath();
const lessonId = 'tailwind-ch01-l01';
const exerciseId = `${lessonId}-e01`;
const exerciseRoute = `${base}#/courses/tailwind/lessons/${lessonId}/exercises/${exerciseId}`;
const authoring = await loadAuthoringCourse('content/tailwind');
const exercise = authoring.exercises[0]!;

test('拒否するHTMLの解析段階でも外部画像・frame・CSS・scriptを取得しない', async ({
  page,
}, info) => {
  const harness = new URL('./tailwind-rejected-input.html', testServerUrl(4174)).href;
  const externalRequests: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).hostname === 'tailwind-boundary.invalid') {
      externalRequests.push(request.url());
    }
  });
  await page.route('https://tailwind-boundary.invalid/**', (route) => route.abort());
  await page.route(harness, (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><title>拒否入力の境界</title>',
    }),
  );
  await page.goto(harness);
  const rows = await page.evaluate(async (viewport) => {
    const runnerPath = new URL(
      './src/adapters/runtime/tailwind/TailwindRunnerAdapter.ts',
      location.href,
    ).href;
    const { TailwindRunnerAdapter } = (await import(
      /* @vite-ignore */ runnerPath
    )) as typeof RunnerModule;
    const runner = new TailwindRunnerAdapter();
    const frame = document.createElement('iframe');
    document.body.append(frame);
    const sources = [
      '<img src="https://tailwind-boundary.invalid/image.png">',
      '<iframe src="https://tailwind-boundary.invalid/frame"></iframe>',
      '<iframe srcdoc="&lt;img src=&quot;https://tailwind-boundary.invalid/nested.png&quot;&gt;"></iframe>',
      '<style>@import "https://tailwind-boundary.invalid/style.css";</style>',
      '<link rel="stylesheet" href="https://tailwind-boundary.invalid/link.css">',
      '<script src="https://tailwind-boundary.invalid/script.js"></script>',
      '<div style="background:url(https://tailwind-boundary.invalid/background.png)"></div>',
    ];
    const observations = [];
    try {
      await runner.prepare(frame);
      for (const [index, source] of sources.entries()) {
        const result = await runner.render({
          languageId: 'tailwind',
          exerciseSessionId: 'rejected-input',
          executionRevision: index + 1,
          files: { 'index.html': source },
          assets: [],
          viewport,
          options: {},
        });
        observations.push({
          diagnostics: result.diagnostics.map(({ code }) => code),
          srcdoc: frame.srcdoc,
        });
      }
      // DOMParser由来の非同期取得も観測し、HTTP遮断を「試行なし」と混同しない。
      await new Promise((resolve) => setTimeout(resolve, 100));
      return observations;
    } finally {
      await runner.dispose();
      frame.remove();
    }
  }, exercise.previewViewports[0]!);
  expect(rows).toHaveLength(7);
  for (const row of rows) {
    expect(row.diagnostics).toContain('TAILWIND_INPUT_UNSUPPORTED');
    expect(row.srcdoc).toBe('');
  }
  expect(externalRequests).toEqual([]);
  await info.attach('拒否入力の解析境界', {
    body: JSON.stringify({ rows, externalRequests }, null, 2),
    contentType: 'application/json',
  });
});

test('固定compilerと製品Runnerで全9Fixtureを同revisionの実Style判定へ結ぶ', async ({
  page,
}, info) => {
  const harness = new URL('./tailwind-fixtures.html', testServerUrl(4174)).href;
  await page.route(harness, (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><title>Tailwind固定Fixture</title>',
    }),
  );
  await page.goto(harness);
  const rows = await page.evaluate(async (exercise) => {
    const runnerPath = new URL(
      './src/adapters/runtime/tailwind/TailwindRunnerAdapter.ts',
      location.href,
    ).href;
    const validatorPath = new URL('./src/core/validation/validatorRuleEngine.ts', location.href)
      .href;
    const { TailwindRunnerAdapter } = (await import(
      /* @vite-ignore */ runnerPath
    )) as typeof RunnerModule;
    const { ValidatorRuleEngine } = (await import(
      /* @vite-ignore */ validatorPath
    )) as typeof ValidatorModule;
    const runner = new TailwindRunnerAdapter();
    const validator = new ValidatorRuleEngine();
    const frame = document.createElement('iframe');
    document.body.append(frame);
    const viewport = exercise.previewViewports[0]!;
    const policy = validator.buildSnapshotPolicy(exercise.validationRules);
    const observations = [];
    try {
      await runner.prepare(frame);
      for (const [index, fixture] of exercise.fixtures.entries()) {
        const files = Object.fromEntries(fixture.files.map((file) => [file.path, file.content]));
        const revision = index + 1;
        const rendered = await runner.render({
          languageId: 'tailwind',
          exerciseSessionId: exercise.id,
          executionRevision: revision,
          files,
          assets: [],
          viewport,
          options: {},
        });
        const snapshot = await runner.requestSnapshot({
          exerciseSessionId: exercise.id,
          executionRevision: revision,
          requestId: crypto.randomUUID(),
          policy,
        });
        const result = await validator.validate({
          exerciseId: exercise.id,
          rules: exercise.validationRules,
          files,
          snapshots: { [viewport.id]: snapshot },
          diagnostics: rendered.diagnostics,
          evidence: [],
          console: [],
          interactionScenarios: [],
          interactionCheckpoints: {},
          now: new Date().toISOString(),
        });
        observations.push({
          id: fixture.id,
          status: result.status,
          failedRules: result.checks.filter((check) => !check.passed).map((check) => check.ruleId),
          expectedStatus: fixture.expectedStatus,
          expectedRules: fixture.expectedFeedbackRuleIds,
          diagnostics: rendered.diagnostics.map(({ code }) => code),
          sandbox: frame.getAttribute('sandbox'),
        });
      }
      return observations;
    } finally {
      await runner.dispose();
      frame.remove();
    }
  }, exercise);
  for (const row of rows) {
    expect(row.status, row.id).toBe(row.expectedStatus);
    expect(row.failedRules.sort(), row.id).toEqual([...row.expectedRules].sort());
    expect(row.sandbox).toBe('allow-scripts');
  }
  expect(rows.find(({ id }) => id === 'tailwind-unknown-class')?.diagnostics).toContain(
    'TAILWIND_CLASS_UNSUPPORTED',
  );
  await info.attach('実Style判定', {
    body: JSON.stringify(rows, null, 2),
    contentType: 'application/json',
  });
});

test('preflight先行・別style・空出力をreadyへせず、遅延commitと取消・復旧を区別する', async ({
  page,
}, info) => {
  test.setTimeout(45_000);
  const harness = new URL('./tailwind-ready.html', testServerUrl(4174)).href;
  await page.route(harness, (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><title>Tailwind ready故障検査</title>',
    }),
  );
  await page.goto(harness);
  const result = await page.evaluate(async () => {
    const srcdocPath = new URL(
      './src/adapters/runtime/tailwind/createTailwindSrcdoc.ts',
      location.href,
    ).href;
    const runnerPath = new URL(
      './src/adapters/runtime/html-css/HtmlCssRunnerAdapter.ts',
      location.href,
    ).href;
    const { createTailwindSrcdoc } = (await import(
      /* @vite-ignore */ srcdocPath
    )) as typeof SrcdocModule;
    const { HtmlCssRunnerAdapter } = (await import(
      /* @vite-ignore */ runnerPath
    )) as typeof SharedRunnerModule;
    const utilityCss = '.gap-\\[313px\\]{gap:313px} #cards{display:flex;gap:16px;padding:16px}';
    const appendStyle =
      'const output=document.createElement("style");document.head.append(output);';
    const complete = `output.textContent=${JSON.stringify(utilityCss)};`;
    let source = appendStyle + complete;
    const runner = new HtmlCssRunnerAdapter({
      languageId: 'tailwind',
      validateSource: () => [],
      async createSrcdoc(input, signal) {
        signal.throwIfAborted();
        return createTailwindSrcdoc(input, source);
      },
    });
    const frame = document.createElement('iframe');
    document.body.append(frame);
    const input = (revision: number) => ({
      languageId: 'tailwind',
      exerciseSessionId: 'ready-test',
      executionRevision: revision,
      files: {
        'index.html': '<div id="cards" class="flex gap-4 p-4"><div>A</div><div>B</div></div>',
      },
      assets: [],
      viewport: { id: 'desktop', width: 1280, height: 720 },
      options: {},
    });
    const snapshot = (revision: number) =>
      runner.requestSnapshot({
        exerciseSessionId: 'ready-test',
        executionRevision: revision,
        requestId: crypto.randomUUID(),
        policy: {
          selectors: ['#cards'],
          attributes: [],
          computedStyles: ['gap'],
          includeAllElements: false,
          focusVisibleSelectors: [],
          focusVisibleComputedStyles: [],
        },
      });
    /** 期待する失敗の種別を記録し、成功を取り違えない。 */
    async function rejected(promise: Promise<unknown>): Promise<string> {
      try {
        await promise;
        return 'unexpected-success';
      } catch (error) {
        return error instanceof Error ? error.name : 'unknown';
      }
    }
    try {
      await runner.prepare(frame);
      await runner.render(input(1));
      source =
        appendStyle +
        'output.textContent="html{font-size:16px}";setTimeout(()=>{' +
        complete +
        '},150);';
      let ready = false;
      const late = runner.render(input(2)).then(() => {
        ready = true;
      });
      await new Promise((resolve) => setTimeout(resolve, 50));
      const early = ready;
      const prematureSnapshot = await rejected(snapshot(2));
      await late;
      const observedGap = (await snapshot(2)).nodes.find((node) =>
        node.matchedSelectors.includes('#cards'),
      )?.computedStyles['gap'];
      // 別styleにsentinelがあっても、compiler出力style自体のcommitがなければ未ready。
      source =
        appendStyle +
        'output.textContent="html{font-size:16px}";const other=document.createElement("style");' +
        `other.textContent=${JSON.stringify(utilityCss)};document.body.append(other);`;
      const wrongStyle = await rejected(runner.render(input(3)));
      const restoredGap = (await snapshot(2)).nodes.find((node) =>
        node.matchedSelectors.includes('#cards'),
      )?.computedStyles['gap'];
      const staleSnapshot = await rejected(snapshot(3));
      source = appendStyle;
      const noCss = await rejected(runner.render(input(4)));
      source = 'throw new Error("compiler fault fixture")';
      const compilerError = await rejected(runner.render(input(5)));
      source = appendStyle + 'setTimeout(()=>{' + complete + '},150);';
      const disposed = rejected(runner.render(input(6)));
      await new Promise((resolve) => setTimeout(resolve, 25));
      await runner.dispose();
      const cancelled = await disposed;
      const afterDispose = await rejected(snapshot(6));
      await runner.prepare(frame);
      source = appendStyle + complete;
      await runner.render(input(7));
      const rePrepared = (await snapshot(7)).executionRevision;
      source = appendStyle + 'setTimeout(()=>{' + complete + '},150);';
      const replaced = rejected(runner.render(input(8)));
      await new Promise((resolve) => setTimeout(resolve, 25));
      source = appendStyle + complete;
      await runner.render(input(9));
      const replacementCancelled = await replaced;
      const replacementRevision = (await snapshot(9)).executionRevision;
      const replacedSnapshot = await rejected(snapshot(8));
      return {
        early,
        prematureSnapshot,
        observedGap,
        wrongStyle,
        restoredGap,
        staleSnapshot,
        noCss,
        compilerError,
        cancelled,
        afterDispose,
        rePrepared,
        replacementCancelled,
        replacementRevision,
        replacedSnapshot,
      };
    } finally {
      await runner.dispose();
      frame.remove();
    }
  });
  expect(result.early).toBe(false);
  expect(result.prematureSnapshot).not.toBe('unexpected-success');
  expect(result.observedGap).toBe('16px');
  expect(result.restoredGap).toBe('16px');
  for (const key of [
    'wrongStyle',
    'staleSnapshot',
    'noCss',
    'compilerError',
    'afterDispose',
  ] as const)
    expect(result[key], key).not.toBe('unexpected-success');
  expect(result.cancelled).toBe('AbortError');
  expect(result.rePrepared).toBe(7);
  expect(result.replacementCancelled).toBe('AbortError');
  expect(result.replacementRevision).toBe(9);
  expect(result.replacedSnapshot).not.toBe('unexpected-success');
  await info.attach('ready故障と復旧', {
    body: JSON.stringify(result, null, 2),
    contentType: 'application/json',
  });
});

test('通常UIで誤値・正例・保存・Hint・Reset・取得失敗後の再試行を確認する', async ({
  page,
}, info) => {
  await page.goto(exerciseRoute);
  const update = page.getByRole('button', { name: 'プレビューを更新', exact: true });
  const grade = page.getByRole('button', { name: '判定する', exact: true });
  await expect(grade).toBeEnabled();
  await grade.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog')).toContainText('項目どうしの間隔');
  const hint = page.getByRole('button', { name: /次のヒントを見る/ }).first();
  await expect(hint).toBeEnabled();
  await hint.focus();
  await expect(hint).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('region', { name: 'ヒント', exact: true })).toContainText(
    '親の横並び',
  );
  await page.getByRole('button', { name: '閉じる', exact: true }).click();
  const solution = exercise.solutionFiles[0]!.content;
  await replaceEditorText(page, solution);
  await expect
    .poll(async () => {
      const draft = (await readStoredProgress(page)).drafts.find(
        (value) => value['workspaceId'] === exerciseId,
      );
      return (draft?.['files'] as Record<string, string> | undefined)?.['index.html'];
    })
    .toBe(solution);
  await update.click();
  await expect(grade).toBeEnabled();
  const preview = page.frameLocator('[data-testid="runtime-preview-frame"] iframe');
  await expect(preview.locator('#cards')).toHaveCSS('display', 'flex');
  await expect(preview.locator('#cards')).toHaveCSS('gap', '16px');
  await expect(preview.locator('#cards')).toHaveCSS('padding', '16px');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: info.outputPath('tailwind-solution.png'), fullPage: true });
  await grade.click();
  await expect(
    page.getByRole('dialog').getByRole('heading', { name: 'できました', exact: true }),
  ).toBeVisible();
  await expect
    .poll(async () => {
      const draft = (await readStoredProgress(page)).drafts.find(
        (value) => value['workspaceId'] === exerciseId,
      );
      return (draft?.['validationHistory'] as { status: string }[] | undefined)?.at(-1)?.status;
    })
    .toBe('pass');
  await page.getByRole('button', { name: '閉じる', exact: true }).click();
  await page.reload();
  await expect(page.locator('.cm-content')).toContainText('flex gap-4 p-4');
  // cacheを持たない再読み込みで、通信障害による未採点と同Source再試行を確認。
  await page.route('**/tailwind-runtime/4.3.2/browser.global.js', (route) => route.abort());
  await page.reload();
  await expect(page.locator('.cm-content')).toContainText('flex gap-4 p-4');
  await expect(page.getByRole('alert')).toHaveText(
    '実行環境で問題が起きました。編集内容を残しています。もう一度実行してください。',
  );
  await page.unroute('**/tailwind-runtime/4.3.2/browser.global.js');
  await update.click();
  await expect(preview.locator('#cards')).toHaveCSS('gap', '16px');
  const unsupported = solution.replace('id="cards"', 'id="cards" style="padding:16px"');
  await replaceEditorText(page, unsupported);
  await update.click();
  await expect(page.getByRole('list', { name: 'コード診断' })).toContainText(
    'style属性はこの実習では未対応',
  );
  await expect
    .poll(async () => {
      const draft = (await readStoredProgress(page)).drafts.find(
        (value) => value['workspaceId'] === exerciseId,
      );
      return (draft?.['files'] as Record<string, string> | undefined)?.['index.html'];
    })
    .toBe(unsupported);
  await page.getByRole('button', { name: '最初に戻す', exact: true }).click();
  await page
    .getByRole('dialog', { name: '最初のコードに戻しますか？' })
    .getByRole('button', { name: '最初のコードに戻す', exact: true })
    .click();
  await expect(page.locator('.cm-content')).toContainText('block gap-8 p-2');
});

for (const narrow of [false, true]) {
  test(`${narrow ? '390px' : 'PC'}で全4Slideの図・a11y・初期一覧とcompiler遅延取得を確認する`, async ({
    page,
  }, info) => {
    const requests: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/tailwind-runtime/')) requests.push(request.url());
    });
    await page.setViewportSize(narrow ? { width: 390, height: 844 } : { width: 1280, height: 900 });
    await page.goto(base + '#/');
    await expect(page.getByRole('main')).toBeVisible();
    await expect(page.getByRole('link', { name: authoring.runtime.title })).toHaveCount(0);
    await page.goto(base + '#/paths/frontend');
    await expect(
      page.getByRole('heading', { name: 'フロントエンド学習パス', exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('main')).toBeVisible();
    for (const slide of authoring.runtime.phases[0]!.chapters[0]!.lessons[0]!.slides) {
      await page.goto(`${base}#/courses/tailwind/lessons/${lessonId}/slides/${slide.id}`);
      const stage = page.getByTestId('slide-stage');
      await expect(stage).toHaveAttribute('data-slide-id', slide.id);
      const image = stage.getByRole('img').first();
      await expect(image).toBeVisible();
      await expect
        .poll(() => image.evaluate((node) => (node as HTMLImageElement).naturalWidth))
        .toBeGreaterThan(0);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await expectSlideScrollReachable(page, narrow);
      await image.scrollIntoViewIfNeeded();
      await page.screenshot({ path: info.outputPath(`${slide.id}.png`), fullPage: true });
    }
    expect(requests).toEqual([]);
  });
}
