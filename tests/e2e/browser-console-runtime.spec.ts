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

test('製品Console経路は暴走・旧run・停止を隔離し、同じサービスで再試行できる', async ({ page }) => {
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
        const first = runner.execute(request('while(true){}', 'old'));
        await new Promise((resolve) => setTimeout(resolve, 75));
        const second = runner.execute(request('console.log(42)', 'new'));
        const [oldRun, newRun] = await Promise.all([first, second]);
        const before = ticks;
        const loop = await runner.execute(
          request('queueMicrotask(function loop(){queueMicrotask(loop)});', 'microtask-loop'),
        );
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
          csp,
          oldRun,
          newRun,
          loop,
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
  expect(evidence.oldRun).toMatchObject({ runId: 'old', status: 'stopped' });
  expect(evidence.newRun).toMatchObject({
    runId: 'new',
    status: 'succeeded',
    console: [{ text: '42' }],
  });
  expect(evidence.loop.status).toBe('stopped');
  expect(evidence.responsiveTicks).toBeGreaterThan(0);
  expect(evidence.stopped.status).toBe('stopped');
  expect(evidence.retry).toMatchObject({ status: 'succeeded', console: [{ text: '43' }] });
  expect(evidence.disposed.status).toBe('stopped');
  expect(evidence.frames).toBe(0);
  expect(evidence.canary).toBe('unchanged');
});
