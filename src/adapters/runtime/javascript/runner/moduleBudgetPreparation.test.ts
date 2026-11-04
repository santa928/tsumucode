import { expect, it, vi } from 'vitest';
import {
  createJavaScriptExecutionSource,
  createJavaScriptModuleExecutionSource,
} from './bridgeSource';

/** 実guardの時計だけを制御し、Module取得を既知のtrusted loaderへ置き換える。 */
async function observe(program: string, preparationMs = 0, module = true) {
  const frame = document.createElement('iframe');
  document.body.append(frame);
  const child = frame.contentWindow as Window & typeof globalThis;
  let clock = 0;
  const now = vi.spyOn(child.performance, 'now').mockImplementation(() => clock);
  const messages: unknown[] = [];
  const post = vi.spyOn(child.parent, 'postMessage').mockImplementation((message) => {
    messages.push(message);
  });
  // 別Realmのconstructorを使い、guardによる無効化をホストへ持ち出さない。
  class LoaderURL extends child.URL {}
  Object.defineProperty(LoaderURL, 'createObjectURL', { value: () => 'blob:entry' });
  Object.defineProperty(LoaderURL, 'revokeObjectURL', { value: () => undefined });
  Object.defineProperty(child, 'URL', { configurable: true, value: LoaderURL });
  Object.defineProperty(child, '__advanceBudgetClock', {
    value: (elapsed: number) => {
      clock += elapsed;
    },
  });
  const identity = {
    exerciseSessionId: 'budget-test',
    executionRevision: 1,
    frameGeneration: 1,
    bootstrapToken: 'fixed-test-token',
  };
  try {
    let source: string;
    if (module) {
      const original = createJavaScriptModuleExecutionSource({
        ...identity,
        runtimeKey: '__budgetTestRuntime',
        moduleGraph: {
          entryFile: 'main.js',
          graphSha256: 'a'.repeat(64),
          modules: [{ file: 'main.js', sourceSegments: ['export {};'], dependencyFiles: [] }],
        },
      });
      expect(original).toContain('return import(entryUrl);');
      // 前置きの注入そのものはprepareModuleGraphの別テストと実Browserで検査する。
      source = original.replace(
        'return import(entryUrl);',
        `
        return Promise.resolve().then(()=>{
          globalThis.__advanceBudgetClock(${preparationMs.toString()});
          runtime.beginModuleEvaluation();
          ${program}
        });
      `,
      );
    } else {
      source = createJavaScriptExecutionSource({
        ...identity,
        guardIdentifier: '__budgetTestGuard',
        instrumentedCode: 'const runtime=__budgetTestGuard;' + program,
      });
    }
    child.document.open();
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- 既存guard試験と同じparser実行。
    child.document.write(`<!doctype html><p id="result"></p><script>${source}</script>`);
    child.document.close();
    await expect
      .poll(() =>
        messages.some(
          (message) =>
            typeof message === 'object' &&
            message !== null &&
            'type' in message &&
            message.type === 'javascript.execution-complete',
        ),
      )
      .toBe(true);
    const execution = messages.find(
      (message) =>
        typeof message === 'object' &&
        message !== null &&
        'type' in message &&
        message.type === 'javascript.execution-complete',
    );
    return { execution, text: child.document.querySelector('#result')?.textContent };
  } finally {
    now.mockRestore();
    post.mockRestore();
    frame.remove();
  }
}

const work = (elapsed: number) => `
  if(runtime.enterFunction()){
    document.querySelector('#result').textContent='ran';
    globalThis.__advanceBudgetClock(${elapsed.toString()});
    runtime.checkLoop();
  }
  runtime.leaveFunction();
`;

it.each([
  { name: '準備0ms・短い処理', preparationMs: 0, workMs: 1, exhausted: false },
  { name: '準備300ms・短い処理', preparationMs: 300, workMs: 1, exhausted: false },
  { name: '準備0ms・処理300ms', preparationMs: 0, workMs: 300, exhausted: true },
])('$nameを実行予算と区別する', async ({ preparationMs, workMs, exhausted }) => {
  const result = await observe(work(workMs), preparationMs);
  expect(result.execution).toMatchObject({
    payload: { budgetExhausted: exhausted, runtimeError: null },
  });
  expect(result.text).toBe('ran');
});

it.each([
  {
    name: '最初のcheckpoint前のcall-free処理',
    program: 'globalThis.__advanceBudgetClock(300);' + work(1),
  },
  {
    name: '2Moduleの本体処理の合計',
    program:
      'globalThis.__advanceBudgetClock(140);runtime.checkLoop();runtime.beginModuleEvaluation();globalThis.__advanceBudgetClock(140);runtime.checkLoop();',
  },
  {
    name: '繰り返す開始通知での延命',
    program:
      'for(let i=0;i<10;i++){globalThis.__advanceBudgetClock(30);runtime.beginModuleEvaluation();runtime.checkLoop();}',
  },
  {
    name: '再通知後のcheckpoint上限',
    program:
      'for(let i=0;i<80000;i++)runtime.checkLoop();runtime.beginModuleEvaluation();for(let i=0;i<30000;i++)runtime.checkLoop();',
  },
  {
    name: '再通知後の関数深さ上限',
    program: 'for(let i=0;i<33;i++){runtime.beginModuleEvaluation();runtime.enterFunction();}',
  },
])('$nameを除外しない', async ({ program }) => {
  const result = await observe(program);
  expect(result.execution).toMatchObject({
    payload: { budgetExhausted: true, runtimeError: null },
  });
});

it.each([1, 300])('classic処理%smsの既存予算を保つ', async (elapsed) => {
  const result = await observe(work(elapsed), 0, false);
  expect(result.execution).toMatchObject({
    payload: { budgetExhausted: elapsed > 250, runtimeError: null },
  });
});
