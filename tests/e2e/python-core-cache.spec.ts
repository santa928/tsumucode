import { expect, test, type Page } from '@playwright/test';
import type * as Harness from './helpers/pythonCoreCacheHarness';
import { testServerUrl } from './helpers/testBasePath';

/** Viteの信頼moduleを実Browserで読み、製品と同じopaque frame/Workerを使う。 */
async function openHarness(page: Page) {
  const url = new URL('__python-core-cache', testServerUrl(4174)).href;
  await page.route(url, (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><title>Python core境界</title>',
    }),
  );
  await page.goto(url);
}

for (const mode of ['cancel', 'replace', 'dispose', 'timeout'] as const) {
  test(`Python core準備の${mode}は旧完了を再利用しない`, async ({ page }) => {
    test.setTimeout(60_000);
    await openHarness(page);
    const result = await page.evaluate(async (race) => {
      const modulePath = new URL('./tests/e2e/helpers/pythonCoreCacheHarness.ts', location.href)
        .href;
      const { exercisePreparationRace } = (await import(
        /* @vite-ignore */ modulePath
      )) as typeof Harness;
      return exercisePreparationRace(race);
    }, mode);
    await test.info().attach('core-cache-evidence', {
      body: JSON.stringify(result, null, 2),
      contentType: 'application/json',
    });
    expect(result.first).toMatchObject({
      runId: 'cache-run-1',
      executionRevision: 1,
      status: mode === 'timeout' ? 'system-error' : 'stopped',
      evidence: [],
    });
    if (mode === 'timeout') {
      expect(result.first.diagnostics[0]?.learnerMessage).toContain('時間内');
      // 実時計の現行20秒期限を待つ。短縮期限やfake clockは使用しない。
      expect(result.firstElapsed).toBeGreaterThanOrEqual(20_000);
    }
    for (const [run, revision] of [
      [result.retry, 2],
      [result.warm, 3],
    ] as const) {
      expect(run).toMatchObject({
        runId: `cache-run-${String(revision)}`,
        executionRevision: revision,
        status: mode === 'dispose' ? 'stopped' : 'succeeded',
      });
      if (mode !== 'dispose')
        expect(run.console).toEqual([{ level: 'log', text: '5', sequence: 0 }]);
    }
    expect(result.aborted).toBe(true);
    expect(result.loads).toBe(mode === 'dispose' ? 1 : 2);
    if (mode === 'dispose') {
      expect(result.recreated).toMatchObject({ status: 'succeeded', runId: 'cache-run-4' });
      expect(result.recreatedLoads).toBe(1);
    }
    expect(result.preparingFrames).toBe(0);
    expect(result.frames).toBe(0);
  });
}

for (const fault of ['truncated', 'hash', 'metadata', 'worker'] as const) {
  test(`Python製品loaderの${fault}拒否後はcoreを取り直して回復する`, async ({ page }) => {
    test.setTimeout(60_000);
    await openHarness(page);
    const name =
      fault === 'metadata' ? 'worker.json' : fault === 'worker' ? 'worker.js' : 'core.wasm';
    let requests = 0;
    await page.route(`**/python-runtime/314.0.7/${name}`, async (route) => {
      requests += 1;
      if (requests !== 1) {
        await route.continue();
      } else if (fault === 'hash') {
        const response = await route.fetch();
        const body = await response.body();
        body[0] = (body[0] ?? 0) ^ 1;
        await route.fulfill({ response, body });
      } else {
        await route.fulfill({
          status: 200,
          body: fault === 'metadata' ? '{}' : '不完全な固定asset',
        });
      }
    });
    const result = await page.evaluate(async () => {
      const modulePath = new URL('./tests/e2e/helpers/pythonCoreCacheHarness.ts', location.href)
        .href;
      const { exerciseLoaderRecovery } = (await import(
        /* @vite-ignore */ modulePath
      )) as typeof Harness;
      return exerciseLoaderRecovery();
    });
    await test.info().attach('core-loader-evidence', {
      body: JSON.stringify({ ...result, requests }, null, 2),
      contentType: 'application/json',
    });
    expect(result.failed).toMatchObject({
      status: 'system-error',
      evidence: [],
      runId: 'cache-run-1',
    });
    expect(result.failedFrames).toBe(0);
    expect(result.retry).toMatchObject({ status: 'succeeded', runId: 'cache-run-2' });
    expect(result.warm).toMatchObject({ status: 'succeeded', runId: 'cache-run-3' });
    expect(result.retry.console).toEqual([{ level: 'log', text: '5', sequence: 0 }]);
    expect(result.warm.console).toEqual(result.retry.console);
    expect(requests).toBe(2);
    expect(result.frames).toBe(0);
  });
}
