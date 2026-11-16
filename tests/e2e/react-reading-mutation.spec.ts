import { expect, test } from '@playwright/test';
import { testServerUrl } from './helpers/testBasePath';

// 型上可変な本へコピーしても、State自身を後から直接変更してはいけない。
test('読書Stateの括弧付き直接変更を拒否し、新しい本を返す別解へ復帰できる', async ({ page }) => {
  const [
    { loadAuthoringCourse },
    { createCases, evaluateCase, disposeFixtureHarness },
    { loadRuntimeModulePath },
  ] = await Promise.all([
    import('../../scripts/content/compileCourse'),
    import('./helpers/courseFixtureGate'),
    import('./helpers/javascriptRunnerModule'),
  ]);
  const exercise = (await loadAuthoringCourse('content/react')).exercises.find(
    ({ id }) => id === 'react-ch02-l02-e01',
  )!;
  const cases = createCases([exercise]);
  const mutation = cases.find(({ fixtureId }) => fixtureId === 'mutable-state-book')!;
  const alternative = cases.find(({ fixtureId }) => fixtureId === 'alternative-fresh-copy')!;
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
  const harness = new URL('./reading-mutation.html', testServerUrl()).href;
  await page.route(harness, (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><title>読書Stateの直接変更回帰</title>',
    }),
  );
  await page.goto(harness);
  try {
    const result = await evaluateCase(
      page,
      {
        ...mutation,
        files: {
          ...mutation.files,
          'components.tsx': mutation.files['components.tsx']!.replace(
            'book.read = !book.read',
            '(book.read) = !book.read',
          ),
        },
      },
      runtime,
    );
    expect(result.status).toBe('code-error');
    expect(result.diagnostics.map(({ code }) => code)).toContain('react-type-error-0');
    expect((await evaluateCase(page, alternative, runtime)).status).toBe('pass');
  } finally {
    await disposeFixtureHarness(page);
  }
});
