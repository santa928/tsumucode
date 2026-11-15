import { writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { testServerUrl } from '../e2e/helpers/testBasePath';
import type { RunnerAdapter } from '../../src/core/runtime/contracts';

for (const lesson of ['react-ch01-l06-compose', 'react-ch01-l11-compose']) {
  for (const phase of ['前半', '後半', '補足'] as const) {
    test(`${lesson}の正負Fixture・${phase}を実Compiler・実DOM・値の由来で判定する`, async ({
      page,
    }, info) => {
      test.setTimeout(180_000);
      // Compilerは実行Workerだけで読み、Browserは製品のbuild済みentryを使う。
      const [
        { loadAuthoringCourse },
        { createCases, evaluateCase, disposeFixtureHarness },
        { loadRuntimeModulePath },
      ] = await Promise.all([
        import('../../scripts/content/compileCourse'),
        import('../e2e/helpers/courseFixtureGate'),
        import('../e2e/helpers/javascriptRunnerModule'),
      ]);
      const exercise = (await loadAuthoringCourse('content/react')).exercises.find(
        ({ id }) => id === `${lesson}-e01`,
      )!;
      const runtime = {
        languageId: 'react',
        feedbackScope: 'rule' as const,
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
      };
      const harness = new URL('./react-compose-fixtures.html', testServerUrl()).href;
      await page.route(harness, (route) =>
        route.fulfill({
          contentType: 'text/html',
          body: '<!doctype html><title>Component隔離検証</title>',
        }),
      );
      await page.goto(harness);
      const observations = [];
      const cases = createCases([exercise]);
      const solution = cases.find(({ caseKind }) => caseKind === 'solution')!;
      try {
        // 1課題へ全ケースをまとめた総時間の超過を防ぎ、全ケースを2群で保持する。
        const middle = Math.ceil(exercise.fixtures.length / 2);
        const fixtures =
          phase === '前半'
            ? exercise.fixtures.slice(0, middle)
            : phase === '後半'
              ? exercise.fixtures.slice(middle)
              : [];
        for (const fixture of fixtures) {
          await test.step(fixture.id, async () => {
            const fixtureCase = cases.find(
              (entry) => entry.caseKind === 'authored' && entry.fixtureId === fixture.id,
            )!;
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
            if (fixture.expectedDiagnosticCodes?.includes('javascript-runtime')) {
              const recovered = await evaluateCase(page, solution, runtime);
              observations.push({ id: 'after-event-error', status: recovered.status });
              expect(recovered.status).toBe('pass');
            }
          });
        }
        if (phase !== '補足') return;
        const stale = await evaluateCase(
          page,
          { ...solution, faultInjection: 'stale-source-evidence' },
          runtime,
        );
        observations.push({ id: 'stale-source', status: stale.status });
        expect(stale.status).toBe('system-error');
        expect(stale.diagnostics.map(({ code }) => code)).toEqual(['react-source-mismatch']);
        const wrongOwner = await evaluateCase(
          page,
          {
            ...solution,
            exercise: { ...solution.exercise, id: `${lesson.replace('-compose', '')}-e01` },
          },
          runtime,
        );
        observations.push({ id: 'wrong-scenario-owner', status: wrongOwner.status });
        expect(wrongOwner.status).toBe('system-error');
        expect(wrongOwner.diagnostics.map(({ code }) => code)).toEqual(['react-source-mismatch']);
        const forged = await page.evaluate(
          async ({ exercise, files }) => {
            const harness = (
              window as typeof window & {
                __tsumucodeCourseFixtureHarness?: { runner: RunnerAdapter };
              }
            ).__tsumucodeCourseFixtureHarness;
            if (!harness) throw Error('Fixture Runnerがありません');
            const rendered = await harness.runner.render({
              exerciseSessionId: exercise.id,
              executionRevision: 1,
              languageId: 'react',
              files: {
                ...files,
                'types.ts': files['types.ts']! + '\nexport type Extra = string;\n',
              },
              assets: [],
              viewport: exercise.previewViewports[0]!,
              options: { runtime: exercise.runtime },
            });
            return {
              evidence: rendered.evidence.length,
              diagnostics: rendered.diagnostics.map(({ code }) => code),
            };
          },
          { exercise, files: solution.files },
        );
        observations.push({ id: 'forged-types', ...forged });
        expect(forged.evidence).toBe(0);
      } finally {
        await writeFile(
          info.outputPath('compose-observations.json'),
          JSON.stringify(observations, null, 2),
        );
        await info.attach('compose-fixtures', {
          body: JSON.stringify(observations, null, 2),
          contentType: 'application/json',
        });
        await disposeFixtureHarness(page);
      }
    });
  }
}
