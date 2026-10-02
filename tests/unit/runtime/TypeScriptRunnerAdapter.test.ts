import { describe, expect, it, vi } from 'vitest';
import type {
  RunnerAdapter,
  RunnerInput,
  RunnerRenderResult,
} from '../../../src/core/runtime/contracts';
import type { TypeScriptCompileResult } from '../../../src/adapters/runtime/typescript/compileTypeScript';
import { TypeScriptRunnerAdapter } from '../../../src/adapters/runtime/typescript/TypeScriptRunnerAdapter';
const input: RunnerInput = {
  exerciseSessionId: 'ts-runner',
  executionRevision: 1,
  languageId: 'typescript',
  files: { 'index.html': '<p>初期</p>', 'main.ts': 'console.log(1);' },
  assets: [],
  viewport: { id: 'desktop', width: 800, height: 600 },
  options: {
    runtime: {
      kind: 'typescript',
      entryFile: 'main.ts',
      sourceType: 'module',
      capabilityProfile: 'dom',
      primaryOutput: 'preview',
    },
  },
};
const ready: TypeScriptCompileResult = {
  status: 'ready',
  files: { 'main.js': 'console.log(1);' },
  sourceMaps: { 'main.js': '{}' },
};
const rendered: RunnerRenderResult = {
  exerciseSessionId: 'ts-runner',
  executionRevision: 1,
  diagnostics: [],
  console: [],
  evidence: [{ id: 'javascript.source-sha256', file: 'main.js', value: 'generated-hash' }],
};
/** 完了直前の取消を再現する制御可能なPromise。 */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
/** 実行開始と資源解放だけを観測するfake port。実隔離はBrowser検証に任せる。 */
function fixture(
  compile = vi.fn<() => Promise<TypeScriptCompileResult>>().mockResolvedValue(ready),
) {
  const compiler = { compile, dispose: vi.fn() };
  const runner = {
    languageId: 'javascript',
    prepare: vi.fn().mockResolvedValue(undefined),
    render: vi.fn().mockResolvedValue(rendered),
    stop: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn().mockResolvedValue(undefined),
    requestSnapshot: vi.fn(),
  } satisfies RunnerAdapter;
  const runnerFactory = vi.fn(() => runner);
  const adapter = new TypeScriptRunnerAdapter({ compilerFactory: () => compiler, runnerFactory });
  return { adapter, compiler, runner, runnerFactory };
}
describe('TypeScriptRunnerAdapter', () => {
  it('型エラーでは実行を作らず修正後だけJSを渡し、元TSと生成JS証拠を混同しない', async () => {
    const f = fixture(
      vi
        .fn<() => Promise<TypeScriptCompileResult>>()
        .mockResolvedValueOnce({
          status: 'type-error',
          diagnostics: [
            { code: 2322, message: 'Type mismatch', file: 'main.ts', line: 1, column: 1 },
          ],
        })
        .mockResolvedValue(ready),
    );
    await f.adapter.prepare(document.createElement('iframe'));
    const failed = await f.adapter.render(input);
    expect(failed).toMatchObject({
      evidence: [],
      diagnostics: [{ code: 'typescript-type-error-2322', file: 'main.ts' }],
    });
    expect(f.runnerFactory).not.toHaveBeenCalled();
    const result = await f.adapter.render(input);
    expect(result.evidence).toContainEqual(rendered.evidence[0]);
    expect(result.evidence.find(({ id }) => id === 'typescript.source-sha256')?.value).toMatch(
      /^[a-f0-9]{64}$/u,
    );
    expect(f.runner.render).toHaveBeenCalledWith(
      expect.objectContaining({
        languageId: 'javascript',
        files: { 'index.html': '<p>初期</p>', 'main.js': 'console.log(1);' },
      }),
    );
    expect(input.files['main.ts']).toBe('console.log(1);');
    await f.adapter.dispose();
  });
  it('型検査中の中止は即時確定し、遅延compileからRunnerを開始しない', async () => {
    const delayed = deferred<TypeScriptCompileResult>();
    const f = fixture(vi.fn(() => delayed.promise));
    await f.adapter.prepare(document.createElement('iframe'));
    const pending = f.adapter.render(input);
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => {
      expect(f.compiler.compile).toHaveBeenCalledOnce();
    });
    await f.adapter.stop();
    await rejected;
    delayed.resolve(ready);
    await Promise.resolve();
    expect(f.runnerFactory).not.toHaveBeenCalled();
    expect(f.compiler.dispose).toHaveBeenCalledOnce();
  });
  it('Runner準備中の置換で旧renderを起動せず、新しい不正入力でも旧Previewを解放する', async () => {
    const f = fixture();
    const preparing = deferred<undefined>();
    vi.mocked(f.runner.prepare).mockReturnValue(preparing.promise);
    await f.adapter.prepare(document.createElement('iframe'));
    const pending = f.adapter.render(input);
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => {
      expect(f.runner.prepare).toHaveBeenCalledOnce();
    });
    const invalid = f.adapter.render({
      ...input,
      files: { ...input.files, 'untyped.js': 'console.log(2);' },
    });
    await rejected;
    preparing.resolve(undefined);
    expect((await invalid).diagnostics[0]?.code).toBe('typescript-input');
    expect(f.runner.dispose).toHaveBeenCalledOnce();
    expect(f.runner.render).not.toHaveBeenCalled();
    await f.adapter.dispose();
  });
  it('Runner実行中の離脱は古い成功応答を返さず、破棄後も再開しない', async () => {
    const f = fixture();
    const running = deferred<RunnerRenderResult>();
    vi.mocked(f.runner.render).mockReturnValue(running.promise);
    await f.adapter.prepare(document.createElement('iframe'));
    const pending = f.adapter.render(input);
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => {
      expect(f.runner.render).toHaveBeenCalledOnce();
    });
    await f.adapter.dispose();
    await rejected;
    running.resolve(rendered);
    await expect(f.adapter.render(input)).rejects.toMatchObject({ name: 'AbortError' });
    await expect(f.adapter.prepare(document.createElement('iframe'))).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(f.runner.dispose).toHaveBeenCalledOnce();
  });

  it('Snapshotの遅延診断も元TSへ戻し、Consoleと実行identityを保持する', async () => {
    const compiled: TypeScriptCompileResult = {
      ...ready,
      sourceMaps: {
        'main.js': JSON.stringify({
          version: 3,
          file: 'main.js',
          sourceRoot: '',
          sources: ['main.ts'],
          names: [],
          mappings: 'AAAA',
        }),
      },
    };
    const f = fixture(vi.fn<() => Promise<TypeScriptCompileResult>>().mockResolvedValue(compiled));
    await f.adapter.prepare(document.createElement('iframe'));
    await f.adapter.render(input);
    const diagnostic = {
      code: 'late-error',
      kind: 'reference' as const,
      severity: 'error' as const,
      message: '遅延エラー',
      learnerMessage: '遅延エラー',
      file: 'main.js',
      line: 1,
      column: 1,
    };
    const observation = {
      diagnostics: [diagnostic],
      console: [{ sequence: 1, level: 'log' as const, text: '保持' }],
    };
    const snapshot = {
      exerciseSessionId: 'ts-runner',
      executionRevision: 1,
      viewport: input.viewport,
      nodes: [],
      documentOverflow: {
        x: false,
        y: false,
        scrollWidth: 800,
        scrollHeight: 600,
        clientWidth: 800,
        clientHeight: 600,
      },
      runtimeObservation: observation,
    };
    f.runner.requestSnapshot.mockResolvedValue(snapshot);
    const result = await f.adapter.requestSnapshot({
      exerciseSessionId: 'ts-runner',
      executionRevision: 1,
      requestId: 'snapshot-1',
      policy: {
        selectors: [],
        attributes: [],
        computedStyles: [],
        focusVisibleSelectors: [],
        focusVisibleComputedStyles: [],
        includeAllElements: false,
      },
      preserveTimers: true,
    });
    expect(result).toEqual({
      ...snapshot,
      runtimeObservation: {
        ...observation,
        diagnostics: [{ ...diagnostic, file: 'main.ts', line: 1, column: 1 }],
      },
    });
    expect(result.runtimeObservation?.console).toBe(observation.console);
    expect(snapshot.runtimeObservation.diagnostics[0]?.file).toBe('main.js');
    await f.adapter.dispose();
  });
});
