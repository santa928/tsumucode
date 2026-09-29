import { expect, test } from '@playwright/test';
import type * as CompilerClient from '../../src/adapters/runtime/typescript/TypeScriptCompilerClient';
import { testServerUrl } from './helpers/testBasePath';

test('実TypeScript Workerで型誤り→修正と中止→再試行を行い、親画面は応答し続ける', async ({
  page,
}) => {
  const harness = new URL('__typescript-worker-harness', testServerUrl(4174)).href;
  // 独立した境界検証ページにはVite HMR clientを載せず、依存初回最適化のreloadを混ぜない。
  await page.route(harness, (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><html lang="ja"><title>型検査境界</title><body>Worker検証</body></html>',
    }),
  );
  await page.goto(harness);
  const evidence = await page.evaluate(async () => {
    const modulePath = new URL(
      './src/adapters/runtime/typescript/TypeScriptCompilerClient.ts',
      location.href,
    ).href;
    const { TypeScriptCompilerClient } = (await import(
      /* @vite-ignore */ modulePath
    )) as typeof CompilerClient;
    const client = new TypeScriptCompilerClient();
    let ticks = 0;
    const timer = setInterval(() => {
      ticks += 1;
    }, 20);
    const input = {
      sessionId: 'typescript-worker-browser',
      revision: 1,
      files: { 'main.ts': 'const count: number = "wrong";' },
    };
    const started = performance.now();
    try {
      const rejected = await client.compile(input);
      const fixed = await client.compile({
        ...input,
        revision: 2,
        files: { 'main.ts': 'const count: number = 2; document.title = String(count);' },
      });
      const pending = client
        .compile(input)
        .catch((error: unknown) => (error instanceof Error ? error.name : 'unknown'));
      client.cancel();
      const cancelled = await pending;
      const retry = await client.compile({
        ...input,
        revision: 3,
        files: { 'main.ts': 'console.log("retry");' },
      });
      return {
        rejected,
        fixed,
        cancelled,
        retry,
        ticks,
        durationMs: performance.now() - started,
        source: input.files['main.ts'],
        title: document.title,
      };
    } finally {
      clearInterval(timer);
      client.dispose();
    }
  });
  expect(evidence.rejected.status).toBe('type-error');
  expect(evidence.rejected).not.toHaveProperty('files');
  expect(evidence.fixed.status).toBe('ready');
  expect(evidence.cancelled).toBe('AbortError');
  expect(evidence.retry.status).toBe('ready');
  expect(evidence.ticks).toBeGreaterThan(0);
  expect(evidence.source).toContain('"wrong"');
  expect(evidence.title).not.toBe('2');
  test
    .info()
    .annotations.push({
      type: 'compiler-worker-duration-ms',
      description: String(Math.round(evidence.durationMs)),
    });
});
