import { expect, test } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import type * as JavaScriptRuntime from '../../src/adapters/runtime/javascript';
import { loadJavaScriptRunnerModulePath } from './helpers/javascriptRunnerModule';
import { testBasePath } from './helpers/testBasePath';

test('projectの動的index readは実Array/Stringと非負整数だけを一度評価する', async ({ page }) => {
  // テスト側だけでaccessor/prototypeを持つ実Arrayを用意し、guardがgetterを呼ばないことを観測する。
  await page.addInitScript(() => {
    if (window === window.parent) return;
    const target = window as typeof window & {
      indexedAccessorArray: unknown[];
      indexedAccessorReads: number;
      indexedPrototypeArray: unknown[];
      indexedPrototypeReads: number;
    };
    target.indexedAccessorReads = 0;
    target.indexedAccessorArray = [];
    Object.defineProperty(target.indexedAccessorArray, '0', {
      get() {
        target.indexedAccessorReads += 1;
        return 'escaped';
      },
    });
    target.indexedPrototypeReads = 0;
    target.indexedPrototypeArray = [];
    Object.setPrototypeOf(target.indexedPrototypeArray, {
      get 999() {
        target.indexedPrototypeReads += 1;
        return 'escaped';
      },
    });
  });
  await page.goto(testBasePath());
  const entry = await loadJavaScriptRunnerModulePath();
  const actual = await page.evaluate(async (entry) => {
    const { JavaScriptRunnerAdapter } = (await import(
      /* @vite-ignore */ new URL(entry, location.href).href
    )) as typeof JavaScriptRuntime;
    const runner = new JavaScriptRunnerAdapter();
    const frame = document.createElement('iframe');
    document.body.append(frame);
    await runner.prepare(frame);
    let revision = 0;
    /** 実Analyzerから認証済みRunner結果まで同じprofileで観測する。 */
    async function run(source: string, profile: 'project' | 'dom' = 'project') {
      revision += 1;
      return runner.render({
        exerciseSessionId: 'project-index',
        executionRevision: revision,
        languageId: 'javascript',
        files: {
          'index.html':
            '<!doctype html><html lang="ja"><body><button id="button">回答</button></body></html>',
          'styles.css': '',
          'main.js': source,
        },
        assets: [],
        viewport: { id: 'desktop', width: 1280, height: 720 },
        options: {
          runtime: {
            kind: 'javascript',
            entryFile: 'main.js',
            sourceType: 'script',
            capabilityProfile: profile,
            primaryOutput: 'preview',
          },
        },
      });
    }
    try {
      const valid = await run(
        'let receivers=0,keys=0;function receiver(){receivers+=1;return [[7]];}function key(){keys+=1;return 0;}const i=0;console.log(receiver()[key()][i],receivers,keys);const text="ab";console.log(text[i]);console.log((receivers+=1,[9])[(keys+=1,0)],receivers,keys);',
      );
      const invalid = [];
      for (const key of [
        '"constructor"',
        '"owner"+"Document"',
        '"__proto__"',
        '"\\u0063onstructor"',
        '-1',
        'NaN',
        'Infinity',
        '0.5',
        '"0"',
      ])
        invalid.push(
          await run('const a=[7],key=' + key + ';console.log(a[key]);console.log("escaped");'),
        );
      for (const receiver of [
        '{0:"escaped"}',
        'function(){return "escaped";}',
        'document.querySelector("#button")',
        'document.querySelectorAll("button")',
      ])
        invalid.push(
          await run('const a=' + receiver + ',key=0;console.log(a[key]);console.log("escaped");'),
        );
      invalid.push(
        await run(
          'Array.isArray=()=>true;Number.isSafeInteger=()=>true;const a={0:"escaped"},key=0;console.log(a[key]);',
        ),
      );
      invalid.push(
        await run('const a=[1],key="constructor";try{a[key];}catch{}console.log("caught");'),
      );
      invalid.push(
        await run(
          'const Error=Proxy;const a=new Error([1],{get(){return "escaped";}});const i=0;console.log(a[i]);',
        ),
      );
      invalid.push(
        await run(
          'const a=[1],key={valueOf(){console.log("escaped");return 0;}};try{a[key];}catch{}',
        ),
      );
      const accessor = await run(
        'const i=0;try{indexedAccessorArray[i];}catch{}console.log(indexedAccessorReads);',
      );
      const prototype = await run(
        'const i=999;console.log(indexedPrototypeArray[i],indexedPrototypeReads);',
      );
      const astRejected = [];
      for (const source of [
        'const a=[1],i=0;a[i]=2;',
        'const a=[1],i=0;a[i]++;',
        'const a=[console.log],i=0;a[i]();',
        'const a=[1],i=0;const {[i]:value}=a;',
        'const i=0;document[i];',
        'const i=0;navigator[i];',
        'const a=[1],i=0;[a[i]]=[2];',
        'const a=[1],i=0;({value:a[i]}={value:2});',
        'const a=[1],i=0;for(a[i] of [2]){}',
        'const a=[1],i=0;for(a[i] in {value:2}){}',
        'const a=[console.log],i=0;a[i]``;',
        'const a=[console.log],i=0;a[i]?.();',
        'const a=[console.log],i=0;a[i].call();',
        'const a=[console.log],i=0;a[i].apply();',
        'const a=null,i=0;a?.[i];',
      ])
        astRejected.push(await run(source));
      const otherProfile = await run('const a=[7],i=0;console.log(a[i]);', 'dom');
      const literal = await run('console.log([7][0]);const a=null;console.log(a?.[0]);');
      const onClick = await run(
        'document.querySelector("#button").addEventListener("click",()=>{const a=[1],key="constructor";try{a[key];}catch{}console.log("caught");});',
      );
      const interaction = await runner.interact({
        exerciseSessionId: 'project-index',
        executionRevision: revision,
        frameGeneration: onClick.frameGeneration!,
        requestId: 'caught-action',
        action: { id: 'caught-action', kind: 'click', selector: '#button' },
      });
      return {
        valid,
        invalid,
        astRejected,
        otherProfile,
        accessor,
        prototype,
        literal,
        onClick,
        interaction,
      };
    } finally {
      await runner.dispose();
      frame.remove();
    }
  }, entry);
  await writeFile(
    test.info().outputPath('project-index-evidence.json'),
    JSON.stringify(actual, null, 2),
  );
  expect(actual.valid.diagnostics).toEqual([]);
  expect(actual.valid.console.map(({ text }) => text)).toEqual(['7 1 1', 'a', '9 2 2']);
  expect(actual.valid.evidence).toContainEqual({ id: 'javascript.executed', value: true });
  expect(actual.accessor.console.map(({ text }) => text)).toEqual(['0']);
  expect(actual.accessor.diagnostics).toContainEqual(
    expect.objectContaining({ code: 'javascript-index-unsupported', kind: 'unsupported' }),
  );
  expect(actual.prototype.console.map(({ text }) => text)).toEqual(['undefined 0']);
  expect(actual.prototype.diagnostics).toEqual([]);
  expect(actual.literal.console.map(({ text }) => text)).toEqual(['7', 'undefined']);
  expect(actual.literal.diagnostics).toEqual([]);
  expect(actual.onClick.diagnostics).toEqual([]);
  expect(actual.interaction.diagnostics).toContainEqual(
    expect.objectContaining({ code: 'javascript-index-unsupported', kind: 'unsupported' }),
  );
  for (const result of [...actual.invalid, ...actual.astRejected, actual.otherProfile]) {
    expect(result.diagnostics.some(({ severity }) => severity === 'error')).toBe(true);
    expect(result.console.map(({ text }) => text).join('\n')).not.toContain('escaped');
    // 解析段階で拒否したSourceには実行evidenceがない。いずれも実行成功を宣言しない。
    expect(result.evidence).not.toContainEqual({ id: 'javascript.executed', value: true });
  }
});
