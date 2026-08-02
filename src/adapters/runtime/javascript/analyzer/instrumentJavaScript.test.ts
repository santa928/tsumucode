import { describe, expect, it } from 'vitest';
import { analyzeJavaScriptSource } from './instrumentJavaScript';

const baseInput = {
  requestId: 'request-1',
  exerciseSessionId: 'javascript:exercise-1',
  executionRevision: 3,
  file: 'script.js',
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
