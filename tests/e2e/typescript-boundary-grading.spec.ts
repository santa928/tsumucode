import { expect, test } from '@playwright/test';
import { build } from 'esbuild';
import { loadRuntimeModulePath } from './helpers/javascriptRunnerModule';
import type * as RunnerModule from '../../src/adapters/runtime/typescript/TypeScriptRunnerAdapter';
import type * as ValidatorModule from '../../src/adapters/validation/typescript/TypeScriptValidator';
import type * as InteractionModule from '../../src/features/learning/session/runInteractionScenario';
import type { InteractionResult, RunnerDiagnostic } from '../../src/core/runtime/contracts';
import { testServerUrl } from './helpers/testBasePath';
import { writeFile } from 'node:fs/promises';
import { loadAuthoringCourse } from '../../scripts/content/compileCourse';

const course = await loadAuthoringCourse('content/typescript');
// 候補のRunner/Validatorと同じoriginで、同じSourceの実操作helperだけを実行する。
const interactionBundle = await build({
  entryPoints: ['src/features/learning/session/runInteractionScenario.ts'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'browser',
  target: 'es2023',
});
if (interactionBundle.outputFiles.length !== 1)
  throw new Error('実操作helperは単一moduleが必要です');
const interactionScript = interactionBundle.outputFiles[0]!.text;

for (const learningMode of ['dom', 'unknown', 'async'] as const) {
  const lesson = learningMode === 'dom' ? '01' : learningMode === 'unknown' ? '02' : '03';
  const exercise = course.exercises.find(({ id }) => id === `typescript-ch05-l${lesson}-e01`)!;
  // Browser内helperとraw診断の全入力保証を、manifestの集合oracleへ置き換えない。
  // 同じ入力のmanifest内共有とは別に、各fixtureの採点を独立して確認する。
  for (const fixture of exercise.fixtures) {
    const contract = '元TSの境界確認と実DOM操作をANDで判定する';
    test(`${learningMode}/${fixture.id}の製品採点は${contract}`, async ({ page }, testInfo) => {
      test.setTimeout(60_000);
      if (exercise.runtime?.kind !== 'typescript') throw new Error('TypeScript runtimeが必要です');
      const harness = new URL('__typescript-annotation-grading', testServerUrl(4173)).href;
      await page.route(harness, (route) =>
        route.fulfill({
          contentType: 'text/html',
          body: '<!doctype html><title>型注釈採点</title>',
        }),
      );
      const interactionPath = new URL('__typescript-boundary-interaction.js', testServerUrl(4173))
        .href;
      await page.route(interactionPath, (route) =>
        route.fulfill({ contentType: 'text/javascript', body: interactionScript }),
      );
      const [runnerPath, validatorPath] = await Promise.all([
        loadRuntimeModulePath('src/adapters/runtime/typescript/TypeScriptRunnerAdapter.ts'),
        loadRuntimeModulePath('src/adapters/validation/typescript/TypeScriptValidator.ts'),
      ]);
      await page.goto(harness);
      const observations = await page.evaluate(
        async ({
          fixtures,
          rules,
          runtime,
          exerciseId,
          viewport,
          scenarios,
          runnerPath,
          validatorPath,
          interactionPath,
        }) => {
          const { TypeScriptRunnerAdapter } = (await import(
            /* @vite-ignore */ runnerPath
          )) as typeof RunnerModule;
          const { TypeScriptValidator } = (await import(
            /* @vite-ignore */ validatorPath
          )) as typeof ValidatorModule;
          const { runInteractionScenario, extendSnapshotPolicyForInteractions } = (await import(
            /* @vite-ignore */ interactionPath
          )) as typeof InteractionModule;
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
              const runnerInput = {
                exerciseSessionId: 'annotation-grading',
                executionRevision: revision,
                languageId: 'typescript' as const,
                files,
                assets: [],
                viewport,
                options: { runtime },
              };
              const rendered = await runner.render(runnerInput);
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
              const policy = extendSnapshotPolicyForInteractions(
                validator.buildSnapshotPolicy(rules),
                [{ interactionScenarios: scenarios }],
              );
              const checkpoints = [];
              let lateDiagnostics: readonly RunnerDiagnostic[] = [];
              const assertGradable = (observed: InteractionResult): void => {
                if ((observed.diagnostics ?? []).some(({ severity }) => severity === 'error')) {
                  lateDiagnostics = observed.diagnostics ?? [];
                  throw new Error('実操作後の診断');
                }
              };
              for (const scenario of scenarios) {
                try {
                  checkpoints.push(
                    ...(await runInteractionScenario({
                      exerciseSessionId: runnerInput.exerciseSessionId,
                      executionRevision: revision,
                      viewport,
                      policy,
                      scenario,
                      render: async () => {
                        const rerendered = await runner.render(runnerInput);
                        lateDiagnostics = rerendered.diagnostics;
                        return rerendered;
                      },
                      interact: (request) => runner.interact(request),
                      requestSnapshot: (request) => runner.requestSnapshot(request),
                      assertFresh: () => undefined,
                      nextRequestId: () => crypto.randomUUID(),
                      assertGradable,
                    })),
                  );
                } catch (error) {
                  if (lateDiagnostics.length === 0) throw error;
                  break;
                }
              }
              if (lateDiagnostics.length > 0) {
                rows.push({
                  id: fixture.id,
                  status: 'code-error',
                  checks: [],
                  diagnostics: lateDiagnostics,
                  durationMs: 0,
                });
                continue;
              }
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
                interactionScenarios: scenarios,
                interactionCheckpoints: { [viewport.id]: checkpoints },
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
          runnerPath,
          validatorPath,
          interactionPath,
          fixtures: [fixture],
          rules: exercise.validationRules,
          runtime: exercise.runtime,
          exerciseId: exercise.id,
          viewport: exercise.previewViewports[0]!,
          scenarios: exercise.interactionScenarios ?? [],
        },
      );
      await writeFile(
        testInfo.outputPath('boundary-product-validation.json'),
        JSON.stringify(observations, null, 2),
      );
      await testInfo.attach('boundary-product-validation', {
        body: JSON.stringify(observations, null, 2),
        contentType: 'application/json',
      });
      for (const row of observations) {
        const fixture = exercise.fixtures.find(({ id }) => id === row.id)!;
        expect(row.status, JSON.stringify(row)).toBe(fixture.expectedStatus);
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
        if (row.id === 'wrong-result') {
          expect(row.checks.find(({ ruleId }) => ruleId === exercise.id + '-r01')?.passed).toBe(
            true,
          );
          expect(
            row.checks.some(({ ruleId, passed }) => ruleId.startsWith('interaction:') && !passed),
          ).toBe(true);
        }
      }
    });
  }
}

/** 実Promiseが未完了のclickを停止し、同じTSでfresh frameへ戻る。 */
test('非同期clickの停止は旧checkpointを失効し、元TSを保持して再試行できる', async ({ page }) => {
  const exercise = course.exercises.find(({ id }) => id === 'typescript-ch05-l03-e01')!;
  const fixture = exercise.fixtures.find(({ id }) => id === 'delayed')!;
  const harness = new URL('__typescript-boundary-stop', testServerUrl(4173)).href;
  await page.route(harness, (route) =>
    route.fulfill({ contentType: 'text/html', body: '<title>停止と再試行</title>' }),
  );
  const interactionPath = new URL('__typescript-boundary-stop-interaction.js', testServerUrl(4173))
    .href;
  await page.route(interactionPath, (route) =>
    route.fulfill({ contentType: 'text/javascript', body: interactionScript }),
  );
  const runnerPath = await loadRuntimeModulePath(
    'src/adapters/runtime/typescript/TypeScriptRunnerAdapter.ts',
  );
  await page.goto(harness);
  const observed = await page.evaluate(
    async ({ exercise, fixture, runnerPath, interactionPath }) => {
      const { TypeScriptRunnerAdapter } = (await import(
        /* @vite-ignore */ runnerPath
      )) as typeof RunnerModule;
      const { runInteractionScenario, extendSnapshotPolicyForInteractions } = (await import(
        /* @vite-ignore */ interactionPath
      )) as typeof InteractionModule;
      const runner = new TypeScriptRunnerAdapter();
      const frame = document.createElement('iframe');
      document.body.append(frame);
      const files = Object.fromEntries(fixture.files.map(({ path, content }) => [path, content]));
      files['main.ts'] = files['main.ts']!.replace('resolve, 100', 'resolve, 500');
      const original = JSON.stringify(files);
      const viewport = exercise.previewViewports[0]!;
      const input = {
        exerciseSessionId: 'boundary-stop',
        executionRevision: 1,
        languageId: 'typescript',
        files,
        assets: [],
        viewport,
        options: { runtime: exercise.runtime },
      };
      const policy = extendSnapshotPolicyForInteractions(
        {
          selectors: [],
          attributes: [],
          computedStyles: [],
          focusVisibleSelectors: [],
          focusVisibleComputedStyles: [],
          includeAllElements: false,
        },
        [exercise],
      );
      let revision = 1;
      let started!: () => void;
      const clicked = new Promise<void>((resolve) => {
        started = resolve;
      });
      const scenario = exercise.interactionScenarios![0]!;
      const run = (expectedRevision: number) =>
        runInteractionScenario({
          exerciseSessionId: input.exerciseSessionId,
          executionRevision: expectedRevision,
          viewport,
          policy,
          scenario,
          render: () => runner.render({ ...input, executionRevision: expectedRevision }),
          interact: async (request) => {
            const result = await runner.interact(request);
            started();
            return result;
          },
          requestSnapshot: (request) => runner.requestSnapshot(request),
          assertFresh: () => {
            if (revision !== expectedRevision) throw new DOMException('旧世代', 'AbortError');
          },
          nextRequestId: () => crypto.randomUUID(),
          assertGradable: (result) => {
            if ((result.diagnostics ?? []).some(({ severity }) => severity === 'error'))
              throw new Error('実操作の診断');
          },
        });
      try {
        await runner.prepare(frame);
        const pending = run(1).catch((error: unknown) =>
          error instanceof Error ? error.name : String(error),
        );
        await clicked;
        revision = 2;
        await runner.stop();
        const cancelled = await pending;
        const emptyAfterStop = frame.srcdoc;
        await runner.prepare(frame);
        const retried = await run(2);
        return {
          cancelled,
          emptyAfterStop,
          retried,
          unchanged: JSON.stringify(files) === original,
        };
      } finally {
        await runner.dispose();
        frame.remove();
      }
    },
    { exercise, fixture, runnerPath, interactionPath },
  );
  expect(observed.cancelled).toBe('AbortError');
  expect(observed.emptyAfterStop).toBe('');
  expect(observed.unchanged).toBe(true);
  expect(observed.retried).toHaveLength(4);
  for (const checkpoint of observed.retried)
    expect(checkpoint.expectations.every(({ passed }) => passed)).toBe(true);
});
