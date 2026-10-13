import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import type * as Harness from './helpers/pythonCoreCacheHarness';
import { testBasePath, testServerUrl } from './helpers/testBasePath';

async function openHarness(page: Page) {
  const url = new URL('__python-cold-boundary', testServerUrl(4174)).href;
  await page.route(url, (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>取得期限</title>' }),
  );
  await page.goto(url);
}

for (const boundary of ['source', 'source-timer', 'assets', 'registration'] as const) {
  const title =
    boundary === 'source-timer'
      ? 'PythonのSource hash20秒期限は取得90秒へ延長しない'
      : `Pythonの${boundary}絶対期限はtimer応答前の後着も拒否する`;
  test(title, async ({ page }) => {
    test.setTimeout(40_000);
    await openHarness(page);
    const result = await page.evaluate(async (kind) => {
      const modulePath = new URL('./tests/e2e/helpers/pythonCoreCacheHarness.ts', location.href)
        .href;
      const module = (await import(/* @vite-ignore */ modulePath)) as typeof Harness;
      return module.exerciseClockBoundary(kind);
    }, boundary);
    await test.info().attach('absolute-clock-boundary', {
      body: JSON.stringify(result),
      contentType: 'application/json',
    });
    expect(result.clockReadAdjusted).toBe(boundary !== 'source-timer');
    if (boundary === 'source-timer') expect(result.elapsed).toBeGreaterThan(19_900);
    expect(result.first).toMatchObject({
      status: 'system-error',
      evidence: [],
      runId: 'cache-run-1',
    });
    expect(result.frames).toBe(0);
    expect(result.retry).toMatchObject({ status: 'succeeded', runId: 'cache-run-2' });
    expect(result.loads).toBe(2);
  });
}

test('Pythonの部分stream取消は進捗と不完全coreを残さず再試行できる', async ({ page }) => {
  await openHarness(page);
  const result = await page.evaluate(async () => {
    const modulePath = new URL('./tests/e2e/helpers/pythonCoreCacheHarness.ts', location.href).href;
    const module = (await import(/* @vite-ignore */ modulePath)) as typeof Harness;
    return module.exerciseProgressCancellation();
  });
  await test.info().attach('partial-stream-cancel', {
    body: JSON.stringify(result),
    contentType: 'application/json',
  });
  expect(result.first).toMatchObject({ status: 'stopped', evidence: [] });
  expect(result.oldEvents.length).toBe(result.stoppedAt);
  expect(result.oldEvents.at(-1)?.receivedBytes).toBeGreaterThan(0);
  expect(result.oldEvents.at(-1)?.receivedBytes).toBeLessThan(12_262_932);
  expect(result.oldEvents.some((event) => event.stage === 'initialize')).toBe(false);
  expect(result.framesAfterStop).toBe(0);
  expect(result.retry).toMatchObject({ status: 'succeeded', runId: 'cache-run-2' });
  expect(
    result.events.some((event) => event.runId === 'cache-run-2' && event.stage === 'execute'),
  ).toBe(true);
});

for (const ready of [false, true]) {
  test(`Pythonの${ready ? '実行1.5秒' : '初期化15秒'}期限は取得期限と独立する`, async ({
    page,
  }) => {
    test.setTimeout(40_000);
    await openHarness(page);
    const result = await page.evaluate(async (isReady) => {
      const modulePath = new URL('./tests/e2e/helpers/pythonCoreCacheHarness.ts', location.href)
        .href;
      const module = (await import(/* @vite-ignore */ modulePath)) as typeof Harness;
      return module.exerciseRuntimeDeadline(isReady);
    }, ready);
    await test.info().attach('worker-stage-deadline', {
      body: JSON.stringify(result),
      contentType: 'application/json',
    });
    expect(result.result).toMatchObject({
      status: ready ? 'stopped' : 'system-error',
      evidence: [],
    });
    expect(result.result.diagnostics[0]?.learnerMessage).toContain(ready ? '実行時間' : '初期化');
    expect(result.elapsed).toBeGreaterThanOrEqual(ready ? 1500 : 15_000);
    expect(result.elapsed).toBeLessThan(18_000);
    expect(result.frames).toBe(0);
  });
}

test('Python取得中の進捗は読み上げ可能でキーボードから取消できる', async ({ page }) => {
  test.setTimeout(45_000);
  let requested!: () => void;
  let release!: () => void;
  const loading = new Promise<void>((resolve) => {
    requested = resolve;
  });
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/python-runtime/314.0.7/core.wasm', async (route) => {
    requested();
    await held;
    await route.continue().catch(() => undefined);
  });
  try {
    await page.goto(
      `${testBasePath()}#/courses/python-basics/lessons/python-basics-ch01-l01/exercises/python-basics-ch01-l01-e01`,
    );
    await loading;
    const region = page.getByRole('region', { name: 'Python実行環境の準備' });
    await expect(region).toBeVisible();
    await expect(region.getByRole('status')).toContainText('コードはまだ実行していません');
    await expect(
      region.getByRole('progressbar', { name: '固定実行環境の取得と確認' }),
    ).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({
      path: test.info().outputPath('python-download-progress.png'),
      fullPage: true,
    });
    const stop = page.getByRole('button', { name: '実行を停止', exact: true });
    await stop.focus();
    await expect(stop).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(region).not.toBeVisible();
    await expect(
      page.getByText('実行を停止しました。採点していません。', { exact: true }).first(),
    ).toBeVisible();
  } finally {
    release();
    await page.unrouteAll({ behavior: 'wait' });
  }
});
