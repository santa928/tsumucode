import { describe, expect, it, vi } from 'vitest';
import { ReactRunnerAdapter } from '../../../src/adapters/runtime/react/ReactRunnerAdapter';
import type { ReactCompileResult } from '../../../src/adapters/runtime/react/compilerContract';
import {
  READING_CARD_MAIN,
  READING_TYPES,
  READING_DATA,
  READING_HTML,
} from '../../../src/adapters/runtime/react/readingListScaffold';
import {
  STATIC_COMPONENTS_MAIN,
  STATIC_COMPONENTS_TYPES,
  STATIC_COMPONENTS_HTML,
} from '../../../src/adapters/runtime/react/staticComponentsScaffold';
import type {
  InteractionRequest,
  InteractionResult,
  RunnerAdapter,
  RunnerInput,
} from '../../../src/core/runtime/contracts';

// この単体検証はadapter境界だけを扱い、Compiler・JS解析の実体はBrowserで確認する。
vi.mock('../../../src/adapters/runtime/react/ReactModuleAnalyzer', () => ({
  prepareReactModules: () => ({}),
  ReactModuleAnalyzer: vi.fn(),
}));

const missing =
  'JavaScript interaction failed (target-not-found): Interaction target was not found';
const request: InteractionRequest = {
  exerciseSessionId: 'reading',
  executionRevision: 1,
  frameGeneration: 7,
  requestId: 'click',
  action: { id: 'finish-stars', kind: 'click', selector: '#toggle-stars' },
};
/** 描画を準備した同じ世代から返る既知bridgeエラーだけを再現する。 */
async function fixture(reading = true) {
  const ready: ReactCompileResult = {
    status: 'ready',
    files: { 'main.js': 'export {};' },
    sourceMaps: {},
  };
  const interact = vi
    .fn<(input: InteractionRequest) => Promise<InteractionResult>>()
    .mockRejectedValue(new Error(missing));
  const runner = {
    languageId: 'javascript',
    prepare: vi.fn().mockResolvedValue(undefined),
    render: vi
      .fn()
      .mockResolvedValue({
        exerciseSessionId: 'reading',
        executionRevision: 1,
        frameGeneration: 7,
        diagnostics: [],
        console: [],
        evidence: [],
      }),
    requestSnapshot: vi.fn(),
    interact,
    stop: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn().mockResolvedValue(undefined),
  } satisfies RunnerAdapter;
  const adapter = new ReactRunnerAdapter({
    compilerFactory: () => ({ compile: async () => ready, dispose: vi.fn() }),
    runnerFactory: () => runner,
  });
  const input: RunnerInput = {
    exerciseSessionId: 'reading',
    executionRevision: 1,
    languageId: 'react',
    assets: [],
    viewport: { id: 'desktop', width: 1280, height: 900 },
    files: reading
      ? {
          'main.tsx': READING_CARD_MAIN,
          'types.ts': READING_TYPES,
          'data.ts': READING_DATA,
          'BookCard.tsx': 'export function BookCard() { return <li>未完成</li>; }',
          'index.html': READING_HTML,
        }
      : {
          'main.tsx': STATIC_COMPONENTS_MAIN,
          'types.ts': STATIC_COMPONENTS_TYPES,
          'components.tsx': 'export function App() { return <section>未完成</section>; }',
          'index.html': STATIC_COMPONENTS_HTML,
        },
    options: {
      runtime: {
        kind: 'react',
        entryFile: 'main.tsx',
        sourceType: 'module',
        capabilityProfile: 'dom',
        primaryOutput: 'preview',
        profile: reading ? 'reading-card-v1' : 'static-components-v1',
        learningGoal: reading ? 'reading-card' : 'composition',
      },
    },
  };
  await adapter.prepare(document.createElement('iframe'));
  const result = await adapter.render(input);
  expect(result.diagnostics).toEqual([]);
  return { adapter, interact };
}

describe('読書課題の操作対象がないときの診断', () => {
  it('未完成buttonを基盤障害や成功操作にせず、学習者の診断へ返す', async () => {
    const f = await fixture();
    const result = await f.adapter.interact(request);
    expect(result).toMatchObject({
      exerciseSessionId: 'reading',
      executionRevision: 1,
      frameGeneration: 7,
      requestId: 'click',
      console: [],
      diagnostics: [{ code: 'react-interaction-target', kind: 'reference', severity: 'error' }],
    });
    expect(result.submitEvidence).toBeUndefined();
    await f.adapter.dispose();
  });
  it.each([missing + ' 別の例外', '別の基盤エラー'])(
    '既知の全文と一致しない例外を変換しない: %s',
    async (message) => {
      const f = await fixture();
      f.interact.mockRejectedValue(new Error(message));
      await expect(f.adapter.interact(request)).rejects.toThrow(message);
      await f.adapter.dispose();
    },
  );
  it('読書以外のprofileへ例外分類を広げない', async () => {
    const f = await fixture(false);
    await expect(f.adapter.interact(request)).rejects.toThrow(missing);
    await f.adapter.dispose();
  });
  it('停止した世代の遅い既知エラーも取消として扱う', async () => {
    const f = await fixture();
    let reject!: (error: Error) => void;
    f.interact.mockReturnValue(
      new Promise((_resolve, fail) => {
        reject = fail;
      }),
    );
    const pending = f.adapter.interact(request);
    const assertion = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await f.adapter.stop();
    reject(new Error(missing));
    await assertion;
    await f.adapter.dispose();
  });
});
