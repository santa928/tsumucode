import { expect, test } from '@playwright/test';
import type * as PreparationClient from '../../src/adapters/runtime/typescript/TypeScriptPreparationClient';
import type * as RunnerModule from '../../src/adapters/runtime/typescript/TypeScriptRunnerAdapter';
import type * as CompilerClient from '../../src/adapters/runtime/typescript/TypeScriptCompilerClient';
import type * as ValidatorModule from '../../src/adapters/validation/typescript/TypeScriptValidator';
import type { RunnerInput } from '../../src/core/runtime/contracts';
import type { ValidationContext } from '../../src/core/validation/contracts';
import { testServerUrl } from './helpers/testBasePath';
import { readFileSync } from 'node:fs';
import { loadAuthoringLessonDraft } from '../../scripts/content/compileCourse';

const annotationFixtures = JSON.parse(
  readFileSync(new URL('../fixtures/typescript-annotation-pilot.json', import.meta.url), 'utf8'),
) as { id: string; source: string }[];

for (const learningMode of ['annotation', 'inference'] as const) {
  test(`${learningMode}の製品採点は元TSの型条件と実ConsoleをANDで判定する`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(120_000);
    const draft = await loadAuthoringLessonDraft(
      learningMode === 'inference'
        ? 'docs/quality/typescript-ch01-l01-draft'
        : 'docs/quality/typescript-ch01-l02-draft',
      'typescript',
    );
    const exercise = draft.authoringExercises[0]!;
    if (exercise.runtime?.kind !== 'typescript') throw new Error('TypeScript runtimeが必要です');
    const harness = new URL('__typescript-annotation-grading', testServerUrl(4174)).href;
    await page.route(harness, (route) =>
      route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>型注釈採点</title>' }),
    );
    await page.goto(harness);
    const observations = await page.evaluate(
      async ({ fixtures, rules, runtime, exerciseId, viewport }) => {
        const runnerPath = new URL(
          './src/adapters/runtime/typescript/TypeScriptRunnerAdapter.ts',
          location.href,
        ).href;
        const validatorPath = new URL(
          './src/adapters/validation/typescript/TypeScriptValidator.ts',
          location.href,
        ).href;
        const { TypeScriptRunnerAdapter } = (await import(
          /* @vite-ignore */ runnerPath
        )) as typeof RunnerModule;
        const { TypeScriptValidator } = (await import(
          /* @vite-ignore */ validatorPath
        )) as typeof ValidatorModule;
        const runner = new TypeScriptRunnerAdapter();
        const validator = new TypeScriptValidator();
        const frame = document.createElement('iframe');
        document.body.append(frame);
        const rows = [];
        try {
          await runner.prepare(frame);
          for (const [index, fixture] of fixtures.entries()) {
            const files = Object.fromEntries(
              fixture.files.map(({ path, content }) => [path, content]),
            );
            const revision = index + 1;
            const rendered = await runner.render({
              exerciseSessionId: 'annotation-grading',
              executionRevision: revision,
              languageId: 'typescript',
              files,
              assets: [],
              viewport,
              options: { runtime },
            });
            if (rendered.diagnostics.length) {
              rows.push({
                id: fixture.id,
                status: 'code-error',
                checks: [],
                diagnostics: rendered.diagnostics,
                durationMs: 0,
              });
              continue;
            }
            const snapshot = await runner.requestSnapshot({
              exerciseSessionId: 'annotation-grading',
              executionRevision: revision,
              requestId: `grade-${String(revision)}`,
              policy: validator.buildSnapshotPolicy(rules),
            });
            const started = performance.now();
            const result = await validator.validate({
              exerciseId,
              rules,
              runtime,
              files,
              execution: {
                ...rendered,
                runId: `run-${String(revision)}`,
                backend: 'browser',
                engine: 'browser-js',
                status: 'succeeded',
              },
              snapshots: { [viewport.id]: snapshot },
              diagnostics: rendered.diagnostics,
              evidence: rendered.evidence,
              console: rendered.console,
              interactionScenarios: [],
              interactionCheckpoints: {},
              now: '2026-09-29T00:00:00Z',
            });
            rows.push({
              id: fixture.id,
              status: result.status,
              checks: result.checks,
              diagnostics: result.diagnostics,
              durationMs: performance.now() - started,
            });
          }
          return rows;
        } finally {
          await runner.dispose();
          frame.remove();
        }
      },
      {
        fixtures: exercise.fixtures,
        rules: exercise.validationRules,
        runtime: exercise.runtime,
        exerciseId: exercise.id,
        viewport: exercise.previewViewports[0]!,
      },
    );
    await testInfo.attach('annotation-product-validation', {
      body: JSON.stringify(observations, null, 2),
      contentType: 'application/json',
    });
    for (const row of observations) {
      const fixture = exercise.fixtures.find(({ id }) => id === row.id)!;
      expect(row.status, row.id).toBe(fixture.expectedStatus);
      expect(
        row.diagnostics.map(({ code }) => code),
        row.id,
      ).toEqual(fixture.expectedDiagnosticCodes ?? []);
      expect(
        row.checks
          .filter(({ passed }) => !passed)
          .map(({ ruleId }) => ruleId)
          .sort(),
        row.id,
      ).toEqual([...fixture.expectedFeedbackRuleIds].sort());
      if (row.id === 'wrong-value') {
        expect(row.checks.find(({ ruleId }) => ruleId === exercise.id + '-r01')?.passed).toBe(true);
        expect(row.checks.find(({ ruleId }) => ruleId === exercise.id + '-r02')?.passed).toBe(
          false,
        );
      }
    }
  });
}

test('型注釈試作の原文を実Runnerで実行し、型誤りの非実行とConsoleだけでは不足する証拠を確認する', async ({
  page,
}, testInfo) => {
  const harness = new URL('__typescript-annotation-harness', testServerUrl(4174)).href;
  await page.route(harness, (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>型注釈試作</title>' }),
  );
  await page.goto(harness);
  const observations = await page.evaluate(async (fixtures) => {
    const modulePath = new URL(
      './src/adapters/runtime/typescript/TypeScriptRunnerAdapter.ts',
      location.href,
    ).href;
    const { TypeScriptRunnerAdapter } = (await import(
      /* @vite-ignore */ modulePath
    )) as typeof RunnerModule;
    const runner = new TypeScriptRunnerAdapter();
    const frame = document.createElement('iframe');
    document.body.append(frame);
    const rows = [];
    try {
      await runner.prepare(frame);
      for (const [index, fixture] of fixtures.entries()) {
        const result = await runner.render({
          exerciseSessionId: 'annotation-pilot',
          executionRevision: index + 1,
          languageId: 'typescript',
          files: { 'index.html': '<p>型注釈試作</p>', 'main.ts': fixture.source },
          assets: [],
          viewport: { id: 'desktop', width: 800, height: 600 },
          options: {
            runtime: {
              kind: 'typescript',
              entryFile: 'main.ts',
              sourceType: 'module',
              capabilityProfile: 'core',
              primaryOutput: 'console',
            },
          },
        });
        rows.push({ id: fixture.id, console: result.console, diagnostics: result.diagnostics });
      }
      return rows;
    } finally {
      await runner.dispose();
      frame.remove();
    }
  }, annotationFixtures);
  await testInfo.attach('annotation-pilot-observations', {
    body: JSON.stringify(observations, null, 2),
    contentType: 'application/json',
  });
  for (const row of observations) {
    if (row.id === 'starter') {
      expect(row.console).toEqual([]);
      expect(row.diagnostics).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: 'typescript-type-error-2322' })]),
      );
    } else {
      expect(row.diagnostics).toEqual([]);
      expect(row.console.map((record) => record.text)).toEqual([
        row.id === 'wrong-value' ? '3' : '2',
      ]);
    }
  }
  // 文字列「2」や表示固定も同じConsoleになる。これを教材合格とは判定しない。
});

test('実TypeScript Workerで型誤り→修正と中止→再試行を行い、親画面は応答し続ける', async ({
  page,
}) => {
  const harness = new URL('__typescript-worker-harness', testServerUrl(4174)).href;
  // 独立した境界検証ページにはVite HMR clientを載せず、依存初回最適化のreloadを混ぜない。
  await page.route(harness, (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><html lang="ja"><title>型検査境界</title><body>Worker検証</body></html>',
    }),
  );
  await page.goto(harness);
  const evidence = await page.evaluate(async () => {
    const modulePath = new URL(
      './src/adapters/runtime/typescript/TypeScriptCompilerClient.ts',
      location.href,
    ).href;
    const { TypeScriptCompilerClient } = (await import(
      /* @vite-ignore */ modulePath
    )) as typeof CompilerClient;
    const client = new TypeScriptCompilerClient();
    let ticks = 0;
    const timer = setInterval(() => {
      ticks += 1;
    }, 20);
    const input = {
      sessionId: 'typescript-worker-browser',
      revision: 1,
      files: { 'main.ts': 'const count: number = "wrong";' },
    };
    const started = performance.now();
    try {
      const rejected = await client.compile(input);
      const fixed = await client.compile({
        ...input,
        revision: 2,
        files: { 'main.ts': 'const count: number = 2; document.title = String(count);' },
      });
      const pending = client
        .compile(input)
        .catch((error: unknown) => (error instanceof Error ? error.name : 'unknown'));
      client.cancel();
      const cancelled = await pending;
      const retry = await client.compile({
        ...input,
        revision: 3,
        files: { 'main.ts': 'console.log("retry");' },
      });
      return {
        rejected,
        fixed,
        cancelled,
        retry,
        ticks,
        durationMs: performance.now() - started,
        source: input.files['main.ts'],
        title: document.title,
      };
    } finally {
      clearInterval(timer);
      client.dispose();
    }
  });
  expect(evidence.rejected.status).toBe('type-error');
  expect(evidence.rejected).not.toHaveProperty('files');
  expect(evidence.fixed.status).toBe('ready');
  expect(evidence.cancelled).toBe('AbortError');
  expect(evidence.retry.status).toBe('ready');
  expect(evidence.ticks).toBeGreaterThan(0);
  expect(evidence.source).toContain('"wrong"');
  expect(evidence.title).not.toBe('2');
  test.info().annotations.push({
    type: 'compiler-worker-duration-ms',
    description: String(Math.round(evidence.durationMs)),
  });
});

test('実型検査と隔離実行から動作採点し、型だけ編集した古い結果と生成JS証拠の不一致を拒否する', async ({
  page,
}) => {
  const harness = new URL('__typescript-validation-harness', testServerUrl(4174)).href;
  await page.route(harness, (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>TS採点境界</title>' }),
  );
  await page.goto(harness);
  const result = await page.evaluate(async () => {
    const runnerPath = new URL(
      './src/adapters/runtime/typescript/TypeScriptRunnerAdapter.ts',
      location.href,
    ).href;
    const validatorPath = new URL(
      './src/adapters/validation/typescript/TypeScriptValidator.ts',
      location.href,
    ).href;
    const { TypeScriptRunnerAdapter } = (await import(
      /* @vite-ignore */ runnerPath
    )) as typeof RunnerModule;
    const { TypeScriptValidator } = (await import(
      /* @vite-ignore */ validatorPath
    )) as typeof ValidatorModule;
    const runner = new TypeScriptRunnerAdapter();
    const validator = new TypeScriptValidator();
    const frame = document.createElement('iframe');
    document.body.append(frame);
    const runtime = {
      kind: 'typescript',
      entryFile: 'main.ts',
      sourceType: 'module',
      capabilityProfile: 'dom',
      primaryOutput: 'preview',
    } as const;
    const input: RunnerInput = {
      exerciseSessionId: 'ts-grade',
      executionRevision: 1,
      languageId: 'typescript',
      files: {
        'index.html': '<p id="score">0</p>',
        'main.ts':
          'const value: number = 2; const node = document.querySelector("#score"); if (node !== null) { node.textContent = String(value); }',
      },
      assets: [],
      viewport: { id: 'desktop', width: 800, height: 600 },
      options: { runtime },
    };
    const rules: ValidationContext['rules'] = [
      {
        id: 'score',
        label: '点数を表示する',
        required: true,
        group: 'all',
        viewportMode: 'all',
        viewportIds: ['desktop'],
        target: { kind: 'selector', selector: '#score' },
        assertion: { kind: 'text', operator: 'equals', expected: '2' },
        feedback: { target: '点数', expected: '2', nextAction: '計算を確認してください' },
        hintId: 'hint-1',
        relatedSlideId: 'slide-1',
      },
    ];
    try {
      await runner.prepare(frame);
      const rendered = await runner.render(input);
      const snapshot = await runner.requestSnapshot({
        exerciseSessionId: input.exerciseSessionId,
        executionRevision: input.executionRevision,
        requestId: 'grade',
        policy: validator.buildSnapshotPolicy(rules),
      });
      const context: ValidationContext = {
        exerciseId: 'ts-exercise',
        rules,
        runtime,
        files: input.files,
        execution: {
          ...rendered,
          runId: 'run-1',
          backend: 'browser',
          engine: 'browser-js',
          status: 'succeeded',
        },
        snapshots: { desktop: snapshot },
        diagnostics: rendered.diagnostics,
        evidence: rendered.evidence,
        console: rendered.console,
        interactionScenarios: [],
        interactionCheckpoints: {},
        now: '2026-09-29T00:00:00.000Z',
      };
      const passed = await validator.validate(context);
      const incomplete = await validator.validate({
        ...context,
        rules: [{ ...rules[0]!, assertion: { kind: 'text', operator: 'equals', expected: '3' } }],
      });
      const stale = await validator.validate({
        ...context,
        files: { ...input.files, 'main.ts': input.files['main.ts']!.replace(': number', ': 2') },
      });
      const mismatched = await validator.validate({
        ...context,
        evidence: rendered.evidence.map((item) =>
          item.id === 'javascript.module-graph-sha256' ? { ...item, value: '0'.repeat(64) } : item,
        ),
      });
      return { passed, incomplete, stale, mismatched };
    } finally {
      await runner.dispose();
      frame.remove();
    }
  });
  expect(result.passed.status).toBe('pass');
  expect(result.incomplete.status).toBe('incomplete');
  expect(result.stale).toMatchObject({ status: 'system-error', checks: [] });
  expect(result.mismatched).toMatchObject({ status: 'system-error', checks: [] });
});

test('型検査Workerから既存Analyzer Workerへ接続し、通信拒否と中止後の再試行を確認する', async ({
  page,
}) => {
  const harness = new URL('__typescript-preparation-harness', testServerUrl(4174)).href;
  await page.route(harness, (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>準備境界</title>' }),
  );
  await page.goto(harness);
  const evidence = await page.evaluate(async () => {
    const modulePath = new URL(
      './src/adapters/runtime/typescript/TypeScriptPreparationClient.ts',
      location.href,
    ).href;
    const { TypeScriptPreparationClient } = (await import(
      /* @vite-ignore */ modulePath
    )) as typeof PreparationClient;
    const client = new TypeScriptPreparationClient();
    const input = {
      sessionId: 'actual-preparation',
      revision: 1,
      entryFile: 'main.ts',
      files: {
        'main.ts': 'import { twice } from "./score.js"; console.log(twice(3));',
        'score.ts': 'export function twice(value: number): number { return value * 2; }',
      },
      capabilityProfile: 'modules' as const,
      guardIdentifier: '__guard',
    };
    try {
      const valid = await client.prepare(input);
      const blocked = await client.prepare({
        ...input,
        revision: 2,
        entryFile: 'src/main.ts',
        files: {
          'src/main.ts':
            'interface Item { label: string; }\n\ntype Title = string;\nfetch("https://example.invalid");',
        },
      });
      const pending = client
        .prepare(input)
        .catch((error: unknown) => (error instanceof Error ? error.name : 'unknown'));
      client.cancel();
      const cancelled = await pending;
      const retry = await client.prepare({ ...input, revision: 3 });
      return { valid, blocked, cancelled, retry };
    } finally {
      client.dispose();
    }
  });
  expect(evidence.valid).toMatchObject({
    stage: 'analysis',
    result: { status: 'success', entryFile: 'main.js' },
  });
  expect(evidence.blocked).toMatchObject({
    stage: 'analysis',
    result: {
      status: 'failure',
      diagnostics: expect.arrayContaining([expect.objectContaining({ kind: 'security' })]),
    },
  });
  expect(evidence.blocked).toMatchObject({
    sourceDiagnostics: expect.arrayContaining([
      expect.objectContaining({ file: 'src/main.ts', line: 4, column: 1 }),
    ]),
  });
  expect(evidence.cancelled).toBe('AbortError');
  expect(evidence.retry).toMatchObject({
    stage: 'analysis',
    result: { status: 'success', executionRevision: 3 },
  });
});

test('型付きDOM操作を既存隔離Runnerで実行し、通信拒否・型エラー・停止から復帰する', async ({
  page,
}) => {
  const harness = new URL('__typescript-runner-harness', testServerUrl(4174)).href;
  await page.route(harness, (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>TS実行境界</title>' }),
  );
  await page.goto(harness);
  const evidence = await page.evaluate(async () => {
    const modulePath = new URL(
      './src/adapters/runtime/typescript/TypeScriptRunnerAdapter.ts',
      location.href,
    ).href;
    const { TypeScriptRunnerAdapter } = (await import(
      /* @vite-ignore */ modulePath
    )) as typeof RunnerModule;
    const runner = new TypeScriptRunnerAdapter();
    const frame = document.createElement('iframe');
    document.body.append(frame);
    const source =
      'interface Score { value: number; }\nconst score: Score = { value: 2 };\nconst node = document.querySelector("#score");\nif (node !== null) { node.textContent = String(score.value); }';
    const input = {
      exerciseSessionId: 'ts-live',
      executionRevision: 1,
      languageId: 'typescript',
      files: { 'index.html': '<p id="score">初期</p>', 'main.ts': source },
      assets: [],
      viewport: { id: 'desktop', width: 800, height: 600 },
      options: {
        runtime: {
          kind: 'typescript',
          entryFile: 'main.ts',
          sourceType: 'module',
          capabilityProfile: 'dom',
          primaryOutput: 'preview',
        },
      },
    };
    try {
      await runner.prepare(frame);
      const result = await runner.render(input);
      const snapshot = await runner.requestSnapshot({
        exerciseSessionId: 'ts-live',
        executionRevision: 1,
        requestId: 'first',
        policy: {
          selectors: ['#score'],
          attributes: [],
          computedStyles: [],
          focusVisibleSelectors: [],
          focusVisibleComputedStyles: [],
          includeAllElements: false,
        },
      });
      const sandbox = frame.getAttribute('sandbox');
      const blocked = await runner.render({
        ...input,
        executionRevision: 2,
        files: {
          ...input.files,
          'main.ts': 'interface X { value: number; }\nfetch("https://example.invalid");',
        },
      });
      const typeError = await runner.render({
        ...input,
        executionRevision: 3,
        files: { ...input.files, 'main.ts': 'const value: number = "wrong";' },
      });
      const emptyAfterError = frame.srcdoc;
      await runner.stop();
      await runner.prepare(frame);
      const retry = await runner.render({ ...input, executionRevision: 4 });
      return {
        result,
        snapshot,
        sandbox,
        blocked,
        typeError,
        emptyAfterError,
        retry,
        source: input.files['main.ts'],
      };
    } finally {
      await runner.dispose();
      frame.remove();
    }
  });
  expect(evidence.result.diagnostics).toEqual([]);
  expect(evidence.result.evidence).toContainEqual(
    expect.objectContaining({ id: 'javascript.executed', value: true }),
  );
  expect(evidence.snapshot.nodes).toContainEqual(
    expect.objectContaining({ text: '2', matchedSelectors: ['#score'] }),
  );
  expect(evidence.sandbox).toBe('allow-scripts');
  expect(evidence.blocked.diagnostics).toContainEqual(
    expect.objectContaining({ kind: 'security', file: 'main.ts', line: 2 }),
  );
  expect(evidence.typeError.evidence).toEqual([]);
  expect(evidence.typeError.diagnostics).toContainEqual(
    expect.objectContaining({ code: 'typescript-type-error-2322' }),
  );
  expect(evidence.emptyAfterError).toBe('');
  expect(evidence.retry.diagnostics).toEqual([]);
  expect(evidence.source).toContain('interface Score');
});
