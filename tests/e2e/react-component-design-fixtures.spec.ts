import { writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { loadAuthoringCourse } from '../../scripts/content/compileCourse';
import type { RunnerAdapter } from '../../src/core/runtime/contracts';
import { createCases, evaluateCase, disposeFixtureHarness } from './helpers/courseFixtureGate';
import { loadRuntimeModulePath } from './helpers/javascriptRunnerModule';
import { testServerUrl } from './helpers/testBasePath';

const lesson = 'react-ch02-l04';
for (const phase of ['pass', 'incomplete', 'code-error', 'integrity'] as const) {
  test(`${lesson}の温度Fixture・${phase}を実Compilerと操作で判定する`, async ({ page }, info) => {
    test.setTimeout(180_000);
    const exercise = (await loadAuthoringCourse('content/react')).exercises.find(
      ({ id }) => id === `${lesson}-e01`,
    )!;
    // 全Fixtureを保持し、配布済みentryを読む既存ハーネスで少数ずつ実行する。
    expect(
      exercise.fixtures.every(({ expectedStatus }) =>
        ['pass', 'incomplete', 'code-error'].includes(expectedStatus),
      ),
    ).toBe(true);
    const runtime = {
      languageId: 'react',
      feedbackScope: 'rule',
      runnerModulePath: new URL(
        await loadRuntimeModulePath('src/adapters/runtime/react/ReactRunnerAdapter.ts'),
        testServerUrl(),
      ).href,
      validatorModulePath: new URL(
        await loadRuntimeModulePath('src/adapters/validation/react/ReactValidator.ts'),
        testServerUrl(),
      ).href,
      runnerExportName: 'ReactRunnerAdapter',
      validatorExportName: 'ReactValidator',
    } as const;
    const harness = new URL('./react-temperature-fixtures.html', testServerUrl()).href;
    await page.route(harness, (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><title>Component隔離検証</title>',
      }),
    );
    await page.goto(harness);
    const cases = createCases([exercise]);
    const solution = cases.find(({ caseKind }) => caseKind === 'solution')!;
    const observations: object[] = [];
    try {
      for (const fixture of exercise.fixtures.filter(
        ({ expectedStatus }) => expectedStatus === phase,
      )) {
        await test.step(fixture.id, async () => {
          const fixtureCase = cases.find(
            (entry) => entry.caseKind === 'authored' && entry.fixtureId === fixture.id,
          )!;
          try {
            const result = await evaluateCase(page, fixtureCase, runtime);
            const diagnostics = [...new Set(result.diagnostics.map(({ code }) => code))];
            const failedRules = result.checks
              .filter(({ passed }) => !passed)
              .map(({ ruleId }) => ruleId)
              .sort();
            observations.push({ id: fixture.id, status: result.status, diagnostics, failedRules });
            expect(result.status, fixture.id).toBe(fixture.expectedStatus);
            expect(diagnostics, fixture.id).toEqual(fixture.expectedDiagnosticCodes ?? []);
            expect(failedRules, fixture.id).toEqual([...fixture.expectedFeedbackRuleIds].sort());
          } finally {
            await disposeFixtureHarness(page);
          }
        });
      }
      if (phase !== 'integrity') return;
      const stale = await evaluateCase(
        page,
        { ...solution, faultInjection: 'stale-source-evidence' },
        runtime,
      );
      observations.push({ id: 'stale-source', status: stale.status });
      expect(stale.status).toBe('system-error');
      expect(stale.diagnostics.map(({ code }) => code)).toEqual(['react-source-mismatch']);
      const missing = await evaluateCase(
        page,
        {
          ...solution,
          exercise: { ...solution.exercise, interactionScenarios: [] },
        },
        runtime,
      );
      observations.push({ id: 'missing-scenario', status: missing.status });
      expect(missing.status).toBe('system-error');
      expect(missing.diagnostics.map(({ code }) => code)).toEqual(['react-source-mismatch']);
      const missingTarget = cases.find(({ fixtureId }) => fixtureId === 'missing-button-id')!;
      const refused = await evaluateCase(page, missingTarget, runtime);
      expect(refused.status).toBe('code-error');
      expect(refused.diagnostics.map(({ code }) => code)).toEqual(['react-interaction-target']);
      const recovered = await evaluateCase(page, solution, runtime);
      observations.push({ id: 'after-missing-target', status: recovered.status });
      expect(recovered.status).toBe('pass');
      const forged = await page.evaluate(
        async ({ exercise, files }) => {
          const harness = (
            window as typeof window & {
              __tsumucodeCourseFixtureHarness?: { runner: RunnerAdapter };
            }
          ).__tsumucodeCourseFixtureHarness;
          if (!harness) throw Error('Fixture Runnerがありません');
          const result = await harness.runner.render({
            exerciseSessionId: exercise.id,
            executionRevision: 1,
            languageId: 'react',
            files: {
              ...files,
              'main.tsx': files['main.tsx']! + '\nconsole.log("changed entry");\n',
            },
            assets: [],
            viewport: exercise.previewViewports[0]!,
            options: { runtime: exercise.runtime },
          });
          return {
            evidence: result.evidence.length,
            diagnostics: result.diagnostics.map(({ code }) => code),
          };
        },
        { exercise, files: solution.files },
      );
      observations.push({ id: 'forged-entry', ...forged });
      expect(forged.evidence).toBe(0);
      expect(forged.diagnostics).toEqual(['react-input']);
    } finally {
      await writeFile(
        info.outputPath('temperature-observations.json'),
        JSON.stringify(observations, null, 2),
      );
      await info.attach('temperature-fixtures', {
        body: JSON.stringify(observations),
        contentType: 'application/json',
      });
      await disposeFixtureHarness(page);
    }
  });
}
