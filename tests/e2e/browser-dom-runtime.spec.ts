import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import type * as JavaScriptRuntime from '../../src/adapters/runtime/javascript';

test('保護getterの設置に失敗した実frameでは学習コードを開始しない', async ({ page }) => {
  await page.addInitScript(() => {
    if (window === window.parent) return;
    const descriptor = Object.getOwnPropertyDescriptor(Event.prototype, 'currentTarget');
    if (descriptor === undefined) throw new Error('Missing native descriptor');
    Object.defineProperty(Event.prototype, 'currentTarget', { ...descriptor, configurable: false });
  });
  await page.goto('./#/');
  const manifest = JSON.parse(await readFile('dist/.vite/manifest.json', 'utf8')) as Record<
    string,
    { file: string }
  >;
  const entry = manifest['src/adapters/runtime/javascript/index.ts']?.file;
  expect(entry).toBeDefined();
  const result = await page.evaluate(async (entry) => {
    const { JavaScriptRunnerAdapter } = (await import(
      /* @vite-ignore */ new URL(entry!, location.href).href
    )) as typeof JavaScriptRuntime;
    const runner = new JavaScriptRunnerAdapter();
    const frame = document.createElement('iframe');
    document.body.append(frame);
    try {
      await runner.prepare(frame);
      return await runner.render({
        exerciseSessionId: 'guard-setup-failure',
        executionRevision: 1,
        languageId: 'javascript',
        files: {
          'index.html': '<!doctype html><html><body><button>button</button></body></html>',
          'styles.css': '',
          'script.js': 'console.log("learner-started");',
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
    } finally {
      await runner.dispose();
      frame.remove();
    }
  }, entry);
  expect(result.diagnostics).toContainEqual(
    expect.objectContaining({ kind: 'system', code: 'javascript-current-target-setup' }),
  );
  expect(result.console).toEqual([]);
  expect(result.evidence).toContainEqual({ id: 'javascript.executed', value: false });
});

test('製品DOMのcurrentTargetはnativeイベントを保ち、未対応状態を初回と操作後へ伝える', async ({
  page,
}) => {
  await page.goto('./#/');
  const manifest = JSON.parse(await readFile('dist/.vite/manifest.json', 'utf8')) as Record<
    string,
    { file: string }
  >;
  const entry = manifest['src/adapters/runtime/javascript/index.ts']?.file;
  expect(entry).toBeDefined();
  const evidence = await page.evaluate(async (entry) => {
    const { JavaScriptRunnerAdapter } = (await import(
      /* @vite-ignore */ new URL(entry!, location.href).href
    )) as typeof JavaScriptRuntime;
    const runner = new JavaScriptRunnerAdapter();
    const frame = document.createElement('iframe');
    document.body.append(frame);
    await runner.prepare(frame);
    let revision = 0;
    /** 実製品の解析・bootstrap・認証済み結果を使い、各sourceを新frameで実行する。 */
    const run = async (source: string, clicks = 1) => {
      revision += 1;
      const result = await runner.render({
        exerciseSessionId: 'dom-current-target',
        executionRevision: revision,
        languageId: 'javascript',
        files: {
          'index.html':
            '<!doctype html><html lang="ja"><body><div id="ancestor"><button id="button"><span id="child">DOM button</span></button></div></body></html>',
          'styles.css': '',
          'script.js': source,
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
      const interactions = [];
      if (!result.diagnostics.some(({ severity }) => severity === 'error')) {
        for (let count = 0; count < clicks; count += 1) {
          interactions.push(
            await runner.interact({
              exerciseSessionId: 'dom-current-target',
              executionRevision: revision,
              frameGeneration: result.frameGeneration!,
              requestId: `action-${String(revision)}-${String(count)}`,
              action: { id: 'click', kind: 'click', selector: '#child' },
            }),
          );
        }
      }
      return { result, interactions };
    };
    try {
      const native = await run(`
        const button=document.querySelector('#button');
        const child=document.querySelector('#child');
        const ancestor=document.querySelector('#ancestor');
        let saved;
        function read(event) { saved=event; console.log(event.target===child,event.currentTarget===button,this===button); }
        button.addEventListener('click',read);
        ancestor.addEventListener('click',event=>console.log(event.currentTarget===ancestor),{once:true});
        child.click();
        console.log(saved.currentTarget===null);
        button.removeEventListener('click',read);
        child.click();
        const detached=document.createElement('button');
        detached.addEventListener('click',event=>console.log(event.currentTarget===detached));
        detached.click();
        const listener={handleEvent(event){const {currentTarget:element}=event;console.log(element.textContent,this===listener);}};
        button.addEventListener('click',listener);
      `);
      const documentTarget = await run(
        "const button=document.querySelector('#button');button.getRootNode().addEventListener('click',e=>console.log(e.target.textContent));",
      );
      const sticky = await run(
        "const button=document.querySelector('#button');button.getRootNode().addEventListener('click',e=>{try{console.log(e.currentTarget);}catch{console.log('caught');}},{once:true});button.addEventListener('click',e=>console.log(e.currentTarget.textContent));",
        2,
      );
      const initial = await run(
        "const button=document.querySelector('#button');button.getRootNode().addEventListener('click',e=>{try{console.log(e.currentTarget);}catch{console.log('caught');}});button.click();",
      );
      const escaped = await run(
        "const button=document.querySelector('#button');const {defaultView:win}=button.getRootNode();console.log(win);",
      );
      const loop = await run('while(true){}', 0);
      const retry = await run(
        "document.querySelector('#button').addEventListener('click',e=>console.log(e.currentTarget.textContent));",
      );
      return { native, documentTarget, sticky, initial, escaped, loop, retry };
    } finally {
      await runner.dispose();
      frame.remove();
    }
  }, entry);
  expect(evidence.native.result.diagnostics).toEqual([]);
  expect(evidence.native.interactions[0]?.console.map(({ text }) => text)).toEqual([
    'true true true',
    'true',
    'true',
    'true',
    'DOM button true',
  ]);
  expect(evidence.native.interactions[0]?.diagnostics).toEqual([]);
  expect(evidence.documentTarget.interactions[0]?.console.map(({ text }) => text)).toEqual([
    'DOM button',
  ]);
  expect(evidence.documentTarget.interactions[0]?.diagnostics).toEqual([]);
  expect(evidence.sticky.interactions).toHaveLength(2);
  for (const interaction of evidence.sticky.interactions) {
    expect(interaction.diagnostics).toContainEqual(
      expect.objectContaining({
        kind: 'unsupported',
        code: 'javascript-current-target-unsupported',
      }),
    );
  }
  expect(evidence.initial.result.diagnostics).toContainEqual(
    expect.objectContaining({ kind: 'unsupported' }),
  );
  expect(evidence.escaped.result.diagnostics).toContainEqual(
    expect.objectContaining({ kind: 'security' }),
  );
  expect(evidence.loop.result.diagnostics).toContainEqual(
    expect.objectContaining({ code: 'javascript-budget' }),
  );
  expect(evidence.retry.result.diagnostics).toEqual([]);
  expect(evidence.retry.interactions[0]?.diagnostics).toEqual([]);
  expect(evidence.retry.interactions[0]?.console.map(({ text }) => text)).toEqual(['DOM button']);
});
