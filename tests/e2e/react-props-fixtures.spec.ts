import { expect, test } from '@playwright/test';
import { loadAuthoringCourse } from '../../scripts/content/compileCourse';
import { testServerUrl } from './helpers/testBasePath';
import type * as RunnerModule from '../../src/adapters/runtime/react/ReactRunnerAdapter';
import type * as ValidatorModule from '../../src/adapters/validation/react/ReactValidator';

test('Propsの全正負Fixture、描画例外と旧Source証拠を実隔離Runnerで区別する', async ({
  page,
}, info) => {
  test.setTimeout(90_000);
  const exercise = (await loadAuthoringCourse('content/react')).exercises[0]!;
  const harness = new URL('./react-fixtures.html', testServerUrl(4174)).href;
  await page.route(harness, (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><title>React隔離検証</title>',
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
          const files = Object.fromEntries(fixture.files.map((file) => [file.path, file.content]));
          const revision = index + 1;
          const rendered = await runner.render({
            exerciseSessionId: 'react-fixtures',
            executionRevision: revision,
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
              diagnostics: rendered.diagnostics.map((item) => item.code),
            });
            continue;
          }
          const snapshot = await runner.requestSnapshot({
            exerciseSessionId: 'react-fixtures',
            executionRevision: revision,
            requestId: `fixture-${String(revision)}`,
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
            now: '2026-10-06T00:00:00Z',
            execution: {
              ...rendered,
              runId: `fixture-${String(revision)}`,
              backend: 'browser' as const,
              engine: 'browser-js' as const,
              status: 'succeeded' as const,
            },
          };
          const result = await validator.validate(context);
          rows.push({
            id: fixture.id,
            status: result.status,
            diagnostics: result.diagnostics.map((item) => item.code),
          });
          if (fixture.id === 'solution') {
            const stale = await validator.validate({
              ...context,
              files: {
                ...files,
                'main.tsx': files['main.tsx']!.replace('HTMLが受け持つものは？', '別の問題'),
              },
            });
            rows.push({
              id: 'stale-source',
              status: stale.status,
              diagnostics: stale.diagnostics.map((item) => item.code),
            });
          }
        }
        const solution = exercise.fixtures.find((item) => item.id === 'solution')!;
        const files = Object.fromEntries(solution.files.map((file) => [file.path, file.content]));
        const failedFiles = {
          ...files,
          'main.tsx': files['main.tsx']!.replace(
            "prompt: 'HTMLが受け持つものは？'",
            "get prompt(): string { throw new Error('カード描画失敗'); }",
          ),
        };
        const failure = await runner.render({
          exerciseSessionId: 'react-fixtures',
          executionRevision: 10,
          languageId: 'react',
          files: failedFiles,
          assets: [],
          viewport,
          options: { runtime: exercise.runtime },
        });
        rows.push({
          id: 'render-failure',
          status: failure.evidence.some(
            (item) => item.id === 'javascript.executed' && item.value === true,
          )
            ? 'unexpected-success'
            : 'code-error',
          diagnostics: failure.diagnostics.map((item) => item.code),
        });
        const forgedCard = await runner.render({
          exerciseSessionId: 'react-fixtures',
          executionRevision: 11,
          languageId: 'react',
          files: {
            ...files,
            'main.tsx': files['main.tsx']!.replace(
              "prompt: 'HTMLが受け持つものは？'",
              'prompt: 42',
            ),
            'QuestionCard.tsx': files['QuestionCard.tsx']!.replace(
              'readonly prompt: string',
              'readonly prompt: number',
            ).replace('{question.prompt}', 'HTMLが受け持つものは？'),
          },
          assets: [],
          viewport,
          options: { runtime: exercise.runtime },
        });
        rows.push({
          id: 'forged-card',
          status: forgedCard.evidence.length ? 'unexpected-success' : 'rejected',
          diagnostics: forgedCard.diagnostics.map((item) => item.code),
        });
        const forgedHtml = await runner.render({
          exerciseSessionId: 'react-fixtures',
          executionRevision: 12,
          languageId: 'react',
          files: {
            ...files,
            'index.html': files['index.html']!.replace(
              '<div id="root">',
              '<h1 id="question-prompt">HTMLが受け持つものは？</h1><div id="root">',
            ),
          },
          assets: [],
          viewport,
          options: { runtime: exercise.runtime },
        });
        rows.push({
          id: 'forged-html',
          status: forgedHtml.evidence.length ? 'unexpected-success' : 'rejected',
          diagnostics: forgedHtml.diagnostics.map((item) => item.code),
        });
        const recovered = await runner.render({
          exerciseSessionId: 'react-fixtures',
          executionRevision: 13,
          languageId: 'react',
          files,
          assets: [],
          viewport,
          options: { runtime: exercise.runtime },
        });
        rows.push({
          id: 'render-recovery',
          status: recovered.diagnostics.length ? 'code-error' : 'ready',
          diagnostics: recovered.diagnostics.map((item) => item.code),
        });
        await runner.stop();
        const rejected = await runner
          .requestSnapshot({
            exerciseSessionId: 'react-fixtures',
            executionRevision: 13,
            requestId: 'stopped',
            policy: validator.buildSnapshotPolicy(exercise.validationRules),
          })
          .then(
            () => false,
            () => true,
          );
        rows.push({
          id: 'stopped-snapshot',
          status: rejected ? 'rejected' : 'unexpected-success',
          diagnostics: [],
        });
        return rows;
      } finally {
        await runner.dispose();
        frame.remove();
      }
    },
    { exercise },
  );
  await info.attach('react-fixtures', {
    body: JSON.stringify(observations, null, 2),
    contentType: 'application/json',
  });
  for (const fixture of exercise.fixtures) {
    const row = observations.find((item) => item.id === fixture.id)!;
    expect(row.status, fixture.id).toBe(fixture.expectedStatus);
    expect(row.diagnostics, fixture.id).toEqual(fixture.expectedDiagnosticCodes ?? []);
  }
  expect(observations.find((item) => item.id === 'stale-source')).toMatchObject({
    status: 'system-error',
    diagnostics: ['react-source-mismatch'],
  });
  expect(observations.find((item) => item.id === 'render-failure')).toMatchObject({
    status: 'code-error',
    diagnostics: ['javascript-runtime'],
  });
  expect(observations.find((item) => item.id === 'render-recovery')).toMatchObject({
    status: 'ready',
    diagnostics: [],
  });
  expect(observations.find((item) => item.id === 'forged-card')).toMatchObject({
    status: 'rejected',
    diagnostics: ['react-type-error-0'],
  });
  expect(observations.find((item) => item.id === 'forged-html')).toMatchObject({
    status: 'rejected',
    diagnostics: ['react-input'],
  });
  expect(observations.find((item) => item.id === 'stopped-snapshot')?.status).toBe('rejected');
});
