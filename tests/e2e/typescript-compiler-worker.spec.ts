import { expect, test } from '@playwright/test';
import type * as PreparationClient from '../../src/adapters/runtime/typescript/TypeScriptPreparationClient';
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
  test.info().annotations.push({
    type: 'compiler-worker-duration-ms',
    description: String(Math.round(evidence.durationMs)),
  });
});

test('型検査Workerから既存Analyzer Workerへ接続し、通信拒否と中止後の再試行を確認する', async ({
  page,
}) => {
  const harness = new URL('__typescript-preparation-harness', testServerUrl(4174)).href;
  await page.route(harness, (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>準備境界</title>' }),
  );
  await page.goto(harness);
  const evidence = await page.evaluate(async () => {
    const modulePath = new URL(
      './src/adapters/runtime/typescript/TypeScriptPreparationClient.ts',
      location.href,
    ).href;
    const { TypeScriptPreparationClient } = (await import(
      /* @vite-ignore */ modulePath
    )) as typeof PreparationClient;
    const client = new TypeScriptPreparationClient();
    const input = {
      sessionId: 'actual-preparation',
      revision: 1,
      entryFile: 'main.ts',
      files: {
        'main.ts': 'import { twice } from "./score.js"; console.log(twice(3));',
        'score.ts': 'export function twice(value: number): number { return value * 2; }',
      },
      capabilityProfile: 'modules' as const,
      guardIdentifier: '__guard',
    };
    try {
      const valid = await client.prepare(input);
      const blocked = await client.prepare({
        ...input,
        revision: 2,
        files: { 'main.ts': 'fetch("https://example.invalid");' },
      });
      const pending = client
        .prepare(input)
        .catch((error: unknown) => (error instanceof Error ? error.name : 'unknown'));
      client.cancel();
      const cancelled = await pending;
      const retry = await client.prepare({ ...input, revision: 3 });
      return { valid, blocked, cancelled, retry };
    } finally {
      client.dispose();
    }
  });
  expect(evidence.valid).toMatchObject({
    stage: 'analysis',
    result: { status: 'success', entryFile: 'main.js' },
  });
  expect(evidence.blocked).toMatchObject({
    stage: 'analysis',
    result: {
      status: 'failure',
      diagnostics: expect.arrayContaining([expect.objectContaining({ kind: 'security' })]),
    },
  });
  expect(evidence.cancelled).toBe('AbortError');
  expect(evidence.retry).toMatchObject({
    stage: 'analysis',
    result: { status: 'success', executionRevision: 3 },
  });
});
