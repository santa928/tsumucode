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
