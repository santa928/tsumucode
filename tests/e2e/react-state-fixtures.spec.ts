import type * as CompilerModule from '../../src/adapters/runtime/react/ReactCompilerClient';
import { writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { loadAuthoringCourse } from '../../scripts/content/compileCourse';
import { testServerUrl } from './helpers/testBasePath';
import type * as RunnerModule from '../../src/adapters/runtime/react/ReactRunnerAdapter';
import type * as InteractionModule from '../../src/features/learning/session/runInteractionScenario';
import type { RunnerDiagnostic } from '../../src/core/runtime/contracts';
import type * as ValidatorModule from '../../src/adapters/validation/react/ReactValidator';

for (const lesson of ['react-ch01-l04', 'react-ch01-l05']) {
  test(`${lesson}の操作Fixtureを実Compiler・React click・State・KeyのANDで判定する`, async ({
    page,
  }, info) => {
    test.setTimeout(180_000);
    const exercise = (await loadAuthoringCourse('content/react')).exercises.find(
      ({ id }) => id === `${lesson}-e01`,
    )!;
    const harness = new URL('./react-state-fixtures.html', testServerUrl(4174)).href;
    await page.route(harness, (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><title>Component隔離検証</title>',
      }),
    );
    await page.goto(harness);
    const observations = await page.evaluate(
      async ({ exercise }) => {
        const runnerPath = new URL(
          './src/adapters/runtime/react/ReactRunnerAdapter.ts',
          location.href,
        ).href;
        const validatorPath = new URL(
          './src/adapters/validation/react/ReactValidator.ts',
          location.href,
        ).href;
        const { ReactRunnerAdapter } = (await import(
          /* @vite-ignore */ runnerPath
        )) as typeof RunnerModule;
        const { ReactValidator } = (await import(
          /* @vite-ignore */ validatorPath
        )) as typeof ValidatorModule;
        const interactionPath = new URL(
          './src/features/learning/session/runInteractionScenario.ts',
          location.href,
        ).href;
        const { runInteractionScenario, extendSnapshotPolicyForInteractions } = (await import(
          /* @vite-ignore */ interactionPath
        )) as typeof InteractionModule;
        const runner = new ReactRunnerAdapter();
        const validator = new ReactValidator();
        const frame = document.createElement('iframe');
        document.body.append(frame);
        const viewport = exercise.previewViewports[0]!;
        if (exercise.runtime?.kind !== 'react') throw new Error('React Runtimeが必要です');
        const rows = [];
        try {
          await runner.prepare(frame);
          for (const [index, fixture] of exercise.fixtures.entries()) {
            const files = Object.fromEntries(
              fixture.files.map(({ path, content }) => [path, content]),
            );
            const executionRevision = index + 1;
            const rendered = await runner.render({
              exerciseSessionId: exercise.id,
              executionRevision,
              languageId: 'react',
              files,
              assets: [],
              viewport,
              options: { runtime: exercise.runtime },
            });
            if (rendered.diagnostics.length) {
              rows.push({
                id: fixture.id,
                status: 'code-error',
                diagnostics: rendered.diagnostics.map(({ code }) => code),
                failedRules: [],
              });
              continue;
            }
            const snapshot = await runner.requestSnapshot({
              exerciseSessionId: exercise.id,
              executionRevision,
              requestId: fixture.id,
              policy: extendSnapshotPolicyForInteractions(
                validator.buildSnapshotPolicy(exercise.validationRules),
                [exercise],
              ),
            });
            const checkpoints = [];
            let lateDiagnostics: readonly RunnerDiagnostic[] = [];
            const input = {
              exerciseSessionId: exercise.id,
              executionRevision,
              languageId: 'react',
              files,
              assets: [],
              viewport,
              options: { runtime: exercise.runtime },
            };
            for (const scenario of exercise.interactionScenarios ?? []) {
              try {
                checkpoints.push(
                  ...(await runInteractionScenario({
                    exerciseSessionId: exercise.id,
                    executionRevision,
                    viewport,
                    policy: extendSnapshotPolicyForInteractions(
                      validator.buildSnapshotPolicy(exercise.validationRules),
                      [exercise],
                    ),
                    scenario,
                    render: () => runner.render(input),
                    interact: (request) => runner.interact(request),
                    requestSnapshot: (request) => runner.requestSnapshot(request),
                    assertFresh: () => undefined,
                    nextRequestId: () => crypto.randomUUID(),
                    assertGradable: (interaction) => {
                      lateDiagnostics = interaction.diagnostics ?? [];
                      if (lateDiagnostics.some(({ severity }) => severity === 'error'))
                        throw new Error('操作後の診断');
                    },
                  })),
                );
              } catch (error) {
                if (!lateDiagnostics.length) throw error;
                break;
              }
            }
            if (lateDiagnostics.length) {
              rows.push({
                id: fixture.id,
                status: 'code-error',
                diagnostics: [...new Set(lateDiagnostics.map(({ code }) => code))],
                failedRules: [],
              });
              // 同じRunnerで次の正例を実行できることも確認する。
              const recovered = await runner.render({
                ...input,
                executionRevision: executionRevision + 1000,
                files: Object.fromEntries(
                  exercise.solutionFiles.map(({ path, content }) => [path, content]),
                ),
              });
              rows.push({
                id: 'after-event-error',
                status: recovered.diagnostics.length ? 'failed' : 'recovered',
                diagnostics: recovered.diagnostics.map(({ code }) => code),
                failedRules: [],
              });
              continue;
            }
            const context = {
              exerciseId: exercise.id,
              runtime: exercise.runtime,
              files,
              rules: exercise.validationRules,
              snapshots: { [viewport.id]: snapshot },
              diagnostics: rendered.diagnostics,
              evidence: rendered.evidence,
              console: rendered.console,
              interactionScenarios: exercise.interactionScenarios ?? [],
              interactionCheckpoints: { [viewport.id]: checkpoints },
              now: '2026-10-07T00:00:00Z',
              execution: {
                ...rendered,
                runId: fixture.id,
                backend: 'browser' as const,
                engine: 'browser-js' as const,
                status: 'succeeded' as const,
              },
            };
            const result = await validator.validate(context);
            rows.push({
              id: fixture.id,
              status: result.status,
              diagnostics: result.diagnostics.map(({ code }) => code),
              failedRules: result.checks
                .filter(({ passed }) => !passed)
                .map(({ ruleId }) => ruleId)
                .sort(),
            });
            if (fixture.id === 'solution') {
              const stale = await validator.validate({
                ...context,
                files: {
                  ...files,
                  'components.tsx': files['components.tsx']! + '\n// 別のSource\n',
                },
              });
              rows.push({
                id: 'stale-source',
                status: stale.status,
                diagnostics: stale.diagnostics.map(({ code }) => code),
                failedRules: [],
              });
              const forged = await runner.render({
                exerciseSessionId: exercise.id,
                executionRevision,
                languageId: 'react',
                files: {
                  ...files,
                  'types.ts': files['types.ts']! + '\nexport type Extra = string;\n',
                },
                assets: [],
                viewport,
                options: { runtime: exercise.runtime },
              });
              rows.push({
                id: 'forged-types',
                status: forged.evidence.length ? 'unexpected-success' : 'rejected',
                diagnostics: forged.diagnostics.map(({ code }) => code),
                failedRules: [],
              });
            }
          }
          return rows;
        } finally {
          await runner.dispose();
          frame.remove();
        }
      },
      { exercise },
    );
    await writeFile(
      info.outputPath('state-observations.json'),
      JSON.stringify(observations, null, 2),
    );
    await info.attach('state-fixtures', {
      body: JSON.stringify(observations, null, 2),
      contentType: 'application/json',
    });
    for (const fixture of exercise.fixtures) {
      const row = observations.find(({ id }) => id === fixture.id)!;
      expect(row.status, fixture.id).toBe(fixture.expectedStatus);
      expect(row.diagnostics, fixture.id).toEqual(fixture.expectedDiagnosticCodes ?? []);
      expect(row.failedRules, fixture.id).toEqual([...fixture.expectedFeedbackRuleIds].sort());
    }
    expect(observations.find(({ id }) => id === 'stale-source')).toMatchObject({
      status: 'system-error',
      diagnostics: ['react-source-mismatch'],
    });
    expect(observations.find(({ id }) => id === 'forged-types')?.status).toBe('rejected');
    if (lesson.endsWith('04'))
      expect(observations.find(({ id }) => id === 'after-event-error')?.status).toBe('recovered');
  });
}

test('lockDownされた実Reactで更新描画の元例外を診断し、新runで回復する', async ({ page }) => {
  test.setTimeout(60_000);
  const exercise = (await loadAuthoringCourse('content/react')).exercises.find(
    ({ id }) => id === 'react-ch01-l04-e01',
  )!;
  const harness = new URL('./react-state-errors.html', testServerUrl(4174)).href;
  await page.route(harness, (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><title>React更新例外の隔離検証</title>',
    }),
  );
  await page.goto(harness);
  const proof = await page.evaluate(
    async ({ exercise }) => {
      const runnerPath = new URL(
        './src/adapters/runtime/react/ReactRunnerAdapter.ts',
        location.href,
      ).href;
      const compilerPath = new URL(
        './src/adapters/runtime/react/ReactCompilerClient.ts',
        location.href,
      ).href;
      const { ReactRunnerAdapter } = (await import(
        /* @vite-ignore */ runnerPath
      )) as typeof RunnerModule;
      const { createReactCompilerClient } = (await import(
        /* @vite-ignore */ compilerPath
      )) as typeof CompilerModule;
      let inject = true;
      // 有限learner文法では到達しない更新描画例外を、実compile後のテストportへ注入する。
      // State/React/Analyzer/opaque iframe/Bridgeは製品の実体を使い、DOMや診断を模擬しない。
      const runner = new ReactRunnerAdapter({
        compilerFactory: () => {
          const compiler = createReactCompilerClient();
          return {
            dispose: () => {
              compiler.dispose();
            },
            compile: async (input) => {
              const result = await compiler.compile(input);
              if (result.status !== 'ready' || !inject) return result;
              return {
                ...result,
                files: {
                  ...result.files,
                  'components.js': `
import { jsx } from 'react/jsx-runtime';
import { useState } from 'react';
export function App() {
  const [value, setValue] = useState(0);
  if (value > 0) throw new Error('更新描画の元例外');
  return jsx('button', { id: 'increment', onClick: () => setValue(1), children: '更新' });
}
`,
                },
              };
            },
          };
        },
      });
      const frame = document.createElement('iframe');
      document.body.append(frame);
      const input = {
        exerciseSessionId: exercise.id,
        executionRevision: 1,
        languageId: 'react',
        files: Object.fromEntries(
          exercise.solutionFiles.map(({ path, content }) => [path, content]),
        ),
        assets: [],
        viewport: exercise.previewViewports[0]!,
        options: { runtime: exercise.runtime },
      };
      try {
        await runner.prepare(frame);
        const initial = await runner.render(input);
        if (initial.diagnostics.length) throw new Error(JSON.stringify(initial.diagnostics));
        await runner.interact({
          exerciseSessionId: exercise.id,
          executionRevision: 1,
          frameGeneration: initial.frameGeneration!,
          requestId: 'update',
          action: { id: 'update', kind: 'click', selector: '#increment' },
        });
        let diagnostics: readonly RunnerDiagnostic[] = [];
        for (let attempt = 0; attempt < 30; attempt++) {
          const snapshot = await runner.requestSnapshot({
            exerciseSessionId: exercise.id,
            executionRevision: 1,
            requestId: `error-${String(attempt)}`,
            policy: {
              selectors: ['#root'],
              attributes: [],
              computedStyles: [],
              focusVisibleSelectors: [],
              focusVisibleComputedStyles: [],
              includeAllElements: false,
            },
            preserveTimers: true,
          });
          diagnostics = snapshot.runtimeObservation?.diagnostics ?? [];
          if (diagnostics.length) break;
          await new Promise((resolve) => setTimeout(resolve, 25));
        }
        inject = false;
        const recovered = await runner.render({ ...input, executionRevision: 2 });
        await runner.stop();
        let stopped = false;
        try {
          await runner.interact({
            exerciseSessionId: exercise.id,
            executionRevision: 2,
            frameGeneration: recovered.frameGeneration!,
            requestId: 'stopped',
            action: { id: 'stopped', kind: 'click', selector: '#increment' },
          });
        } catch (error) {
          stopped = error instanceof DOMException && error.name === 'AbortError';
        }
        return {
          diagnostics: diagnostics.map(({ code, message }) => ({ code, message })),
          recovery: recovered.diagnostics,
          stopped,
        };
      } finally {
        await runner.dispose();
        frame.remove();
      }
    },
    { exercise },
  );
  expect(proof.diagnostics).toContainEqual({
    code: 'javascript-runtime',
    message: 'Error: 更新描画の元例外',
  });
  expect(proof.recovery).toEqual([]);
  expect(proof.stopped).toBe(true);
});
