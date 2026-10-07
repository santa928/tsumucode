import { writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { loadAuthoringCourse } from '../../scripts/content/compileCourse';
import { testServerUrl } from '../e2e/helpers/testBasePath';
import type * as RunnerModule from '../../src/adapters/runtime/react/ReactRunnerAdapter';
import type * as ValidatorModule from '../../src/adapters/validation/react/ReactValidator';
import type * as InteractionModule from '../../src/features/learning/session/runInteractionScenario';

const { exercises } = await loadAuthoringCourse('content/react');

// Refのnative focusは実クリックと通常UI採点をreact-ref-focus.spec.tsで3Browser確認する。
// 残る正負Fixtureは各教材の既存試験へ任せ、ここでは14教材の正例を実行する。
for (const exercise of exercises.filter((exercise) => exercise.id !== 'react-ch01-l10-e01')) {
  test(`${exercise.id}の正例を実Worker・React・全Scenario・Validatorで判定する`, async ({
    page,
  }, info) => {
    const harness = new URL('./react-course-acceptance.html', testServerUrl(4174)).href;
    await page.route(harness, (route) =>
      route.fulfill({
        contentType: 'text/html; charset=utf-8',
        body: '<!doctype html><meta charset="utf-8"><title>React Course技術受入</title><button type="button">プレビューを開始</button>',
      }),
    );
    await page.goto(harness);
    await page.bringToFront();
    await page.getByRole('button', { name: 'プレビューを開始', exact: true }).click();
    const observation = await page.evaluate(async (exercise) => {
      const runnerPath = new URL(
        './src/adapters/runtime/react/ReactRunnerAdapter.ts',
        location.href,
      ).href;
      const validatorPath = new URL(
        './src/adapters/validation/react/ReactValidator.ts',
        location.href,
      ).href;
      const interactionPath = new URL(
        './src/features/learning/session/runInteractionScenario.ts',
        location.href,
      ).href;
      const { ReactRunnerAdapter } = (await import(
        /* @vite-ignore */ runnerPath
      )) as typeof RunnerModule;
      const { ReactValidator } = (await import(
        /* @vite-ignore */ validatorPath
      )) as typeof ValidatorModule;
      const { runInteractionScenario, extendSnapshotPolicyForInteractions } = (await import(
        /* @vite-ignore */ interactionPath
      )) as typeof InteractionModule;
      if (exercise.runtime?.kind !== 'react') throw new Error('React Runtimeが必要です');
      const viewport = exercise.previewViewports[0];
      if (!viewport) throw new Error('Preview Viewportが必要です');
      const runner = new ReactRunnerAdapter();
      const validator = new ReactValidator();
      const frame = document.createElement('iframe');
      document.body.append(frame);
      const files = Object.fromEntries(
        exercise.solutionFiles.map(({ path, content }) => [path, content]),
      );
      const input = {
        exerciseSessionId: exercise.id,
        executionRevision: 1,
        languageId: 'react',
        files,
        assets: [],
        viewport,
        options: { runtime: exercise.runtime },
      };
      const policy = extendSnapshotPolicyForInteractions(
        validator.buildSnapshotPolicy(exercise.validationRules),
        [exercise],
      );
      const started = performance.now();
      try {
        await runner.prepare(frame);
        const rendered = await runner.render(input);
        if (rendered.diagnostics.some(({ severity }) => severity === 'error'))
          throw new Error(JSON.stringify(rendered.diagnostics));
        const snapshot = await runner.requestSnapshot({
          exerciseSessionId: exercise.id,
          executionRevision: 1,
          requestId: crypto.randomUUID(),
          policy,
        });
        const checkpoints = [];
        for (const scenario of exercise.interactionScenarios ?? []) {
          checkpoints.push(
            ...(await runInteractionScenario({
              exerciseSessionId: exercise.id,
              executionRevision: 1,
              viewport,
              policy,
              scenario,
              render: () => runner.render(input),
              interact: (request) => runner.interact(request),
              requestSnapshot: (request) => runner.requestSnapshot(request),
              assertFresh: () => undefined,
              nextRequestId: () => crypto.randomUUID(),
              assertGradable: (result) => {
                if (result.diagnostics?.some(({ severity }) => severity === 'error'))
                  throw new Error(JSON.stringify(result.diagnostics));
              },
            })),
          );
        }
        const result = await validator.validate({
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
          now: new Date().toISOString(),
          execution: {
            ...rendered,
            runId: exercise.id,
            backend: 'browser',
            engine: 'browser-js',
            status: 'succeeded',
          },
        });
        return {
          exerciseId: exercise.id,
          profile: exercise.runtime.profile,
          elapsedMs: performance.now() - started,
          result,
          checkpoints,
        };
      } finally {
        await runner.dispose();
        frame.remove();
      }
    }, exercise);
    await writeFile(
      info.outputPath('react-acceptance-observation.json'),
      JSON.stringify(observation, null, 2),
    );
    expect(observation.result.status).toBe('pass');
    expect(observation.result.diagnostics).toEqual([]);
    expect(observation.result.checks.every(({ passed }) => passed)).toBe(true);
  });
}
