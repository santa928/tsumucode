/* global window, PracticeAPI, client, events, errors, completed */
import assert from 'node:assert/strict';
import process from 'node:process';
import console from 'node:console';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import { chromium, firefox, webkit } from '@playwright/test';

// One engine per invocation; no parallel browser or runtime execution.
const name = process.argv[2] ?? 'chromium';
assert.ok(Object.hasOwn({ chromium, firefox, webkit }, name));
const observations = [];
const outputDirectory = 'test-results/python-interactive';
await mkdir(outputDirectory, { recursive: true });
const common = {
  bundle: true,
  write: false,
  format: 'iife',
  platform: 'browser',
  logLevel: 'error',
  define: {
    'import.meta.url': JSON.stringify('https://python.invalid/pyodide.mjs'),
    'import.meta.env.BASE_URL': JSON.stringify('/'),
  },
  external: ['node:*', 'fs', 'path', 'url', 'crypto', 'ws'],
};
const worker = (
  await build({
    ...common,
    stdin: {
      contents: `import { initializePythonWorker } from './src/adapters/runtime/python/pythonWorker.ts';
import { loadPyodide } from './vendor/python/314.0.7/pyodide.mjs';
import createModule from './vendor/python/314.0.7/pyodide.asm.mjs';
initializePythonWorker(loadPyodide, createModule);`,
      resolveDir: process.cwd(),
      loader: 'ts',
    },
  })
).outputFiles[0].text;
const api = (
  await build({
    ...common,
    globalName: 'PracticeAPI',
    stdin: {
      contents: `export { BrowserPythonPracticeClient, supportsBrowserPythonPractice } from './src/adapters/runtime/python/BrowserPythonPracticeClient.ts';
export { loadPythonCore } from './src/adapters/runtime/python/loadPythonCore.ts';`,
      resolveDir: process.cwd(),
      loader: 'ts',
    },
  })
).outputFiles[0].text;
const prefix = '/python-runtime/314.0.7/';
const assets = {
  '/api.js': api,
  [prefix + 'worker.js']: worker,
  [prefix + 'worker.json']: JSON.stringify({
    sha256: createHash('sha256').update(worker).digest('hex'),
  }),
};
for (const [from, to] of [
  ['pyodide.asm.wasm', 'core.wasm'],
  ['python_stdlib.zip', 'stdlib.zip'],
  ['pyodide-lock.json', 'lock.json'],
])
  assets[prefix + to] = await readFile('vendor/python/314.0.7/' + from);
const server = createServer((req, res) => {
  if (req.url.endsWith('.js')) res.setHeader('content-type', 'text/javascript');
  res.end(
    assets[req.url] ??
      '<!doctype html><title>Python interactive runtime acceptance</title><script src="/api.js"></script>',
  );
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
let browser;
let page;
try {
  browser = await { chromium, firefox, webkit }[name].launch({ headless: true, timeout: 10000 });
  page = await browser.newPage();
  page.setDefaultTimeout(15000);
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  const supported = await page.evaluate(() => PracticeAPI.supportsBrowserPythonPractice());
  const begin = async (source) => {
    await page.evaluate((source) => {
      window.events = [];
      window.errors = [];
      window.client = new PracticeAPI.BrowserPythonPracticeClient(PracticeAPI.loadPythonCore);
      window.completed = client
        .start(
          {
            exerciseId: 'python-basics-ch01-l02-e01',
            contentRevision: 'acceptance',
            exerciseSessionId: 'runtime-acceptance',
            executionRevision: 1,
            files: { 'main.py': source },
          },
          (snapshot) => events.push(snapshot),
        )
        .catch((error) => errors.push(String(error)));
    }, source);
  };
  const wait = async (sequence) => {
    await page.waitForFunction(
      (sequence) =>
        events.at(-1)?.phase === 'waiting-input' &&
        events.at(-1)?.inputRequestSequence === sequence,
      sequence,
    );
  };
  const send = (sequence, line, eof = false) =>
    page.evaluate(
      async (value) => {
        await client.send(value.sequence, value.line, value.eof);
      },
      { sequence, line, eof },
    );
  const ended = async () => {
    await page.waitForFunction(() => events.at(-1)?.phase === 'ended' || errors.length > 0);
    return page.evaluate(async () => {
      await completed;
      return { ...events.at(-1), errors };
    });
  };
  const record = (test, result) => {
    observations.push({ test, result });
    console.log(name, test, result.reason ?? result);
  };
  if (!supported) {
    assert.notEqual(name, 'chromium', 'Chromiumの対話対応は必須');
    let coreRequests = 0;
    page.on('request', (request) => {
      if (request.url().includes(prefix)) coreRequests++;
    });
    await begin('print(input())');
    await page.waitForFunction(() => errors.length > 0);
    const errors = await page.evaluate(() => window.errors);
    assert.match(errors[0], /対話練習に未対応/u);
    assert.equal(coreRequests, 0);
    assert.equal(await page.locator('iframe').count(), 0);
    record('explicit-unsupported-without-core-or-frame', { errors, coreRequests });
  } else {
    await begin(
      'first = input()\nprint(first)\nsecond = input()\nprint(second)\nthird = input()\nprint(third)',
    );
    await page.waitForFunction(
      () => events.at(-1)?.phase === 'waiting-input' || events.at(-1)?.phase === 'ended',
    );
    const initialization = await page.evaluate(() => events.at(-1));
    if (initialization.reason === 'unsupported-runtime') {
      assert.notEqual(name, 'chromium', 'Chromiumの対話自己検査は必須');
      assert.equal(initialization.inputCount, 0);
      assert.equal(initialization.stdout, '');
      assert.equal(initialization.removed, true);
      record('explicit-unsupported-after-hardened-runtime-probe', initialization);
    } else {
      await wait(1);
      await send(1, 'santa');
      await assert.rejects(send(1, 'duplicate'), /入力待機/u);
      await wait(2);
      await send(2, '');
      await wait(3);
      await assert.rejects(send(3, 'あ'.repeat(342)), /1 KiB/u);
      await send(3, undefined, true);
      const eof = await ended();
      assert.equal(eof.reason, 'eof');
      assert.equal(eof.stdout, 'santa\n\n');
      assert.equal(eof.inputCount, 2);
      assert.equal(eof.inputBytes, 6);
      record('same-run-empty-eof-duplicate-and-byte-limit', eof);
      await assert.rejects(send(3, 'late'), /入力待機/u);

      await begin('print(input())');
      await wait(1);
      const stopped = await page.evaluate(() => client.stop());
      assert.equal(stopped.reason, 'cancelled');
      assert.equal(stopped.stdout, '');
      assert.equal(stopped.purged, true);
      await assert.rejects(send(1, 'late'), /入力待機/u);
      assert.equal(await page.locator('iframe').count(), 0);
      record('waiting-cancel-late-input-and-cleanup', stopped);

      await begin('print(input())');
      await wait(1);
      await send(1, 'recovered');
      const recovered = await ended();
      assert.equal(recovered.reason, 'completed');
      assert.equal(recovered.stdout, 'recovered\n');
      assert.notEqual(recovered.identity.runId, stopped.identity.runId);
      record('fresh-run-recovery', recovered);

      for (const [label, source, reason] of [
        [
          'compute-before-input',
          'for count in range(1000000000):\n    total = count\nprint(input())',
          'time-limit',
        ],
        [
          'compute-after-input',
          'print(input())\nfor count in range(1000000000):\n    total = count',
          'time-limit',
        ],
        ['output-limit', 'for count in range(1000000000):\n    print(count)', 'output-limit'],
        ['syntax-error', 'print(', 'code-error'],
        ['attribute-rejected', 'print(input.__globals__)', 'unsupported'],
        ['import-rejected', 'from js import Promise\nprint(input())', 'unsupported'],
        ['alias-rejected', 'read = input\nprint(read())', 'unsupported'],
      ]) {
        await begin(source);
        if (label === 'compute-after-input') {
          await wait(1);
          await send(1, 'go');
        }
        const result = await ended();
        assert.equal(result.reason, reason, JSON.stringify(result));
        assert.equal(result.removed, true);
        assert.deepEqual(result.errors, []);
        record(label, result);
      }
      await begin(Array.from({ length: 17 }, () => 'print(input())').join('\n'));
      for (let index = 1; index <= 16; index++) {
        await wait(index);
        await send(index, '');
      }
      await wait(17);
      await assert.rejects(send(17, 'line17'), /16行/u);
      await send(17, undefined, true);
      const limit = await ended();
      assert.equal(limit.reason, 'eof');
      assert.equal(limit.inputCount, 16);
      record('sixteen-lines-and-distinct-eof', limit);
    }
  }
} catch (error) {
  observations.push({
    test: 'failure-diagnostics',
    error: String(error),
    state: await page
      ?.evaluate(() => ({ events: window.events, errors: window.errors }))
      .catch(() => undefined),
  });
  console.log(JSON.stringify(observations.at(-1), null, 2));
  throw error;
} finally {
  await writeFile(
    `${outputDirectory}/${name}.json`,
    JSON.stringify(
      {
        engine: name,
        workerSha256: createHash('sha256').update(worker).digest('hex'),
        observedAt: new Date().toISOString(),
        observations,
      },
      null,
      2,
    ),
  );
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
