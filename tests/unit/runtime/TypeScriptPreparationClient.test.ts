// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { TypeScriptPreparationClient } from '../../../src/adapters/runtime/typescript/TypeScriptPreparationClient';
import {
  compileTypeScript,
  type TypeScriptCompileResult,
} from '../../../src/adapters/runtime/typescript/compileTypeScript';
import { analyzeJavaScriptSource } from '../../../src/adapters/runtime/javascript/analyzer/instrumentJavaScript';
import type { JavaScriptWorkspaceAnalysisResult } from '../../../src/adapters/runtime/javascript/analyzer/contracts';

const input = {
  sessionId: 'ts-preparation',
  revision: 1,
  entryFile: 'main.ts',
  files: { 'main.ts': 'console.log(1);' },
  capabilityProfile: 'modules' as const,
  guardIdentifier: '__guard',
};
const ready = { status: 'ready' as const, files: { 'main.js': 'console.log(1);' } };
const failure: JavaScriptWorkspaceAnalysisResult = {
  status: 'failure',
  requestId: 'request',
  exerciseSessionId: input.sessionId,
  executionRevision: input.revision,
  file: 'main.js',
  diagnostics: [],
};

/** Workerの応答タイミングを固定し、取消とawait境界の競合を再現する。 */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const require = createRequire(import.meta.url);
const libDir = path.dirname(require.resolve('typescript'));
const libraries = Object.fromEntries(
  readdirSync(libDir)
    .filter((name) => /^lib\..*\.d\.ts$/u.test(name))
    .map((name) => [name, readFileSync(path.join(libDir, name), 'utf8')]),
);

/** 実compilerと実Analyzerを同じ契約で接続。CPU実行を伴うこのportはNodeテスト専用。 */
function realClient() {
  return new TypeScriptPreparationClient({
    compilerFactory: () => ({
      compile: async (value) => compileTypeScript(value.files, libraries),
      dispose: () => {},
    }),
    analyzerFactory: () => ({
      analyze: (value) => analyzeJavaScriptSource({ ...value, requestId: 'actual-analysis' }),
      dispose: async () => {},
    }),
  });
}

describe('TypeScriptから既存安全解析への準備境界', () => {
  it('型検査が失敗したらAnalyzerを起動せず、開始ファイル不在も拒否する', async () => {
    const diagnostics = {
      status: 'type-error' as const,
      diagnostics: [{ code: 2322, message: 'wrong type', file: 'main.ts', line: 1, column: 1 }],
    };
    const analyzerFactory = vi.fn();
    const dispose = vi.fn();
    const client = new TypeScriptPreparationClient({
      compilerFactory: () => ({ compile: async () => diagnostics, dispose }),
      analyzerFactory,
    });
    expect(await client.prepare(input)).toEqual({ stage: 'compile', result: diagnostics });
    expect(dispose).toHaveBeenCalledOnce();
    expect(await client.prepare({ ...input, entryFile: 'missing.ts' })).toMatchObject({
      result: { status: 'invalid-input' },
    });
    expect(analyzerFactory).not.toHaveBeenCalled();
  });

  it('compile完了と中止が競合しても古いJSを解析せず、再要求では固定した入力を使う', async () => {
    const pendingCompile = deferred<TypeScriptCompileResult>();
    const dispose = vi.fn();
    const analyze = vi.fn(async () => failure);
    const analyzerFactory = vi.fn(() => ({ analyze, dispose: async () => {} }));
    const client = new TypeScriptPreparationClient({
      compilerFactory: () => ({ compile: () => pendingCompile.promise, dispose }),
      analyzerFactory,
    });
    const first = client.prepare(input);
    const aborted = expect(first).rejects.toMatchObject({ name: 'AbortError' });
    pendingCompile.resolve(ready);
    client.cancel();
    await aborted;
    expect(analyzerFactory).not.toHaveBeenCalled();
    const changed = { ...input, revision: 2, files: { ...input.files } };
    const next = client.prepare(changed);
    changed.revision = 99;
    changed.files['main.ts'] = 'changed';
    expect(await next).toEqual({ stage: 'analysis', result: failure });
    expect(analyze).toHaveBeenCalledWith(
      expect.objectContaining({
        executionRevision: 2,
        files: ready.files,
        entryFile: 'main.js',
        sourceType: 'module',
      }),
    );
    expect(dispose).toHaveBeenCalledTimes(2);
  });

  it('解析中の要求置換は両資源を破棄し、古い結果を返さず、dispose後の再利用を拒否する', async () => {
    const pendingAnalysis = deferred<JavaScriptWorkspaceAnalysisResult>();
    const enteredAnalysis = deferred<undefined>();
    const compilerDispose = vi.fn();
    const analyzerDispose = vi.fn(async () => {});
    const client = new TypeScriptPreparationClient({
      compilerFactory: () => ({ compile: async () => ready, dispose: compilerDispose }),
      analyzerFactory: () => ({
        analyze: () => {
          enteredAnalysis.resolve(undefined);
          return pendingAnalysis.promise;
        },
        dispose: analyzerDispose,
      }),
    });
    const first = client.prepare(input);
    const aborted = expect(first).rejects.toMatchObject({ name: 'AbortError' });
    await enteredAnalysis.promise;
    // 不正な次入力でも、前の要求を生かしたままにしない。
    expect(await client.prepare({ ...input, entryFile: 'missing.ts' })).toMatchObject({
      result: { status: 'invalid-input' },
    });
    await aborted;
    pendingAnalysis.resolve(failure);
    expect(compilerDispose).toHaveBeenCalledOnce();
    expect(analyzerDispose).toHaveBeenCalledOnce();
    client.dispose();
    await expect(client.prepare(input)).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('Worker生成障害は型誤りや合格にせず、環境障害として返す', async () => {
    const client = new TypeScriptPreparationClient({
      compilerFactory: () => {
        throw new Error('blocked');
      },
    });
    expect(await client.prepare(input)).toMatchObject({
      stage: 'environment',
      result: { status: 'environment-error' },
    });
  });

  it('実型検査済みの複数moduleを既存Analyzerで計装し、生成JSの位置を維持する', async () => {
    const source = {
      'main.ts': 'import { twice } from "./score.js";\nconsole.log(twice(3));',
      'score.ts': 'export function twice(value: number): number { return value * 2; }',
    };
    const client = realClient();
    const result = await client.prepare({ ...input, files: source });
    expect(result).toMatchObject({
      stage: 'analysis',
      result: { status: 'success', entryFile: 'main.js' },
    });
    if (result.stage === 'analysis' && result.result.status === 'success') {
      expect(result.result.modules.map((module) => module.file).sort()).toEqual([
        'main.js',
        'score.js',
      ]);
      expect(
        result.result.modules.some((module) => module.instrumentedCode.includes('__guard')),
      ).toBe(true);
      expect(result.result.facts.every((fact) => fact.file.endsWith('.js'))).toBe(true);
    }
    expect(source['score.ts']).toContain(': number');
    client.dispose();
  });

  it('型が正しいfetchも既存Analyzerで拒否し、型検査成功を実行許可にしない', async () => {
    const client = realClient();
    const result = await client.prepare({
      ...input,
      files: { 'main.ts': 'fetch("https://example.invalid");' },
    });
    expect(result).toMatchObject({ stage: 'analysis', result: { status: 'failure' } });
    if (result.stage === 'analysis')
      expect(result.result.diagnostics).toEqual(
        expect.arrayContaining([expect.objectContaining({ kind: 'security' })]),
      );
    client.dispose();
  });
});
