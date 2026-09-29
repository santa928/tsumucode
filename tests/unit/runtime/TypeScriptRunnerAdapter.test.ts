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
});
