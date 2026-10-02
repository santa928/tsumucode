import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import type * as ConsoleRuntime from '../../src/features/learning/browserConsoleRuntime';
import type { ExecutionRequest } from '../../src/core/runtime/contracts';
import type { Exercise } from '../../src/core/content/types';
import { fixtureCourse } from '../fixtures/course';
import { validationRule } from '../fixtures/validation';

const exercise: Exercise = {
  ...fixtureCourse.phases[0]!.chapters[0]!.lessons[0]!.exercises[0]!,
  id: 'javascript-ch03-l05-e01',
  runtime: {
    kind: 'javascript',
    entryFile: 'script.js',
    sourceType: 'script',
    capabilityProfile: 'core',
    primaryOutput: 'console',
  },
  validationRules: [
    {
      ...validationRule(),
      target: { kind: 'javascript-console' },
      assertion: { kind: 'javascript-console', operator: 'equals', expected: [] },
    },
  ],
};

test('製品Console経路は暴走・旧run・停止を隔離し、同じサービスで再試行できる', async ({
  page,
}, testInfo) => {
  await page.goto('./#/');
  const manifest = JSON.parse(await readFile('dist/.vite/manifest.json', 'utf8')) as Record<
    string,
    { file: string }
  >;
  const entry = manifest['src/features/learning/browserConsoleRuntime.ts']?.file;
  expect(entry).toBeDefined();
  const evidence = await page.evaluate(
    async ({ entry, exercise }) => {
      const runtime = (await import(
        /* @vite-ignore */ new URL(entry!, location.href).href
      )) as typeof ConsoleRuntime;
      const runner = runtime.selectBrowserConsoleRuntime(exercise, [exercise])!.createExecution();
      /** source revisionを固定し、run IDだけ異なる競合も実行する。 */
      const request = (source: string, runId: string): ExecutionRequest => ({
        runId,
        exerciseSessionId: 'console-boundary',
        executionRevision: 1,
        backend: 'browser',
        engine: 'browser-js',
        languageId: 'javascript',
        requiredCapabilities: ['console'],
        files: { 'script.js': source },
        options: { runtime: exercise.runtime },
      });
      localStorage.setItem('console-parent-canary', 'unchanged');
      let ticks = 0;
      const timer = setInterval(() => {
        ticks += 1;
      }, 50);
      try {
        const privateScope = await runner.execute(
          request(
            'console.log(typeof port, typeof marker, typeof root, typeof arguments);',
            'private',
          ),
        );
        const csp = await runner.execute(
          request(
            'try { (()=>{}).constructor("return this")(); } catch(e) { console.log(e.name); }',
            'csp',
          ),
        );
        const rejected = await runner.execute(
          request('Promise.reject(new Error("oops"));', 'reject'),
        );
        const caught = await runner.execute(
          request(
            'const p = Promise.reject(new Error("handled")); queueMicrotask(() => p.catch(() => console.log("caught")));',
            'catch',
          ),
        );
        const microtaskError = await runner.execute(
          request('queueMicrotask(() => { throw new Error("microtask"); });', 'microtask-error'),
        );
        const first = runner.execute(request('while(true){}', 'old'));
        await new Promise((resolve) => setTimeout(resolve, 75));
        const second = runner.execute(request('console.log(42)', 'new'));
        const [oldRun, newRun] = await Promise.all([first, second]);
        const syncStart = performance.now();
        const syncLoop = await runner.execute(request('while(true){}', 'sync-loop'));
        const syncElapsedMs = performance.now() - syncStart;
        const before = ticks;
        const microtaskStart = performance.now();
        const loop = await runner.execute(
          request('queueMicrotask(function loop(){queueMicrotask(loop)});', 'microtask-loop'),
        );
        const microtaskElapsedMs = performance.now() - microtaskStart;
        const responsiveTicks = ticks - before;
        const stopping = runner.execute(request('while(true){}', 'manual-stop'));
        await new Promise((resolve) => setTimeout(resolve, 75));
        await runner.stop();
        const stopped = await stopping;
        const retry = await runner.execute(
          request('Promise.resolve(43).then(console.log)', 'retry'),
        );
        await runner.dispose();
        const disposed = await runner.execute(request('console.log(44)', 'disposed'));
        return {
          privateScope,
          rejected,
          caught,
          microtaskError,
          csp,
          oldRun,
          newRun,
          loop,
          syncLoop,
          syncElapsedMs,
          microtaskElapsedMs,
          responsiveTicks,
          stopped,
          retry,
          disposed,
          frames: document.querySelectorAll('iframe[title="Console実行環境"]').length,
          canary: localStorage.getItem('console-parent-canary'),
        };
      } finally {
        clearInterval(timer);
        await runner.dispose();
      }
    },
    { entry, exercise },
  );
  expect(evidence.privateScope.console.map((row) => row.text)).toEqual([
    'undefined undefined undefined undefined',
  ]);
  expect(evidence.csp.console.map((row) => row.text)).toEqual(['EvalError']);
  expect(evidence.rejected.status).toBe('code-error');
  expect(evidence.caught).toMatchObject({ status: 'succeeded', console: [{ text: 'caught' }] });
  expect(evidence.microtaskError.status).toBe('code-error');
  expect(evidence.oldRun).toMatchObject({ runId: 'old', status: 'stopped' });
  expect(evidence.newRun).toMatchObject({
    runId: 'new',
    status: 'succeeded',
    console: [{ text: '42' }],
  });
  expect(evidence.loop.status).toBe('stopped');
  expect(evidence.syncLoop.status).toBe('stopped');
  expect(evidence.responsiveTicks).toBeGreaterThan(0);
  expect(evidence.stopped.status).toBe('stopped');
  expect(evidence.retry).toMatchObject({ status: 'succeeded', console: [{ text: '43' }] });
  expect(evidence.disposed.status).toBe('stopped');
  expect(evidence.frames).toBe(0);
  expect(evidence.canary).toBe('unchanged');
  await testInfo.attach('console-safety-evidence', {
    body: JSON.stringify(evidence, null, 2),
    contentType: 'application/json',
  });
});

test('正常終了と有限microtasksで秘密markerをBrowser Consoleへ出さない', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('./#/');
  const manifest = JSON.parse(await readFile('dist/.vite/manifest.json', 'utf8')) as Record<
    string,
    { file: string }
  >;
  const entry = manifest['src/features/learning/browserConsoleRuntime.ts']!.file;
  const actual = await page.evaluate(
    async ({ entry, exercise }) => {
      const runtime = (await import(new URL(entry, location.href).href)) as typeof ConsoleRuntime;
      const runner = runtime.selectBrowserConsoleRuntime(exercise, [exercise])!.createExecution();
      /** 同じtrusted経路へsourceだけを変えて注入し、内部通知と学習者の拒否を分ける。 */
      const request = (source: string, runId: string): ExecutionRequest => ({
        runId,
        exerciseSessionId: 'marker-boundary',
        executionRevision: 1,
        backend: 'browser',
        engine: 'browser-js',
        languageId: 'javascript',
        requiredCapabilities: ['console'],
        files: { 'script.js': source },
        options: { runtime: exercise.runtime },
      });
      try {
        const finite = await runner.execute(
          request(
            'console.log(1); Promise.resolve(2).then(console.log); queueMicrotask(() => console.log(3));',
            'finite',
          ),
        );
        const constructor = await runner.execute(
          request(
            'Object.defineProperty(Promise.prototype,"constructor",{get(){console.log("getter accessed");throw new Error("private getter");}}); console.log("sealed");',
            'constructor',
          ),
        );
        const species = await runner.execute(
          request(
            'const Fake = {}; Object.defineProperty(Fake, Symbol.species, {get(){console.log("species accessed");throw new Error("private species");}}); Object.defineProperty(Promise.prototype,"constructor",{value:Fake}); console.log("sealed");',
            'species',
          ),
        );
        return { finite, constructor, species };
      } finally {
        await runner.dispose();
      }
    },
    { entry, exercise },
  );
  expect(actual.finite.status).toBe('succeeded');
  expect(actual.finite.console.map((row) => row.text)).toEqual(['1', '2', '3']);
  expect(actual.constructor.status).toBe('succeeded');
  expect(actual.constructor.console.map((row) => row.text)).toEqual(['sealed']);
  expect(actual.species.status).toBe('succeeded');
  expect(actual.species.console.map((row) => row.text)).toEqual(['sealed']);
  expect(errors).toEqual([]);
  await testInfo.attach('console-marker-evidence', {
    body: JSON.stringify({ actual, errors }, null, 2),
    contentType: 'application/json',
  });
});

test('学習者のnull拒否と末尾microtask例外は内部markerへ補完しない', async ({ page }, testInfo) => {
  await page.goto('./#/');
  const manifest = JSON.parse(await readFile('dist/.vite/manifest.json', 'utf8')) as Record<
    string,
    { file: string }
  >;
  const entry = manifest['src/features/learning/browserConsoleRuntime.ts']!.file;
  const actual = await page.evaluate(
    async ({ entry, exercise }) => {
      const runtime = (await import(new URL(entry, location.href).href)) as typeof ConsoleRuntime;
      const runner = runtime.selectBrowserConsoleRuntime(exercise, [exercise])!.createExecution();
      try {
        const cases = [
          { id: 'initial-null', source: 'Promise.reject(null);', expected: 'code-error' },
          {
            id: 'microtask-null',
            source: 'Promise.resolve().then(() => Promise.reject(null));',
            expected: 'code-error',
          },
          {
            id: 'queue-null',
            source: 'queueMicrotask(() => Promise.reject(null));',
            expected: 'code-error',
          },
          {
            id: 'chain-tail-null',
            source:
              'Promise.resolve().then(() => 1).then(() => 2).then(() => Promise.reject(null));',
            expected: 'code-error',
          },
          {
            id: 'queue-throw-null',
            source: 'queueMicrotask(() => {throw null;});',
            expected: 'code-error',
          },
          {
            id: 'fake-notification-api',
            source:
              'dispatchEvent(new PromiseRejectionEvent("unhandledrejection", {promise:Promise.reject(null),reason:null}));',
            expected: 'unsupported',
          },
        ];
        const results = [];
        for (const item of cases) {
          const result = await runner.execute({
            runId: item.id,
            exerciseSessionId: 'marker-boundary',
            executionRevision: 1,
            backend: 'browser',
            engine: 'browser-js',
            languageId: 'javascript',
            requiredCapabilities: ['console'],
            files: { 'script.js': item.source },
            options: { runtime: exercise.runtime },
          });
          results.push({ ...item, result });
        }
        return results;
      } finally {
        await runner.dispose();
      }
    },
    { entry, exercise },
  );
  for (const item of actual) {
    expect(item.result.status, item.id).toBe(item.expected);
    expect(item.result.console, item.id).toEqual([]);
  }
  await testInfo.attach('console-rejection-evidence', {
    body: JSON.stringify(actual, null, 2),
    contentType: 'application/json',
  });
});
