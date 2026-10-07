import { expect, test } from '@playwright/test';
import { loadAuthoringCourse } from '../../scripts/content/compileCourse';
import { testServerUrl } from './helpers/testBasePath';
import type * as RunnerModule from '../../src/adapters/runtime/react/ReactRunnerAdapter';
import type * as ValidatorModule from '../../src/adapters/validation/react/ReactValidator';

for (const lesson of ['react-ch01-l02', 'react-ch01-l03']) {
  test(`${lesson}の正負Fixtureを実Compiler・DOMと学習条件のANDで判定する`, async ({
    page,
  }, info) => {
    test.setTimeout(120_000);
    const exercise = (await loadAuthoringCourse('content/react')).exercises.find(
      ({ id }) => id === `${lesson}-e01`,
    )!;
    const harness = new URL('./react-composition-fixtures.html', testServerUrl(4174)).href;
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
              policy: validator.buildSnapshotPolicy(exercise.validationRules),
            });
            const context = {
              exerciseId: exercise.id,
              runtime: exercise.runtime,
              files,
              rules: exercise.validationRules,
              snapshots: { [viewport.id]: snapshot },
              diagnostics: rendered.diagnostics,
              evidence: rendered.evidence,
              console: rendered.console,
              interactionScenarios: [],
              interactionCheckpoints: {},
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
                  'types.ts': files['types.ts']!.replace('title: string', 'title: number'),
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
    await info.attach('composition-fixtures', {
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
  });
}
