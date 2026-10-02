import { parse } from 'acorn';
import { describe, expect, it } from 'vitest';
import { analyzeJavaScriptSource, analyzeConsoleSourceFacts } from './instrumentJavaScript';

const baseInput = {
  requestId: 'request-1',
  exerciseSessionId: 'javascript:exercise-1',
  executionRevision: 3,
  file: 'script.js',
  sourceType: 'script',
  capabilityProfile: 'core',
  guardIdentifier: '__tsumuBudget',
} as const;

describe('Node source facts', () => {
  it('計算添字とPromiseを拒否せず、sourceを変換せず同じhashと教材factを返す', async () => {
    const source =
      'const values = [10]; const i = 0; Promise.resolve(values[i]).then(value => console.log(value));';
    const result = await analyzeConsoleSourceFacts({ ...baseInput, source });
    expect(result).toMatchObject({ status: 'success', instrumentedCode: source, diagnostics: [] });
    if (result.status !== 'success') throw new Error('Node facts failed');
    expect(result.sourceSha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(result.facts).toContainEqual(
      expect.objectContaining({ kind: 'binding', name: 'values' }),
    );
    expect(await analyzeJavaScriptSource({ ...baseInput, source })).toMatchObject({
      status: 'failure',
      diagnostics: [expect.objectContaining({ kind: 'unsupported' })],
    });
  });

  it('解析不能なsourceを合格や空factとして返さない', async () => {
    expect(await analyzeConsoleSourceFacts({ ...baseInput, source: 'const =' })).toMatchObject({
      status: 'failure',
      diagnostics: [expect.objectContaining({ kind: 'syntax' })],
    });
    expect(
      await analyzeConsoleSourceFacts({ ...baseInput, source: ' '.repeat(102401) }),
    ).toMatchObject({
      status: 'failure',
      diagnostics: [expect.objectContaining({ kind: 'system' })],
    });
  });
});

describe('analyzeJavaScriptSource', () => {
  it('指定bindingとFunction returnの計算を同じbindingのConsole利用へ結び付ける', async () => {
    const result = await analyzeJavaScriptSource({
      ...baseInput,
      source:
        'const a=3; const b=10; const total=b*a; function score(x,y){return x*y;} console.log(total); console.log(score(a,b));',
    });
    expect(result.status).toBe('success');
    if (result.status !== 'success') throw new Error('解析が成功しませんでした');
    expect(result.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'computed-output',
          ownerKind: 'binding',
          name: 'total',
          operator: '*',
          operands: [
            { kind: 'identifier', name: 'b' },
            { kind: 'identifier', name: 'a' },
          ],
        }),
        expect.objectContaining({
          kind: 'computed-output',
          ownerKind: 'return',
          name: 'score',
          operator: '*',
        }),
      ]),
    );
  });

  it('表示行だけの計算と同名shadow bindingのConsole利用を計算対象へ結び付けない', async () => {
    const result = await analyzeJavaScriptSource({
      ...baseInput,
      source:
        'const a=3; const b=10; const total=a*b; {const total=30; console.log(total);} function score(x,y){return x*y;} console.log(a*b);',
    });
    expect(result.status).toBe('success');
    if (result.status !== 'success') throw new Error('解析が成功しませんでした');
    expect(result.facts.filter(({ kind }) => kind === 'computed-output')).toEqual([]);
  });

  it('未使用Functionや条件分岐内のConsoleをtop-levelの正答出力と混同しない', async () => {
    const result = await analyzeJavaScriptSource({
      ...baseInput,
      source:
        'const a=3; const b=10; const total=a+b; function unused(){const total=a*b; console.log(total);} if(false){console.log(total);} console.log(a*b);',
    });
    expect(result.status).toBe('success');
    if (result.status !== 'success') throw new Error('解析が成功しませんでした');
    expect(result.facts.filter(({ kind }) => kind === 'computed-output')).toEqual([]);
  });

  it.each([
    [
      '同名Function再宣言',
      'function score(a,b){return a*b;} function score(a,b){return 30;} console.log(score(3,10));',
    ],
    [
      'Function再代入',
      'function score(a,b){return a*b;} score=function(a,b){return 30;}; console.log(score(3,10));',
    ],
    ['binding再宣言', 'var total=a*b; var total=30; console.log(total);'],
    ['binding再代入', 'let total=a*b; total=30; console.log(total);'],
    ['destructuring再代入', 'let total=a*b; [total]=[30]; console.log(total);'],
    ['更新演算子', 'let total=a*b; total++; console.log(total);'],
    ['既存bindingへのfor-of write', 'let total=a*b; for(total of [30]){} console.log(total);'],
    [
      'Function内の関連write',
      'let total=a*b; function overwrite(){total=30;} overwrite(); console.log(total);',
    ],
    [
      'switch discriminantの関連write',
      'let total=a*b; switch(total=30){case 30: let total=0; break;} console.log(total);',
    ],
    [
      'switch shadow未使用計算',
      'const total=30; switch(0){case 0:const total=a*b;break;} console.log(total);',
    ],
    ['for shadow未使用計算', 'const total=30; for(let total=a*b;false;){} console.log(total);'],
    [
      'local Consoleが引数を無視',
      'const print=console.log;const total=a*b;{const console={log(value){print(30);}};console.log(total);}',
    ],
  ])('%sを現在Consoleの計算根拠にしない', async (_label, source) => {
    const result = await analyzeJavaScriptSource({
      ...baseInput,
      source: 'const a=3; const b=10;' + source,
    });
    expect(result.status).toBe('success');
    if (result.status !== 'success') throw new Error('解析が成功しませんでした');
    expect(
      result.facts.filter((fact) => fact.kind === 'computed-output' && fact.scopeDepth === 0),
    ).toEqual([]);
  });

  it.each([
    'let total=a*b; console.log(total); total=0;',
    'const total=a*b; let other=0; other=30; console.log(total);',
    'const total=a*b; for(let total=0; total<1; total++){} console.log(total);',
    'const total=a*b; switch(0){case 0:let total=0;total=1;break;} console.log(total);',
    'const total=a*b; try{throw 0;}catch(total){total=1;} console.log(total);',
    'const total=a*b; function unused(total){total=0;} console.log(total);',
    'const total=a*b; function unused(console){console.log(0);} console.log(total);',
    'for(var total=a*b; false;){} console.log(total);',
    '{var total=a*b;} function unused(){var total=0;total=1;} console.log(total);',
  ])('出力後または別lexical bindingのwriteは計算根拠を失効しない: %s', async (source) => {
    const result = await analyzeJavaScriptSource({
      ...baseInput,
      source: 'const a=3; const b=10;' + source,
    });
    expect(result.status).toBe('success');
    if (result.status !== 'success') throw new Error('解析が成功しませんでした');
    expect(result.facts).toContainEqual(
      expect.objectContaining({ kind: 'computed-output', name: 'total', scopeDepth: 0 }),
    );
  });

  it('既存の明示scope Factを維持し、bindingはFor/Catchを含むlexical深さへ結び付ける', async () => {
    const result = await analyzeJavaScriptSource({
      ...baseInput,
      source:
        'for(let index=0;index<1;index++){const item=index;} try{throw 0;}catch(error){const caught=error;}',
    });
    expect(result.status).toBe('success');
    if (result.status !== 'success') throw new Error('解析が成功しませんでした');
    expect(result.facts.filter(({ kind }) => kind === 'scope')).toEqual([
      expect.objectContaining({ scopeKind: 'program', depth: 0 }),
      expect.objectContaining({ scopeKind: 'block', depth: 1 }),
      expect.objectContaining({ scopeKind: 'block', depth: 1 }),
      expect.objectContaining({ scopeKind: 'block', depth: 1 }),
    ]);
    expect(result.facts.filter(({ kind }) => kind === 'binding')).toEqual([
      expect.objectContaining({ name: 'index', scopeDepth: 1 }),
      expect.objectContaining({ name: 'item', scopeDepth: 2 }),
      expect.objectContaining({ name: 'caught', scopeDepth: 2 }),
    ]);
  });

  it.each(['async'] as const)(
    '遅延currentTargetは%sでは実行前に未対応とする',
    async (capabilityProfile) => {
      const source =
        "const button=document.querySelector('button');button.getRootNode().addEventListener('click',e=>{try{console.log(e.currentTarget);}catch{button.textContent='passed';}});setTimeout(()=>button.click(),10);";
      expect(
        await analyzeJavaScriptSource({ ...baseInput, capabilityProfile, source }),
      ).toMatchObject({
        status: 'failure',
        diagnostics: [expect.objectContaining({ kind: 'unsupported' })],
      });
    },
  );

  it.each([
    ['const { ownerDocument: doc } = event.target;', 'security'],
    ['const { defaultView: win } = event.target.getRootNode();', 'security'],
    ['const { "defaultView": win } = event.target.getRootNode();', 'security'],
    ['const { ["defaultView"]: win } = event.target.getRootNode();', 'security'],
    ['const { target: { ownerDocument: doc } } = event;', 'security'],
    ['let win; ({ defaultView: win } = node);', 'security'],
    ['function read({ defaultView: win = null }) { return win; }', 'security'],
    ['try { throw node; } catch ({ defaultView: win }) { console.log(win); }', 'security'],
    ['const { getOwnPropertyDescriptor: getter } = Object;', 'security'],
    ['const key = "textContent"; const { [key]: text } = event.target;', 'unsupported'],
  ])('分割代入によるproperty取得にも既存member境界を適用する: %s', async (source, kind) => {
    const result = await analyzeJavaScriptSource({
      ...baseInput,
      capabilityProfile: 'dom',
      source,
    });
    expect(result).toMatchObject({
      status: 'failure',
      diagnostics: [expect.objectContaining({ kind })],
    });
  });

  it('安全な分割代入・別名・既定値は維持する', async () => {
    const source =
      'const item = { score: 10, textContent: "safe" }; const { score: points = 0, textContent: defaultView } = item; console.log(points, defaultView);';
    expect(
      await analyzeJavaScriptSource({ ...baseInput, capabilityProfile: 'dom', source }),
    ).toMatchObject({ status: 'success', diagnostics: [] });
  });

  it.each([
    'event.currentTarget',
    '(() => { const { currentTarget: item } = event; return item; })()',
  ])('DOM profileでは保護getterを通るcurrentTargetを許可する: %s', async (access) => {
    const source = `document.querySelector('button').addEventListener('click', event => console.log(${access}.textContent));`;
    expect(
      await analyzeJavaScriptSource({ ...baseInput, capabilityProfile: 'dom', source }),
    ).toMatchObject({ status: 'success', diagnostics: [] });
  });

  it.each([
    'const items = [1]; const i = 0; console.log(items[i]);',
    'new Promise((resolve) => resolve(1));',
    'document.querySelector("button").currentTarget;',
  ])('標準JSの未対応を構文エラーや危険操作と区別する: %s', async (source) => {
    const result = await analyzeJavaScriptSource({ ...baseInput, source });
    expect(result).toMatchObject({
      status: 'failure',
      diagnostics: [
        {
          code: 'javascript-analyzer-unsupported',
          kind: 'unsupported',
          severity: 'error',
        },
      ],
    });
    expect(result.diagnostics[0]?.learnerMessage).toContain('この環境では未対応');
  });

  it('Workspace全体を解析して到達module・graph hash・全File factを返す', async () => {
    const request = {
      requestId: 'request-module-1',
      exerciseSessionId: 'javascript:exercise-1',
      executionRevision: 3,
      entryFile: 'src/main.js',
      files: {
        'src/main.js': "import { score } from './score.js';\nconsole.log(score);",
        'src/score.js': 'export const score = 1;',
        'src/unused.js': 'export const unused = true;',
      },
      sourceType: 'module',
      capabilityProfile: 'modules',
      guardIdentifier: '__tsumuBudget',
    } as const;

    const first = await analyzeJavaScriptSource(request as never);
    const second = await analyzeJavaScriptSource({
      ...request,
      requestId: 'request-module-2',
      files: {
        'src/unused.js': 'export const unused = true;',
        'src/score.js': 'export const score = 1;',
        'src/main.js': "import { score } from './score.js';\nconsole.log(score);",
      },
    } as never);

    expect(first.status).toBe('success');
    expect(second.status).toBe('success');
    if (first.status !== 'success' || second.status !== 'success') {
      throw new Error('Workspace解析が成功しませんでした');
    }
    const firstWorkspace = first as unknown as Readonly<Record<string, unknown>>;
    const secondWorkspace = second as unknown as Readonly<Record<string, unknown>>;
    expect(firstWorkspace.graphSha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(secondWorkspace.graphSha256).toBe(firstWorkspace.graphSha256);
    expect(firstWorkspace.modules).toEqual([
      expect.objectContaining({ file: 'src/score.js' }),
      expect.objectContaining({
        file: 'src/main.js',
        dependencies: [
          expect.objectContaining({ specifier: './score.js', resolvedFile: 'src/score.js' }),
        ],
      }),
    ]);
    expect(first.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'binding', file: 'src/score.js', name: 'score' }),
        expect.objectContaining({ kind: 'call', file: 'src/main.js', callee: 'console.log' }),
      ]),
    );
  });

  it('依存Moduleの構文エラーをsecurityではなくsyntax診断として位置付きで返す', async () => {
    const result = await analyzeJavaScriptSource({
      requestId: 'request-module-syntax',
      exerciseSessionId: 'javascript:exercise-1',
      executionRevision: 3,
      entryFile: 'src/main.js',
      files: {
        'src/main.js': "import './broken.js';",
        'src/broken.js': 'export const broken =',
      },
      sourceType: 'module',
      capabilityProfile: 'modules',
      guardIdentifier: '__tsumuBudget',
    });

    expect(result).toMatchObject({
      status: 'failure',
      diagnostics: [
        {
          kind: 'syntax',
          severity: 'error',
          file: 'src/broken.js',
          line: 1,
        },
      ],
    });
  });

  it('Workspace形状をscript sourceTypeとして直接渡してもfail closedにする', async () => {
    const result = await analyzeJavaScriptSource({
      requestId: 'request-module-wrong-source-type',
      exerciseSessionId: 'javascript:exercise-1',
      executionRevision: 3,
      entryFile: 'src/main.js',
      files: { 'src/main.js': 'console.log("blocked");' },
      sourceType: 'script',
      capabilityProfile: 'modules',
      guardIdentifier: '__tsumuBudget',
    } as never);

    expect(result).toMatchObject({
      status: 'failure',
      diagnostics: [{ kind: 'security', severity: 'error' }],
    });
  });

  it('LoopとFunctionへbudget guardを挿入しdirective prologueを維持する', async () => {
    const result = await analyzeJavaScriptSource({
      ...baseInput,
      source: [
        'function greet(name) {',
        '  "use strict";',
        '  while (name.length > 0) name = name.slice(1);',
        '  return name;',
        '}',
      ].join('\n'),
    });

    expect(result.status).toBe('success');
    if (result.status !== 'success') throw new Error('解析が成功しませんでした');
    expect(result.instrumentedCode.indexOf('"use strict"')).toBeLessThan(
      result.instrumentedCode.indexOf('__tsumuBudget.enterFunction()'),
    );
    expect(result.instrumentedCode).toContain('if (!__tsumuBudget.checkLoop()) break;');
    expect(result.instrumentedCode).toContain('if (!__tsumuBudget.enterFunction()) return;');
    expect(result.instrumentedCode).toContain('__tsumuBudget.leaveFunction();');
  });

  it('式形式のarrow functionを戻り値とfinally付きBlockへ変換する', async () => {
    const result = await analyzeJavaScriptSource({
      ...baseInput,
      source: 'const double = (value) => value * 2;',
    });

    expect(result.status).toBe('success');
    if (result.status !== 'success') throw new Error('解析が成功しませんでした');
    expect(result.instrumentedCode).toContain('if (!__tsumuBudget.enterFunction()) return;');
    expect(result.instrumentedCode).toContain('return (value * 2);');
    expect(result.instrumentedCode).toContain('finally{__tsumuBudget.leaveFunction();}');
  });

  it('丸括弧で囲んだobject literalを返すarrow functionも有効なJavaScriptへ変換する', async () => {
    const result = await analyzeJavaScriptSource({
      ...baseInput,
      source: 'const updated = questions.map((question) => ({ ...question, answered: true }));',
    });

    expect(result.status).toBe('success');
    if (result.status !== 'success') throw new Error('解析が成功しませんでした');
    expect(
      () => parse(result.instrumentedCode, { ecmaVersion: 'latest', sourceType: 'script' }),
      result.instrumentedCode,
    ).not.toThrow();
  });

  it('Event callbackと1行Loopを同時に変換しても有効なJavaScriptを生成する', async () => {
    const sources = [
      [
        "const element = document.querySelector('#message');",
        "element.addEventListener('click', () => {});",
        'while (true) element.click();',
      ].join('\n'),
      [
        "const element = document.querySelector('#message');",
        'const recurse = () => {',
        "  const next = document.createElement('button');",
        "  next.addEventListener('click', recurse);",
        '  next.click();',
        '};',
        "element.addEventListener('click', recurse);",
        'element.click();',
      ].join('\n'),
    ];

    for (const source of sources) {
      const result = await analyzeJavaScriptSource({
        ...baseInput,
        capabilityProfile: 'dom',
        source,
      });

      expect(result.status).toBe('success');
      if (result.status !== 'success') throw new Error('解析が成功しませんでした');
      expect(
        () => parse(result.instrumentedCode, { ecmaVersion: 'latest', sourceType: 'script' }),
        result.instrumentedCode,
      ).not.toThrow();
    }
  });

  it('同じsourceからSHA-256とValidator用factを決定的に生成する', async () => {
    const source = 'document.querySelector("#message").textContent = "こんにちは";';
    const first = await analyzeJavaScriptSource({ ...baseInput, source });
    const second = await analyzeJavaScriptSource({ ...baseInput, requestId: 'request-2', source });

    expect(first.status).toBe('success');
    expect(second.status).toBe('success');
    if (first.status !== 'success' || second.status !== 'success') {
      throw new Error('解析が成功しませんでした');
    }
    expect(first.sourceSha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(second.sourceSha256).toBe(first.sourceSha256);
    expect(first.facts).toContainEqual({
      kind: 'query-selector-text-content-assignment',
      selector: '#message',
      value: 'こんにちは',
      file: 'script.js',
      line: 1,
      column: 1,
    });
  });

  it('textContentを空にする代入もbounded factとして保持する', async () => {
    const result = await analyzeJavaScriptSource({
      ...baseInput,
      source: 'document.querySelector("#message").textContent = "";',
    });

    expect(result.status).toBe('success');
    if (result.status !== 'success') throw new Error('解析が成功しませんでした');
    expect(result.facts).toContainEqual({
      kind: 'query-selector-text-content-assignment',
      selector: '#message',
      value: '',
      file: 'script.js',
      line: 1,
      column: 1,
    });
  });

  it('binding・branch・loop・function・call・scope・closure factを位置付きで抽出する', async () => {
    const result = await analyzeJavaScriptSource({
      ...baseInput,
      source: [
        'const outer = 1;',
        'if (outer > 0) { let blockValue = 2; }',
        'for (const item of [1, 2]) { console.log(item); }',
        'function make(prefix) {',
        '  return (value) => prefix + value + outer;',
        '}',
      ].join('\n'),
    });

    expect(result.status).toBe('success');
    if (result.status !== 'success') throw new Error('解析が成功しませんでした');
    expect(result.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'scope', scopeKind: 'program', depth: 0 }),
        expect.objectContaining({
          kind: 'binding',
          name: 'outer',
          declarationKind: 'const',
        }),
        expect.objectContaining({ kind: 'branch', branchKind: 'if' }),
        expect.objectContaining({ kind: 'loop', loopKind: 'for-of' }),
        expect.objectContaining({
          kind: 'function',
          functionKind: 'declaration',
          parameterCount: 1,
        }),
        expect.objectContaining({ kind: 'function', functionKind: 'arrow', parameterCount: 1 }),
        expect.objectContaining({ kind: 'call', callee: 'console.log' }),
        expect.objectContaining({ kind: 'closure', capturedName: 'prefix' }),
        expect.objectContaining({ kind: 'closure', capturedName: 'outer' }),
      ]),
    );
    expect(result.facts.length).toBeLessThanOrEqual(256);
    for (const fact of result.facts) {
      expect(fact.line).toBeGreaterThanOrEqual(1);
      expect(fact.column).toBeGreaterThanOrEqual(1);
      for (const value of Object.values(fact)) {
        if (typeof value === 'string') expect(value.length).toBeLessThanOrEqual(128);
      }
    }
  });

  it('Collection・Destructuring・変換・Immutable update factを位置付きで抽出する', async () => {
    const result = await analyzeJavaScriptSource({
      ...baseInput,
      source: [
        "const questions = [{ text: 'HTML', answered: false }, { text: 'CSS', answered: false }];",
        'const first = questions[0];',
        'const second = questions.at(1);',
        'const [firstQuestion] = questions;',
        'const { text, answered } = firstQuestion;',
        'const labels = questions.map((question) => question.text);',
        'const visible = questions.filter((question) => !question.answered);',
        'const count = questions.reduce((total, _question) => total + 1, 0);',
        'const cloned = [...questions];',
        'const updated = questions.map((question) => ({ ...question, answered: true }));',
      ].join('\n'),
    });

    expect(result.status).toBe('success');
    if (result.status !== 'success') throw new Error('解析が成功しませんでした');
    expect(result.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'collection', collectionKind: 'array', entryCount: 2 }),
        expect.objectContaining({ kind: 'collection', collectionKind: 'object', entryCount: 2 }),
        expect.objectContaining({ kind: 'collection-access', accessKind: 'index' }),
        expect.objectContaining({ kind: 'collection-access', accessKind: 'at' }),
        expect.objectContaining({ kind: 'destructuring', patternKind: 'array', bindingCount: 1 }),
        expect.objectContaining({ kind: 'destructuring', patternKind: 'object', bindingCount: 2 }),
        expect.objectContaining({
          kind: 'collection-transform',
          method: 'map',
          callbackParameterCount: 1,
        }),
        expect.objectContaining({
          kind: 'collection-transform',
          method: 'filter',
          callbackParameterCount: 1,
        }),
        expect.objectContaining({
          kind: 'collection-transform',
          method: 'reduce',
          callbackParameterCount: 2,
        }),
        expect.objectContaining({ kind: 'immutable-update', updateKind: 'array-spread' }),
        expect.objectContaining({ kind: 'immutable-update', updateKind: 'object-spread' }),
        expect.objectContaining({ kind: 'immutable-update', updateKind: 'array-map' }),
      ]),
    );
  });

  it('named Module境界とthrow／catchをSource Factへ変換する', async () => {
    const result = await analyzeJavaScriptSource({
      requestId: 'request-data-module',
      exerciseSessionId: 'javascript:data-module',
      executionRevision: 1,
      entryFile: 'src/main.js',
      files: {
        'src/main.js': [
          "import { questions, scoreAnswer } from './questions.js';",
          'try {',
          "  if (questions.length === 0) throw new Error('問題文がありません');",
          '  console.log(scoreAnswer(true));',
          '} catch (error) {',
          '  console.log(error.message);',
          '}',
        ].join('\n'),
        'src/questions.js': [
          "export const questions = ['HTML'];",
          'export function scoreAnswer(correct) { return correct ? 10 : 0; }',
        ].join('\n'),
      },
      sourceType: 'module',
      capabilityProfile: 'modules',
      guardIdentifier: '__tsumuBudget',
    });

    expect(result.status).toBe('success');
    if (result.status !== 'success') throw new Error('解析が成功しませんでした');
    expect(result.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'module-boundary',
          boundaryKind: 'import',
          name: 'questions',
          file: 'src/main.js',
        }),
        expect.objectContaining({
          kind: 'module-boundary',
          boundaryKind: 'export',
          name: 'questions',
          file: 'src/questions.js',
        }),
        expect.objectContaining({ kind: 'error-flow', flowKind: 'throw', file: 'src/main.js' }),
        expect.objectContaining({ kind: 'error-flow', flowKind: 'catch', file: 'src/main.js' }),
        expect.objectContaining({
          kind: 'module-boundary',
          boundaryKind: 'import',
          name: 'scoreAnswer',
          file: 'src/main.js',
        }),
        expect.objectContaining({
          kind: 'module-boundary',
          boundaryKind: 'export',
          name: 'scoreAnswer',
          file: 'src/questions.js',
        }),
      ]),
    );
  });

  it('default import／exportは既存Runtimeどおり受理しnamed Module Factにはしない', async () => {
    const result = await analyzeJavaScriptSource({
      requestId: 'request-data-default-module',
      exerciseSessionId: 'javascript:data-default-module',
      executionRevision: 1,
      entryFile: 'src/main.js',
      files: {
        'src/main.js': "import questions from './questions.js';\nconsole.log(questions.length);",
        'src/questions.js': "export default ['HTML'];",
      },
      sourceType: 'module',
      capabilityProfile: 'modules',
      guardIdentifier: '__tsumuBudget',
    });

    expect(result.status).toBe('success');
    if (result.status !== 'success') throw new Error('解析が成功しませんでした');
    expect(result.facts).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: 'module-boundary' })]),
    );
  });

  it('Core教材用のliteral・演算・代入・else・return・binding scope factを抽出する', async () => {
    const result = await analyzeJavaScriptSource({
      ...baseInput,
      source: [
        "const questionText = '問題1';",
        'const questionNumber = 3;',
        'const ready = true;',
        'let score = 10;',
        'score += 5;',
        'score++;',
        'const total = questionNumber * score;',
        "const isCorrect = questionText === '問題1';",
        "if (isCorrect) { console.log(total); } else { console.log('不正解'); }",
        'function calculate(points) {',
        '  const localScore = points + 1;',
        '  return localScore;',
        '}',
      ].join('\n'),
    });

    expect(result.status).toBe('success');
    if (result.status !== 'success') throw new Error('解析が成功しませんでした');
    expect(result.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'literal', valueType: 'string' }),
        expect.objectContaining({ kind: 'literal', valueType: 'number' }),
        expect.objectContaining({ kind: 'literal', valueType: 'boolean' }),
        expect.objectContaining({ kind: 'binary-expression', operator: '*' }),
        expect.objectContaining({ kind: 'binary-expression', operator: '===' }),
        expect.objectContaining({ kind: 'assignment', name: 'score', operator: '+=' }),
        expect.objectContaining({ kind: 'assignment', name: 'score', operator: '++' }),
        expect.objectContaining({ kind: 'branch', branchKind: 'if', hasAlternate: true }),
        expect.objectContaining({ kind: 'return' }),
        expect.objectContaining({
          kind: 'binding',
          name: 'questionText',
          declarationKind: 'const',
          scopeDepth: 0,
        }),
        expect.objectContaining({
          kind: 'binding',
          name: 'localScore',
          declarationKind: 'const',
          scopeDepth: 1,
        }),
      ]),
    );
  });

  it('sourceTypeとProfileをparse／policyへ伝播する', async () => {
    const moduleResult = await analyzeJavaScriptSource({
      ...baseInput,
      sourceType: 'module',
      capabilityProfile: 'modules',
      source: 'export const value = 1;',
    });
    const coreDomResult = await analyzeJavaScriptSource({
      ...baseInput,
      source: 'document.createElement("button");',
    });
    const domResult = await analyzeJavaScriptSource({
      ...baseInput,
      capabilityProfile: 'dom',
      source: 'document.createElement("button");',
    });

    expect(moduleResult.status).toBe('success');
    expect(coreDomResult).toMatchObject({ status: 'failure' });
    expect(domResult.status).toBe('success');
  });

  it.each([
    ['const broken =', 'syntax'],
    ['fetch("https://example.com")', 'security'],
    ['x'.repeat(100 * 1024 + 1), 'system'],
    [`const value = "${'x'.repeat(64 * 1024 + 1)}";`, 'system'],
    [`const values = [${Array.from({ length: 10_001 }, () => '0').join(',')}];`, 'system'],
    [`${'['.repeat(300)}0${']'.repeat(300)}`, 'system'],
    ['value += 1;\n'.repeat(6_000), 'system'],
    ['const __tsumuBudget = {};', 'system'],
  ])('契約外sourceをdiagnosticへ変換する', async (source, kind) => {
    const result = await analyzeJavaScriptSource({ ...baseInput, source });

    expect(result.status).toBe('failure');
    if (result.status !== 'failure') throw new Error('解析が失敗しませんでした');
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]).toMatchObject({
      kind,
      severity: 'error',
      file: 'script.js',
    });
    expect(result.diagnostics[0]?.learnerMessage.length).toBeGreaterThan(0);
  });
});
