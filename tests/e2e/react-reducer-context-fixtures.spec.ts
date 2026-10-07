import { writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { loadAuthoringCourse } from '../../scripts/content/compileCourse';
import { testServerUrl } from './helpers/testBasePath';
import type * as RunnerModule from '../../src/adapters/runtime/react/ReactRunnerAdapter';
import type * as InteractionModule from '../../src/features/learning/session/runInteractionScenario';
import type { RunnerDiagnostic } from '../../src/core/runtime/contracts';
import type * as ValidatorModule from '../../src/adapters/validation/react/ReactValidator';

for (const lesson of ['react-ch01-l08', 'react-ch01-l09']) {
  test(`${lesson}の操作Fixtureを実Compiler・Reducer/Contextの値の由来・実DOMのANDで判定する`, async ({
    page,
  }, info) => {
    test.setTimeout(180_000);
    const editableFile = lesson.endsWith('08') ? 'reducer.ts' : 'components.tsx';
    const exercise = (await loadAuthoringCourse('content/react')).exercises.find(
      ({ id }) => id === `${lesson}-e01`,
    )!;
    const harness = new URL('./react-form-fixtures.html', testServerUrl(4174)).href;
    await page.route(harness, (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><title>Component隔離検証</title>',
      }),
    );
    await page.goto(harness);
    const observations = await page.evaluate(
      async ({ exercise, editableFile }) => {
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
                messages: lateDiagnostics.map(({ message }) => message),
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
                  [editableFile]: files[editableFile]! + '\n// 別のSource\n',
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
      { exercise, editableFile },
    );
    await writeFile(
      info.outputPath('reducer-context-observations.json'),
      JSON.stringify(observations, null, 2),
    );
    await info.attach('form-fixtures', {
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
    if (lesson.endsWith('09')) {
      expect(observations.find(({ id }) => id === 'after-event-error')?.status).toBe('recovered');
      expect(observations.find(({ id }) => id === 'event-error')?.messages).toContain(
        'Error: Context入力の元例外',
      );
    }
  });
}
