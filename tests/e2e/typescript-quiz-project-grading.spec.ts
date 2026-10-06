import { expect, test } from '@playwright/test';
import type * as RunnerModule from '../../src/adapters/runtime/typescript/TypeScriptRunnerAdapter';
import type * as ValidatorModule from '../../src/adapters/validation/typescript/TypeScriptValidator';
import type * as InteractionModule from '../../src/features/learning/session/runInteractionScenario';
import type { InteractionResult, RunnerDiagnostic } from '../../src/core/runtime/contracts';
import { testServerUrl } from './helpers/testBasePath';
import { writeFile } from 'node:fs/promises';
import { loadAuthoringCourse } from '../../scripts/content/compileCourse';

for (const learningMode of ['data', 'state', 'boundary'] as const) {
  const contract = '元TSの型と値の接続と実DOM操作をANDで判定する';
  test(`${learningMode}の製品採点は${contract}`, async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    const draft = {
      authoringExercises: (await loadAuthoringCourse('content/typescript')).exercises.filter(
        ({ id }) =>
          id ===
          `typescript-ch06-l${learningMode === 'data' ? '01' : learningMode === 'state' ? '02' : '03'}-e01`,
      ),
    };
    const exercise = draft.authoringExercises[0]!;
    if (exercise.runtime?.kind !== 'typescript') throw new Error('TypeScript runtimeが必要です');
    const harness = new URL('__typescript-annotation-grading', testServerUrl(4174)).href;
    await page.route(harness, (route) =>
      route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>型注釈採点</title>' }),
    );
    await page.goto(harness);
    const observations = await page.evaluate(
      async ({ fixtures, rules, runtime, exerciseId, viewport, scenarios }) => {
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
        const interactionPath = new URL(
          './src/features/learning/session/runInteractionScenario.ts',
          location.href,
        ).href;
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
        fixtures: exercise.fixtures,
        rules: exercise.validationRules,
        runtime: exercise.runtime,
        exerciseId: exercise.id,
        viewport: exercise.previewViewports[0]!,
        scenarios: exercise.interactionScenarios ?? [],
      },
    );
    await writeFile(
      testInfo.outputPath('quiz-project-validation.json'),
      JSON.stringify(observations, null, 2),
    );
    await testInfo.attach('quiz-project-validation', {
      body: JSON.stringify(observations, null, 2),
      contentType: 'application/json',
    });
    for (const row of observations) {
      const fixture = exercise.fixtures.find(({ id }) => id === row.id)!;
      expect(row.status, JSON.stringify(row)).toBe(fixture.expectedStatus);
      if (learningMode === 'data' && row.id === 'starter') expect(row.diagnostics).toHaveLength(4);
      expect([...new Set(row.diagnostics.map(({ code }) => code))], row.id).toEqual(
        fixture.expectedDiagnosticCodes ?? [],
      );
      expect(
        row.checks
          .filter(({ passed }) => !passed)
          .map(({ ruleId }) => ruleId)
          .sort(),
        row.id,
      ).toEqual([...fixture.expectedFeedbackRuleIds].sort());
      if (row.id === 'wrong-text' || row.id === 'wrong-logic-choice') {
        expect(row.checks.find(({ ruleId }) => ruleId === exercise.id + '-r01')?.passed).toBe(true);
        expect(
          row.checks.some(({ ruleId, passed }) => ruleId.startsWith('interaction:') && !passed),
        ).toBe(true);
      }
    }
  });
}
