import { afterEach, describe, expect, it, vi } from 'vitest';
import { PREVIEW_PROTOCOL_VERSION } from '../../html-css/previewProtocol';
import type {
  JavaScriptAnalysisResult,
  JavaScriptWorkspaceAnalysisSuccess,
} from '../analyzer/contracts';
import { JavaScriptRunnerAdapter } from './JavaScriptRunnerAdapter';
import { JAVASCRIPT_PROTOCOL_VERSION } from './protocol';
import type {
  InteractionRequest,
  PreviewSnapshot,
  RunnerInput,
  SnapshotPolicy,
} from '../../../../core/runtime/contracts';

const snapshotPolicy: SnapshotPolicy = {
  selectors: ['#message'],
  attributes: ['id'],
  computedStyles: [],
  focusVisibleSelectors: [],
  focusVisibleComputedStyles: [],
  includeAllElements: false,
};

/** JavaScript Runnerの正常入力へ差分を重ねる。 */
function runnerInput(overrides: Partial<RunnerInput> = {}): RunnerInput {
  return {
    exerciseSessionId: 'session-1',
    executionRevision: 1,
    languageId: 'javascript',
    files: {
      'index.html': '<main><p id="message">変更前</p></main><script src="script.js"></script>',
      'styles.css': '#message { color: green; }',
      'script.js': 'document.querySelector("#message").textContent = "変更後";',
    },
    assets: [],
    viewport: { id: 'desktop', width: 1280, height: 720 },
    options: {
      runtime: {
        kind: 'javascript',
        entryFile: 'script.js',
        sourceType: 'script',
        capabilityProfile: 'core',
        primaryOutput: 'preview',
      },
    },
    ...overrides,
  };
}

/** 認証済みInteraction完了messageを送る。 */
function dispatchInteraction(
  frame: HTMLIFrameElement,
  requestId: string,
  oneTimeToken: string,
  frameGeneration: number,
  overrides: Readonly<Record<string, unknown>> = {},
): void {
  window.dispatchEvent(
    new MessageEvent('message', {
      source: frame.contentWindow,
      data: {
        version: JAVASCRIPT_PROTOCOL_VERSION,
        type: 'javascript.interaction-complete',
        exerciseSessionId: 'session-1',
        executionRevision: 1,
        frameGeneration,
        requestId,
        oneTimeToken,
        payload: { error: null, console: [] },
        ...overrides,
      },
    }),
  );
}

/** Analyzer成功結果をidentity付きで作る。 */
function analysisSuccess(
  executionRevision = 1,
  overrides: Partial<Extract<JavaScriptAnalysisResult, { status: 'success' }>> = {},
): Extract<JavaScriptAnalysisResult, { status: 'success' }> {
  return {
    status: 'success',
    requestId: 'analysis-1',
    exerciseSessionId: 'session-1',
    executionRevision,
    file: 'script.js',
    instrumentedCode: 'document.querySelector("#message").textContent = "変更後";',
    sourceSha256: 'a'.repeat(64),
    facts: [],
    diagnostics: [],
    ...overrides,
  };
}

/** Module graphのAnalyzer成功結果をidentity付きで作る。 */
function moduleAnalysisSuccess(): JavaScriptWorkspaceAnalysisSuccess {
  return {
    status: 'success',
    requestId: 'analysis-module',
    exerciseSessionId: 'session-1',
    executionRevision: 1,
    file: 'src/main.js',
    entryFile: 'src/main.js',
    graphSha256: 'b'.repeat(64),
    modules: [
      {
        file: 'src/score.js',
        instrumentedCode: 'export const score = 1;',
        dependencies: [],
      },
      {
        file: 'src/main.js',
        instrumentedCode: "import { score } from './score.js'; console.log(score);",
        dependencies: [
          {
            specifier: './score.js',
            resolvedFile: 'src/score.js',
            start: 22,
            end: 34,
          },
        ],
      },
    ],
    facts: [],
    diagnostics: [],
  };
}

/** srcdocに埋め込まれたbootstrap tokenを取得する。 */
function bootstrapToken(frame: HTMLIFrameElement): string {
  const token = /"bootstrapToken":"([a-z0-9_-]+)"/iu.exec(frame.srcdoc)?.[1];
  if (token === undefined) throw new Error('bootstrap tokenが見つかりません');
  return token;
}

/** JavaScript実行完了messageを任意sourceから送る。 */
function dispatchExecution(
  frame: HTMLIFrameElement,
  overrides: Readonly<Record<string, unknown>> = {},
  source: MessageEventSource | null = frame.contentWindow,
): void {
  window.dispatchEvent(
    new MessageEvent('message', {
      source,
      data: {
        version: JAVASCRIPT_PROTOCOL_VERSION,
        type: 'javascript.execution-complete',
        exerciseSessionId: 'session-1',
        executionRevision: 1,
        requestId: 'execution',
        oneTimeToken: bootstrapToken(frame),
        payload: {
          executed: true,
          budgetExhausted: false,
          timerLimitExceeded: false,
          runtimeError: null,
          console: [],
        },
        ...overrides,
      },
    }),
  );
}

/** 既存Snapshot Bridgeのreadyを送る。 */
function dispatchBridgeReady(frame: HTMLIFrameElement): void {
  window.dispatchEvent(
    new MessageEvent('message', {
      source: frame.contentWindow,
      data: {
        version: PREVIEW_PROTOCOL_VERSION,
        type: 'bridge.ready',
        exerciseSessionId: 'session-1',
        requestId: 'ready',
        oneTimeToken: bootstrapToken(frame),
        payload: null,
      },
    }),
  );
}

/** Protocol schemaを通る空Snapshotを作る。 */
function snapshot(): PreviewSnapshot {
  return {
    exerciseSessionId: 'session-1',
    executionRevision: 1,
    viewport: { id: 'desktop', width: 1280, height: 720 },
    nodes: [],
    documentOverflow: {
      x: false,
      y: false,
      scrollWidth: 1280,
      scrollHeight: 720,
      clientWidth: 1280,
      clientHeight: 720,
    },
  };
}

/** iframe準備などのPromise continuationを指定回数だけ進める。 */
async function flushMicrotasks(count = 30): Promise<void> {
  for (let index = 0; index < count; index += 1) await Promise.resolve();
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('JavaScriptRunnerAdapter', () => {
  it('Module Workspaceをiframe内実行Planへ変換してgraph hash Evidenceを返す', async () => {
    const analyzer = {
      analyze: vi.fn(async () => moduleAnalysisSuccess()),
      dispose: vi.fn(async () => undefined),
    };
    const frame = document.createElement('iframe');
    document.body.append(frame);
    const runner = new JavaScriptRunnerAdapter({ analyzer });
    await runner.prepare(frame);
    const input = runnerInput({
      files: {
        'index.html': '<main><p id="message">Module</p></main>',
        'styles.css': '#message { color: green; }',
        'src/main.js': "import { score } from './score.js'; console.log(score);",
        'src/score.js': 'export const score = 1;',
      },
      options: {
        runtime: {
          kind: 'javascript',
          entryFile: 'src/main.js',
          sourceType: 'module',
          capabilityProfile: 'modules',
          primaryOutput: 'console',
        },
      },
    });

    const pending = runner.render(input);
    await vi.waitFor(() => {
      expect(frame.srcdoc).not.toBe('');
    });
    dispatchExecution(frame);
    dispatchBridgeReady(frame);

    const result = await pending;
    expect(result.diagnostics).toEqual([]);
    expect(result.evidence).toContainEqual({ id: 'javascript.executed', value: true });
    expect(result.evidence).toContainEqual({
      id: 'javascript.module-graph-sha256',
      value: 'b'.repeat(64),
    });
    expect(analyzer.analyze).toHaveBeenCalledWith(
      expect.objectContaining({
        entryFile: 'src/main.js',
        files: {
          'src/main.js': "import { score } from './score.js'; console.log(score);",
          'src/score.js': 'export const score = 1;',
        },
      }),
    );
    expect(frame.srcdoc).toContain('sourceSegments');
    expect(frame.srcdoc).toContain('URL.createObjectURL');

    await runner.dispose();
  });

  it.each([
    ['language', { languageId: 'html-css' }],
    [
      'script path',
      {
        options: {
          runtime: {
            kind: 'javascript',
            entryFile: '../script.js',
            sourceType: 'script',
            capabilityProfile: 'core',
            primaryOutput: 'preview',
          },
        },
      },
    ],
    [
      'uppercase extension',
      {
        files: {
          'index.html': '<main>本文</main>',
          'script.JS': 'console.log("uppercase");',
        },
        options: {
          runtime: {
            kind: 'javascript',
            entryFile: 'script.JS',
            sourceType: 'script',
            capabilityProfile: 'core',
            primaryOutput: 'console',
          },
        },
      },
    ],
    ['script missing', { files: { 'index.html': '<main>本文</main>' } }],
    [
      'workspace size',
      {
        files: {
          'index.html': '<main>本文</main>',
          'script.js': 'x'.repeat(300 * 1024 + 1),
        },
      },
    ],
    ['unknown option', { options: { unexpected: true } }],
  ] satisfies readonly [string, Partial<RunnerInput>][])(
    '%s不正入力を遷移前に拒否する',
    async (_name, override) => {
      const analyzer = {
        analyze: vi.fn(async () => analysisSuccess()),
        dispose: vi.fn(async () => undefined),
      };
      const frame = document.createElement('iframe');
      document.body.append(frame);
      const runner = new JavaScriptRunnerAdapter({ analyzer });
      await runner.prepare(frame);

      await expect(runner.render(runnerInput(override))).rejects.toThrow();
      expect(frame.srcdoc).toBe('');
      expect(analyzer.analyze).not.toHaveBeenCalled();
      await runner.dispose();
    },
  );

  it('Runtime省略時はChapter 00互換設定でscript.jsを解析する', async () => {
    const analyzer = {
      analyze: vi.fn(async () => analysisSuccess()),
      dispose: vi.fn(async () => undefined),
    };
    const frame = document.createElement('iframe');
    document.body.append(frame);
    const runner = new JavaScriptRunnerAdapter({ analyzer });
    await runner.prepare(frame);
    const pending = runner.render(runnerInput({ options: {} }));
    await vi.waitFor(() => {
      expect(frame.srcdoc).not.toBe('');
    });
    dispatchExecution(frame);
    dispatchBridgeReady(frame);

    await expect(pending).resolves.toMatchObject({ diagnostics: [], console: [] });
    expect(analyzer.analyze).toHaveBeenCalledWith(
      expect.objectContaining({
        file: 'script.js',
        sourceType: 'script',
        capabilityProfile: 'core',
      }),
    );
    await runner.dispose();
  });

  it('sandboxを固定し、正しいwindow／identityの実行完了後だけevidenceを返す', async () => {
    const analyzer = {
      analyze: vi.fn(async () => analysisSuccess()),
      dispose: vi.fn(async () => undefined),
    };
    const frame = document.createElement('iframe');
    const wrongFrame = document.createElement('iframe');
    document.body.append(frame, wrongFrame);
    const runner = new JavaScriptRunnerAdapter({ analyzer });

    await runner.prepare(frame);
    const pending = runner.render(runnerInput());
    await vi.waitFor(() => {
      expect(frame.srcdoc).toContain('data-tsumucode-javascript-runtime');
    });
    expect(frame.srcdoc).not.toContain('blob:https://example.test/runtime');
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts');
    expect(frame.getAttribute('sandbox')).not.toContain('allow-same-origin');
    expect(frame.getAttribute('referrerpolicy')).toBe('no-referrer');

    let settled = false;
    void pending.then(() => {
      settled = true;
    });
    dispatchExecution(frame, {}, wrongFrame.contentWindow);
    dispatchExecution(frame, { executionRevision: 2 });
    dispatchExecution(frame, { oneTimeToken: 'wrong-token' });
    dispatchBridgeReady(frame);
    await Promise.resolve();
    expect(settled).toBe(false);
    dispatchExecution(frame);

    await expect(pending).resolves.toMatchObject({
      diagnostics: [],
      evidence: [
        { id: 'javascript.executed', value: true },
        { id: 'javascript.source-sha256', file: 'script.js', value: 'a'.repeat(64) },
        { id: 'javascript.budget-exhausted', value: false },
      ],
      console: [],
    });
    expect(analyzer.analyze).toHaveBeenCalledWith(
      expect.objectContaining({ sourceType: 'script', capabilityProfile: 'core' }),
    );
    await runner.dispose();
  });

  it('budget超過を不正解ではなく再試行可能なsystem診断へ変換する', async () => {
    const analyzer = {
      analyze: vi.fn(async () => analysisSuccess()),
      dispose: vi.fn(async () => undefined),
    };
    const frame = document.createElement('iframe');
    document.body.append(frame);
    const runner = new JavaScriptRunnerAdapter({ analyzer });
    await runner.prepare(frame);
    const pending = runner.render(runnerInput());
    await vi.waitFor(() => {
      expect(frame.srcdoc).not.toBe('');
    });
    dispatchBridgeReady(frame);
    dispatchExecution(frame, {
      payload: {
        executed: true,
        budgetExhausted: true,
        timerLimitExceeded: false,
        runtimeError: null,
        console: [],
      },
    });

    const result = await pending;
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ kind: 'system', code: 'javascript-budget' }),
    ]);
    expect(result.evidence).toContainEqual({
      id: 'javascript.budget-exhausted',
      value: true,
    });
    await runner.dispose();
  });

  it('学習コードerror前のConsole recordをRunner結果へ保持する', async () => {
    const analyzer = {
      analyze: vi.fn(async () => analysisSuccess()),
      dispose: vi.fn(async () => undefined),
    };
    const frame = document.createElement('iframe');
    document.body.append(frame);
    const runner = new JavaScriptRunnerAdapter({ analyzer });
    await runner.prepare(frame);
    const pending = runner.render(runnerInput());
    await vi.waitFor(() => {
      expect(frame.srcdoc).not.toBe('');
    });
    dispatchExecution(frame, {
      payload: {
        executed: false,
        budgetExhausted: false,
        timerLimitExceeded: false,
        runtimeError: { name: 'Error', message: 'stopped' },
        console: [{ sequence: 0, level: 'log', text: '<b>plain</b>' }],
      },
    });
    dispatchBridgeReady(frame);

    await expect(pending).resolves.toMatchObject({
      diagnostics: [expect.objectContaining({ code: 'javascript-runtime' })],
      console: [{ sequence: 0, level: 'log', text: '<b>plain</b>' }],
    });
    await runner.dispose();
  });

  it('Analyzer診断ではframeを更新せず同じ診断を返す', async () => {
    const failure: JavaScriptAnalysisResult = {
      status: 'failure',
      requestId: 'analysis-1',
      exerciseSessionId: 'session-1',
      executionRevision: 1,
      file: 'script.js',
      diagnostics: [
        {
          code: 'javascript-analyzer-syntax',
          kind: 'syntax',
          severity: 'error',
          message: 'Unexpected token',
          learnerMessage: '括弧を確認してください。',
          file: 'script.js',
          line: 1,
          column: 2,
        },
      ],
    };
    const analyzer = {
      analyze: vi.fn(async () => failure),
      dispose: vi.fn(async () => undefined),
    };
    const frame = document.createElement('iframe');
    document.body.append(frame);
    const runner = new JavaScriptRunnerAdapter({ analyzer });
    await runner.prepare(frame);

    await expect(runner.render(runnerInput())).resolves.toMatchObject({
      diagnostics: failure.diagnostics,
      evidence: [],
    });
    expect(frame.srcdoc).toBe('');
    await runner.dispose();
  });

  it('bridge／実行完了が期限内に来なければ未完成frameを破棄してsystem診断を返す', async () => {
    vi.useFakeTimers();
    const analyzer = {
      analyze: vi.fn(async () => analysisSuccess()),
      dispose: vi.fn(async () => undefined),
    };
    const frame = document.createElement('iframe');
    document.body.append(frame);
    const runner = new JavaScriptRunnerAdapter({
      analyzer,
      executionTimeoutMs: 50,
    });
    await runner.prepare(frame);
    const pending = runner.render(runnerInput());
    await flushMicrotasks();
    expect(frame.srcdoc).not.toBe('');

    await vi.advanceTimersByTimeAsync(50);
    const result = await pending;

    expect(result.diagnostics).toEqual([
      expect.objectContaining({ kind: 'system', code: 'javascript-runner-system' }),
    ]);
    expect(result.evidence).toEqual([]);
    expect(frame.srcdoc).toBe('');
    await runner.dispose();
  });

  it('新revisionのwatchdog失敗後は直前のready済みPreviewを同じidentityで復元する', async () => {
    vi.useFakeTimers();
    const analyzer = {
      analyze: vi.fn(async (input: { readonly executionRevision: number }) =>
        analysisSuccess(input.executionRevision, {
          requestId: `analysis-${String(input.executionRevision)}`,
        }),
      ),
      dispose: vi.fn(async () => undefined),
    };
    const frame = document.createElement('iframe');
    document.body.append(frame);
    const runner = new JavaScriptRunnerAdapter({
      analyzer,
      executionTimeoutMs: 50,
    });
    await runner.prepare(frame);

    const first = runner.render(runnerInput({ executionRevision: 1 }));
    await flushMicrotasks();
    dispatchExecution(frame);
    dispatchBridgeReady(frame);
    await first;
    const previousSrcdoc = frame.srcdoc;

    const second = runner.render(runnerInput({ executionRevision: 2 }));
    await flushMicrotasks();
    expect(frame.srcdoc).not.toBe(previousSrcdoc);
    await vi.advanceTimersByTimeAsync(50);
    await flushMicrotasks();
    expect(frame.srcdoc).toBe(previousSrcdoc);
    dispatchExecution(frame);
    dispatchBridgeReady(frame);

    const result = await second;
    expect(result.executionRevision).toBe(2);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ kind: 'system', code: 'javascript-runner-system' }),
    ]);
    expect(frame.srcdoc).toBe(previousSrcdoc);
    await runner.dispose();
  });

  it('Snapshot前にtimerを停止し、同じsession／revisionの応答だけを返す', async () => {
    const analyzer = {
      analyze: vi.fn(async () => analysisSuccess()),
      dispose: vi.fn(async () => undefined),
    };
    const frame = document.createElement('iframe');
    document.body.append(frame);
    const childWindow = frame.contentWindow!;
    const postMessage = vi.spyOn(childWindow, 'postMessage').mockImplementation(() => undefined);
    const runner = new JavaScriptRunnerAdapter({ analyzer });
    await runner.prepare(frame);
    const render = runner.render(runnerInput());
    await vi.waitFor(() => {
      expect(frame.srcdoc).not.toBe('');
    });
    dispatchExecution(frame);
    dispatchBridgeReady(frame);
    await render;

    const pending = runner.requestSnapshot({
      exerciseSessionId: 'session-1',
      executionRevision: 1,
      requestId: 'snapshot-1',
      policy: snapshotPolicy,
    });
    const clearRequest = postMessage.mock.calls[0]?.[0] as {
      readonly requestId: string;
      readonly oneTimeToken: string;
    };
    expect(clearRequest).toMatchObject({ type: 'javascript.clear-timers' });
    window.dispatchEvent(
      new MessageEvent('message', {
        source: childWindow,
        data: {
          version: JAVASCRIPT_PROTOCOL_VERSION,
          type: 'javascript.timers-cleared',
          exerciseSessionId: 'session-1',
          executionRevision: 1,
          requestId: clearRequest.requestId,
          oneTimeToken: clearRequest.oneTimeToken,
          payload: null,
        },
      }),
    );
    await vi.waitFor(() => {
      expect(postMessage).toHaveBeenCalledTimes(2);
    });
    const snapshotRequest = postMessage.mock.calls[1]?.[0] as {
      readonly oneTimeToken: string;
    };
    window.dispatchEvent(
      new MessageEvent('message', {
        source: childWindow,
        data: {
          version: PREVIEW_PROTOCOL_VERSION,
          type: 'snapshot.response',
          exerciseSessionId: 'session-1',
          requestId: 'snapshot-1',
          oneTimeToken: snapshotRequest.oneTimeToken,
          payload: snapshot(),
        },
      }),
    );

    await expect(pending).resolves.toEqual(snapshot());
    await runner.dispose();
  });

  it('active frame generationと一致するInteractionだけを送受信する', async () => {
    const analyzer = {
      analyze: vi.fn(async () => analysisSuccess()),
      dispose: vi.fn(async () => undefined),
    };
    const frame = document.createElement('iframe');
    document.body.append(frame);
    const postMessage = vi
      .spyOn(frame.contentWindow!, 'postMessage')
      .mockImplementation(() => undefined);
    const runner = new JavaScriptRunnerAdapter({ analyzer });
    await runner.prepare(frame);
    const rendering = runner.render(runnerInput());
    await vi.waitFor(() => {
      expect(frame.srcdoc).not.toBe('');
    });
    dispatchExecution(frame);
    dispatchBridgeReady(frame);
    const rendered = await rendering;
    expect(rendered.frameGeneration).toEqual(expect.any(Number));
    const frameGeneration = rendered.frameGeneration!;
    const request: InteractionRequest = {
      exerciseSessionId: 'session-1',
      executionRevision: 1,
      frameGeneration,
      requestId: 'interaction-1',
      action: { id: 'choose', kind: 'click', selector: '#answer' },
    };

    const pending = runner.interact(request);
    const message = postMessage.mock.calls[0]?.[0] as {
      readonly frameGeneration: number;
      readonly oneTimeToken: string;
      readonly requestId: string;
    };
    expect(message).toMatchObject({
      type: 'javascript.interact',
      frameGeneration,
      requestId: 'interaction-1',
    });
    dispatchInteraction(frame, message.requestId, message.oneTimeToken, frameGeneration + 1);
    dispatchInteraction(frame, message.requestId, message.oneTimeToken, frameGeneration);

    await expect(pending).resolves.toMatchObject({
      exerciseSessionId: 'session-1',
      executionRevision: 1,
      frameGeneration,
      requestId: 'interaction-1',
    });
    await expect(
      runner.interact({ ...request, frameGeneration: frameGeneration + 1 }),
    ).rejects.toThrow(/current/u);
    await runner.dispose();
  });

  it('focus InteractionはSnapshot取得後にだけ親画面のFocusを復元する', async () => {
    const analyzer = {
      analyze: vi.fn(async () => analysisSuccess()),
      dispose: vi.fn(async () => undefined),
    };
    const returnTarget = document.createElement('button');
    const frame = document.createElement('iframe');
    document.body.append(returnTarget, frame);
    returnTarget.focus();
    const postMessage = vi
      .spyOn(frame.contentWindow!, 'postMessage')
      .mockImplementation(() => undefined);
    const runner = new JavaScriptRunnerAdapter({ analyzer });
    await runner.prepare(frame);
    const rendering = runner.render(runnerInput());
    await vi.waitFor(() => {
      expect(frame.srcdoc).not.toBe('');
    });
    dispatchExecution(frame);
    dispatchBridgeReady(frame);
    const rendered = await rendering;
    const frameGeneration = rendered.frameGeneration!;

    const interaction = runner.interact({
      exerciseSessionId: 'session-1',
      executionRevision: 1,
      frameGeneration,
      requestId: 'interaction-focus',
      action: { id: 'focus-next', kind: 'focus', selector: '#next' },
    });
    const interactionMessage = postMessage.mock.calls.at(-1)?.[0] as {
      readonly oneTimeToken: string;
    };
    expect(document.activeElement).toBe(frame);
    dispatchInteraction(
      frame,
      'interaction-focus',
      interactionMessage.oneTimeToken,
      frameGeneration,
    );
    await interaction;
    expect(document.activeElement).toBe(frame);

    const pendingSnapshot = runner.requestSnapshot({
      exerciseSessionId: 'session-1',
      executionRevision: 1,
      requestId: 'snapshot-after-focus',
      policy: snapshotPolicy,
      preserveTimers: true,
    });
    const snapshotMessage = postMessage.mock.calls.at(-1)?.[0] as {
      readonly oneTimeToken: string;
    };
    window.dispatchEvent(
      new MessageEvent('message', {
        source: frame.contentWindow,
        data: {
          version: PREVIEW_PROTOCOL_VERSION,
          type: 'snapshot.response',
          exerciseSessionId: 'session-1',
          requestId: 'snapshot-after-focus',
          oneTimeToken: snapshotMessage.oneTimeToken,
          payload: snapshot(),
        },
      }),
    );

    await expect(pendingSnapshot).resolves.toEqual(snapshot());
    expect(document.activeElement).toBe(returnTarget);
    await runner.dispose();
  });

  it('readyより遅れて届く初回loadを外部navigationとして誤判定しない', async () => {
    const analyzer = {
      analyze: vi.fn(async () => analysisSuccess()),
      dispose: vi.fn(async () => undefined),
    };
    const frame = document.createElement('iframe');
    document.body.append(frame);
    const runner = new JavaScriptRunnerAdapter({ analyzer });
    await runner.prepare(frame);
    const render = runner.render(runnerInput());
    await vi.waitFor(() => {
      expect(frame.srcdoc).not.toBe('');
    });
    dispatchExecution(frame);
    dispatchBridgeReady(frame);
    await render;

    frame.dispatchEvent(new Event('load'));

    expect(frame.srcdoc).not.toBe('');
    await runner.dispose();
  });

  it('ready後にiframe navigationが再発したらactive Previewを破棄する', async () => {
    const analyzer = {
      analyze: vi.fn(async () => analysisSuccess()),
      dispose: vi.fn(async () => undefined),
    };
    const frame = document.createElement('iframe');
    document.body.append(frame);
    const runner = new JavaScriptRunnerAdapter({ analyzer });
    await runner.prepare(frame);
    const render = runner.render(runnerInput());
    await vi.waitFor(() => {
      expect(frame.srcdoc).not.toBe('');
    });
    frame.dispatchEvent(new Event('load'));
    dispatchExecution(frame);
    dispatchBridgeReady(frame);
    await render;

    frame.dispatchEvent(new Event('load'));

    expect(frame.srcdoc).toBe('');
    await expect(
      runner.requestSnapshot({
        exerciseSessionId: 'session-1',
        executionRevision: 1,
        requestId: 'after-navigation',
        policy: snapshotPolicy,
      }),
    ).rejects.toThrow('not current');
    await runner.dispose();
  });
});
