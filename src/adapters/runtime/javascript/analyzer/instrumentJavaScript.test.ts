import { parse } from 'acorn';
import { describe, expect, it } from 'vitest';
import { analyzeJavaScriptSource } from './instrumentJavaScript';

const baseInput = {
  requestId: 'request-1',
  exerciseSessionId: 'javascript:exercise-1',
  executionRevision: 3,
  file: 'script.js',
  sourceType: 'script',
  capabilityProfile: 'core',
  guardIdentifier: '__tsumuBudget',
} as const;

describe('analyzeJavaScriptSource', () => {
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
