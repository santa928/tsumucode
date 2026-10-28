import { describe, expect, it } from 'vitest';
import { analyzeJavaScriptSource } from '../../../src/adapters/runtime/javascript/analyzer/instrumentJavaScript';
import { isJavaScriptAnalysisRequest } from '../../../src/adapters/runtime/javascript/analyzer/contracts';

const common = {
  requestId: 'react-facts',
  exerciseSessionId: 'reading',
  executionRevision: 1,
  guardIdentifier: '__tsumuBudget',
  sourceType: 'module',
  capabilityProfile: 'dom',
  entryFile: 'main.js',
} as const;
const policy = { factCollection: 'module-boundary' } as const;

describe('React用の未消費教材情報を減らす内部解析要求', () => {
  it('通常JSの256件上限を残し、Reactでは全moduleの安全解析と実行guardを残す', async () => {
    const declarations = (prefix: string) =>
      Array.from({ length: 90 }, (_, i) => `const ${prefix}${String(i)} = ${String(i)};`).join(
        '\n',
      );
    const files = {
      'main.js':
        "import { item } from './items.js';\n" +
        declarations('main') +
        '\nfor(let i=0;i<2;i++){console.log(item);}',
      'items.js': 'export const item=1;\n' + declarations('value'),
    };
    const full = await analyzeJavaScriptSource({ ...common, files });
    expect(full.status).toBe('failure');
    const request = { ...common, files, ...policy };
    expect(isJavaScriptAnalysisRequest(request)).toBe(true);
    const compact = await analyzeJavaScriptSource(request);
    expect(compact.status).toBe('success');
    if (compact.status !== 'success') throw new Error('内部解析が失敗しました');
    expect(compact.facts.every((fact) => fact.kind === 'module-boundary')).toBe(true);
    expect(compact.modules).toHaveLength(2);
    expect(compact.modules.find((m) => m.file === 'main.js')?.instrumentedCode).toContain(
      '__tsumuBudget',
    );
  });
  it('消費しないfactを除いても実行するソースとgraphのhashを変えない', async () => {
    const files = {
      'main.js':
        'export function count(){let sum=0;for(let i=0;i<2;i++){sum+=i;}return sum;} count();',
    };
    const full = await analyzeJavaScriptSource({ ...common, files });
    const request = { ...common, files, ...policy };
    const compact = await analyzeJavaScriptSource(request);
    expect(full.status).toBe('success');
    expect(compact.status).toBe('success');
    if (full.status !== 'success' || compact.status !== 'success')
      throw new Error('比較する解析に失敗しました');
    expect(compact.modules).toEqual(full.modules);
    expect(compact.graphSha256).toBe(full.graphSha256);
    expect(compact.facts.length).toBeLessThan(full.facts.length);
  });
  it.each(["fetch('/outside');", "import x from 'external-package'; console.log(x);"])(
    '情報収集を減らしても許可していない能力を拒否する: %s',
    async (source) => {
      const request = { ...common, files: { 'main.js': source }, ...policy };
      const result = await analyzeJavaScriptSource(request);
      expect(result).toMatchObject({
        status: 'failure',
        diagnostics: [expect.objectContaining({ kind: 'security' })],
      });
    },
  );
  it.each([256, 257])('内部要求も本物のmodule情報%s件の既存上限を守る', async (count) => {
    const source = Array.from(
      { length: count },
      (_, i) => `export const value${String(i)}=${String(i)};`,
    ).join('\n');
    const request = { ...common, files: { 'main.js': source }, ...policy };
    const result = await analyzeJavaScriptSource(request);
    if (count === 256) {
      expect(result.status).toBe('success');
      if (result.status === 'success') expect(result.facts).toHaveLength(256);
    } else
      expect(result).toMatchObject({
        status: 'failure',
        diagnostics: [expect.objectContaining({ kind: 'system' })],
      });
  });
  it('classic要求・未知の値・script型へ内部オプションを広げない', () => {
    const files = { 'main.js': 'console.log(1);' };
    expect(isJavaScriptAnalysisRequest({ ...common, files, factCollection: 'none' })).toBe(false);
    expect(isJavaScriptAnalysisRequest({ ...common, files, ...policy, sourceType: 'script' })).toBe(
      false,
    );
    const legacy = {
      requestId: common.requestId,
      exerciseSessionId: common.exerciseSessionId,
      executionRevision: common.executionRevision,
      guardIdentifier: common.guardIdentifier,
      sourceType: common.sourceType,
      capabilityProfile: common.capabilityProfile,
    };
    expect(
      isJavaScriptAnalysisRequest({
        ...legacy,
        file: 'main.js',
        source: 'console.log(1);',
        ...policy,
      }),
    ).toBe(false);
  });
});
