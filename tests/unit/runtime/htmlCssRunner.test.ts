import { afterEach, describe, expect, it, vi } from 'vitest';
import { diagnoseSyntax } from '../../../src/adapters/runtime/html-css/diagnoseSyntax';
import { HtmlCssRunnerAdapter } from '../../../src/adapters/runtime/html-css/HtmlCssRunnerAdapter';
import {
  materializePreviewAssets,
  type MaterializePreviewAssetsOptions,
  type PreviewAssetFetch,
} from '../../../src/adapters/runtime/html-css/materializePreviewAssets';
import { PREVIEW_PROTOCOL_VERSION } from '../../../src/adapters/runtime/html-css/previewProtocol';
import type {
  PreviewSnapshot,
  ResolvedPreviewAsset,
  RunnerInput,
  SnapshotPolicy,
} from '../../../src/core/runtime/contracts';

const policy: SnapshotPolicy = {
  selectors: ['main'],
  attributes: ['id'],
  computedStyles: ['display'],
  focusVisibleSelectors: [],
  focusVisibleComputedStyles: [],
  includeAllElements: false,
};

/** 安全なRunner入力へ差分を重ねる。 */
function runnerInput(overrides: Partial<RunnerInput> = {}): RunnerInput {
  return {
    exerciseSessionId: 'session-1',
    executionRevision: 1,
    languageId: 'html-css',
    files: { 'index.html': '<main>hello</main>' },
    assets: [],
    viewport: { id: 'desktop', width: 1280, height: 720 },
    options: {},
    ...overrides,
  };
}

/** Test用iframeをDOMへ接続する。 */
function createFrame(): HTMLIFrameElement {
  const frame = document.createElement('iframe');
  document.body.append(frame);
  return frame;
}

/** srcdocへ埋め込まれた認証tokenを取得する。 */
function bootstrapToken(frame: HTMLIFrameElement): string {
  const match = /"bootstrapToken":"([a-z0-9_-]+)"/iu.exec(frame.srcdoc);
  if (match?.[1] === undefined) throw new Error('Bootstrap token not found');
  return match[1];
}

/** 現在のframeから正しいBridge readyを送る。 */
function dispatchReady(
  frame: HTMLIFrameElement,
  exerciseSessionId = 'session-1',
  token = bootstrapToken(frame),
): void {
  window.dispatchEvent(
    new MessageEvent('message', {
      source: frame.contentWindow,
      data: {
        version: PREVIEW_PROTOCOL_VERSION,
        type: 'bridge.ready',
        exerciseSessionId,
        requestId: 'ready',
        oneTimeToken: token,
        payload: null,
      },
    }),
  );
}

/** Protocol schemaを通る最小Snapshotを生成する。 */
function snapshot(executionRevision = 1): PreviewSnapshot {
  return {
    exerciseSessionId: 'session-1',
    executionRevision,
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

/** Responseに検証対象の最終URLを付けたfetch結果を作る。 */
function response(blob: Blob, url = `${window.location.origin}/assets/item`): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      if (blob.size > 0) controller.enqueue(new Uint8Array(blob.size));
      controller.close();
    },
  });
  return {
    ok: true,
    status: 200,
    url,
    headers: new Headers({
      'content-length': String(blob.size),
      'content-type': blob.type,
    }),
    body,
    blob: async () => blob,
  } as Response;
}

/** Promise continuationを指定回数進め、iframe lifecycleの中間状態を観測可能にする。 */
async function flushMicrotasks(count = 20): Promise<void> {
  for (let index = 0; index < count; index += 1) await Promise.resolve();
}

/** Asset materializeへURL API spyとfetch stubを注入する。 */
function materializeOptions(
  fetchValue: PreviewAssetFetch,
  overrides: Partial<MaterializePreviewAssetsOptions> = {},
): MaterializePreviewAssetsOptions {
  return {
    fetch: fetchValue,
    origin: window.location.origin,
    createObjectURL: vi.fn(() => 'blob:https://preview.invalid/asset'),
    revokeObjectURL: vi.fn(),
    ...overrides,
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe('diagnoseSyntax', () => {
  it.each([
    ['html', '<main>\n<div x=', 'index.html'],
    ['css', 'main {\n  color:', 'styles/theme.css'],
  ] as const)(
    '%sのerror nodeを位置順・重複なしの1-based座標へ変換する',
    (language, source, file) => {
      const diagnostics = diagnoseSyntax(language, source, file);

      expect(diagnostics.length).toBeGreaterThan(0);
      expect(diagnostics.every((item) => item.file === file)).toBe(true);
      expect(diagnostics.every((item) => (item.line ?? 0) >= 1 && (item.column ?? 0) >= 1)).toBe(
        true,
      );
      expect(
        new Set(
          diagnostics.map(
            (item) => `${String(item.file)}:${String(item.line)}:${String(item.column)}`,
          ),
        ).size,
      ).toBe(diagnostics.length);
      expect([...diagnostics]).toEqual(
        [...diagnostics].sort((left, right) =>
          (left.line ?? 0) === (right.line ?? 0)
            ? (left.column ?? 0) - (right.column ?? 0)
            : (left.line ?? 0) - (right.line ?? 0),
        ),
      );
    },
  );
});

describe('materializePreviewAssets', () => {
  const image: ResolvedPreviewAsset = {
    id: 'hero',
    mediaType: 'image',
    url: '/assets/hero.png',
  };

  it('既定ではopaque-origin iframeで読める検証済みData URLへ変換する', async () => {
    const fetchStub = vi.fn<PreviewAssetFetch>(async () =>
      response(new Blob(['png'], { type: 'image/png' })),
    );

    const materialized = await materializePreviewAssets([image], {
      fetch: fetchStub,
      origin: window.location.origin,
    });

    expect(materialized.assets[0]?.url).toMatch(/^data:image\/png;base64,/u);
    expect(materialized.diagnostics).toEqual([]);
    materialized.dispose();
  });

  it('同一Origin Assetを入力順のblob URLへ変換し、disposeを一度だけ実行する', async () => {
    const fetchStub = vi.fn<PreviewAssetFetch>(async () =>
      response(new Blob(['png'], { type: 'image/png' })),
    );
    const options = materializeOptions(fetchStub);

    const materialized = await materializePreviewAssets([image], options);

    expect(fetchStub).toHaveBeenCalledTimes(1);
    expect(fetchStub.mock.calls[0]?.[0]).toBe(`${window.location.origin}/assets/hero.png`);
    expect(fetchStub.mock.calls[0]?.[1].credentials).toBe('same-origin');
    expect(fetchStub.mock.calls[0]?.[1].signal).toBeInstanceOf(AbortSignal);
    expect({
      assets: materialized.assets,
      diagnostics: materialized.diagnostics,
    }).toEqual({
      assets: [{ ...image, url: 'blob:https://preview.invalid/asset' }],
      diagnostics: [],
    });
    materialized.dispose();
    materialized.dispose();
    expect(options.revokeObjectURL).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['CR', '<main>\r<div x='],
    ['CRLF', '<main>\r\n<div x='],
  ] as const)('%s改行を1行として数える', (_name, source) => {
    expect(diagnoseSyntax('html', source, 'index.html')[0]).toMatchObject({
      line: 2,
      column: 8,
    });
  });

  it('外部Origin・redirect先・重複/空IDをfetchせず入力順に診断する', async () => {
    const fetchStub = vi.fn<PreviewAssetFetch>(async () =>
      response(new Blob(['png'], { type: 'image/png' }), 'https://evil.example/redirected.png'),
    );
    const options = materializeOptions(fetchStub);

    const materialized = await materializePreviewAssets(
      [
        { ...image, id: '', url: '/assets/empty.png' },
        { ...image, id: 'external', url: 'https://evil.example/image.png' },
        { ...image, id: 'redirected' },
        { ...image, id: 'hero-duplicate' },
        { ...image, id: 'hero-duplicate' },
      ],
      options,
    );

    expect(fetchStub).toHaveBeenCalledTimes(1);
    expect(fetchStub.mock.calls[0]?.[1].redirect).toBe('error');
    expect(materialized.assets).toEqual([]);
    expect(materialized.diagnostics.map(({ code }) => code)).toEqual([
      'ASSET_INVALID_ID',
      'ASSET_SOURCE_REJECTED',
      'ASSET_SOURCE_REJECTED',
      'ASSET_DUPLICATE_ID',
      'ASSET_DUPLICATE_ID',
    ]);
  });

  it('MIME不一致・item容量・合計容量をblob URL化せず診断する', async () => {
    const fetchStub = vi
      .fn()
      .mockResolvedValueOnce(response(new Blob(['css'], { type: 'text/css' })))
      .mockResolvedValueOnce(response(new Blob(['12345'], { type: 'image/png' })))
      .mockResolvedValueOnce(response(new Blob(['1234'], { type: 'image/png' })))
      .mockResolvedValueOnce(response(new Blob(['1234'], { type: 'image/png' })));
    const options = materializeOptions(fetchStub, { maxAssetBytes: 4, maxTotalBytes: 6 });

    const materialized = await materializePreviewAssets(
      [
        image,
        { ...image, id: 'too-large', url: '/assets/large.png' },
        { ...image, id: 'first', url: '/assets/first.png' },
        { ...image, id: 'total', url: '/assets/total.png' },
      ],
      options,
    );

    expect({
      assets: materialized.assets.map(({ id }) => id),
      diagnostics: materialized.diagnostics.map(({ code }) => code),
    }).toEqual({
      assets: ['first'],
      diagnostics: ['ASSET_MIME_MISMATCH', 'ASSET_TOO_LARGE', 'ASSET_TOTAL_TOO_LARGE'],
    });
  });

  it('Content-Lengthで上限超過を本文読込前に拒否する', async () => {
    const blob = vi.fn(async () => new Blob(['12345'], { type: 'image/png' }));
    const cancel = vi.fn(async () => undefined);
    const fetchStub = vi.fn<PreviewAssetFetch>(
      async () =>
        ({
          ok: true,
          status: 200,
          url: `${window.location.origin}/assets/large.png`,
          headers: new Headers({ 'content-length': '5', 'content-type': 'image/png' }),
          body: { cancel },
          blob,
        }) as unknown as Response,
    );

    const materialized = await materializePreviewAssets(
      [{ ...image, url: '/assets/large.png' }],
      materializeOptions(fetchStub, { maxAssetBytes: 4 }),
    );

    expect(materialized.diagnostics.map(({ code }) => code)).toEqual(['ASSET_TOO_LARGE']);
    expect(blob).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('Content-Lengthがなくてもstream読込中に上限でcancelする', async () => {
    const cancel = vi.fn(async () => undefined);
    const chunks = [new Uint8Array(3), new Uint8Array(3)];
    let nextChunk = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        const chunk = chunks[nextChunk];
        nextChunk += 1;
        if (chunk !== undefined) controller.enqueue(chunk);
      },
      cancel,
    });
    const blob = vi.fn(async () => new Blob(['unexpected'], { type: 'image/png' }));
    const fetchStub = vi.fn<PreviewAssetFetch>(
      async () =>
        ({
          ok: true,
          status: 200,
          url: `${window.location.origin}/assets/stream.png`,
          headers: new Headers({ 'content-type': 'image/png' }),
          body,
          blob,
        }) as unknown as Response,
    );

    const materialized = await materializePreviewAssets(
      [{ ...image, url: '/assets/stream.png' }],
      materializeOptions(fetchStub, { maxAssetBytes: 4 }),
    );

    expect(materialized.diagnostics.map(({ code }) => code)).toEqual(['ASSET_TOO_LARGE']);
    expect(blob).not.toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledOnce();
  });

  it('Abort時は生成済みblob URLを解放し、診断へ変換せずrejectする', async () => {
    const controller = new AbortController();
    const fetchStub = vi
      .fn()
      .mockResolvedValueOnce(response(new Blob(['png'], { type: 'image/png' })))
      .mockImplementationOnce(async (_url: string, init?: RequestInit) => {
        return await new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => {
              reject(new DOMException('Asset fetch aborted', 'AbortError'));
            },
            { once: true },
          );
          controller.abort(new DOMException('stale', 'AbortError'));
        });
      });
    const options = materializeOptions(fetchStub, { signal: controller.signal });

    await expect(
      materializePreviewAssets([image, { ...image, id: 'second' }], options),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(options.revokeObjectURL).toHaveBeenCalledTimes(1);
  });
});

describe('HtmlCssRunnerAdapter', () => {
  it('prepareは旧frameだけを破棄し、新frameへ空Navigationを発生させない', async () => {
    const first = createFrame();
    const second = createFrame();
    const runner = new HtmlCssRunnerAdapter();

    await runner.prepare(first);
    first.srcdoc = '<p>old</p>';
    second.srcdoc = '<p>host placeholder</p>';
    await runner.prepare(second);

    expect(first.srcdoc).toBe('');
    expect(second.srcdoc).toBe('<p>host placeholder</p>');
    expect(second.getAttribute('sandbox')).toBe('allow-scripts');
    expect(second.getAttribute('sandbox')).not.toContain('allow-same-origin');
    expect(second.getAttribute('referrerpolicy')).toBe('no-referrer');
    expect(second.getAttribute('title')).toBe('コードのプレビュー');
    await runner.dispose();
  });

  it.each([
    ['language', { languageId: 'fixture' }],
    ['session', { exerciseSessionId: '' }],
    ['revision', { executionRevision: -1 }],
    ['viewport', { viewport: { id: 'desktop', width: 0, height: 720 } }],
    ['entry', { options: { entryFile: '../index.html' } }],
    ['canonical file collision', { files: { 'index.html': '<main/>', './index.html': '<main/>' } }],
  ] satisfies readonly [string, Partial<RunnerInput>][])(
    '%sが不正な入力を描画前に拒否する',
    async (_name, override) => {
      const frame = createFrame();
      const runner = new HtmlCssRunnerAdapter();
      await runner.prepare(frame);

      await expect(runner.render(runnerInput(override))).rejects.toThrow();
      expect(frame.srcdoc).toBe('');
      await runner.dispose();
    },
  );

  it('任意entryと全stylesheet参照だけを順に適用し、ready後に結果を確定する', async () => {
    const frame = createFrame();
    const runner = new HtmlCssRunnerAdapter();
    await runner.prepare(frame);
    const pending = runner.render(
      runnerInput({
        files: {
          'pages/lesson.html':
            '<main style="background:url(https://evil.example/x)">ok</main>' +
            '<link rel="stylesheet" href="./styles/missing.css">' +
            '<link rel="stylesheet" href="./styles/theme.css">' +
            '<section><link REL=" stylesheet " href="styles/theme.css"></section>',
          'styles/theme.css': 'main { color: red; background:url(https://evil.example/x); broken',
          'styles/unused.css': 'body{color:hotpink}',
        },
        options: { entryFile: './pages/lesson.html' },
      }),
    );
    let settled = false;
    void pending.then(() => {
      settled = true;
    });
    await vi.waitFor(() => {
      expect(frame.srcdoc).toContain('data-tsumucode-preview-style');
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(frame.srcdoc).not.toContain('<link');
    expect(frame.srcdoc).not.toContain('hotpink');
    expect(frame.srcdoc).not.toContain('https://evil.example');

    dispatchReady(frame);
    const result = await pending;

    expect(result.executionRevision).toBe(1);
    expect(result.evidence).toEqual([]);
    expect(result.diagnostics.map(({ code }) => code)).toEqual([
      'CSS_REFERENCE_MISSING',
      'CSS_SYNTAX',
      'CSS_URL_REMOVED',
      'CSS_URL_REMOVED',
    ]);
    await runner.dispose();
  });

  it('新renderがready失敗したら直前の成功Previewとactive revisionを復元する', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn<PreviewAssetFetch>(async () => response(new Blob(['png'], { type: 'image/png' }))),
    );
    const frame = createFrame();
    const childWindow = frame.contentWindow!;
    const postMessage = vi.spyOn(childWindow, 'postMessage').mockImplementation(() => undefined);
    const runner = new HtmlCssRunnerAdapter();
    await runner.prepare(frame);
    const first = runner.render(
      runnerInput({
        executionRevision: 1,
        files: { 'index.html': '<main><img src="asset:previous" alt="previous"></main>' },
        assets: [{ id: 'previous', mediaType: 'image', url: '/assets/previous.png' }],
      }),
    );
    await vi.waitFor(() => {
      expect(frame.srcdoc).toContain('data:image/png;base64,');
    });
    dispatchReady(frame);
    await first;
    const previousSrcdoc = frame.srcdoc;
    const previousToken = bootstrapToken(frame);

    const failedOutcome = runner
      .render(
        runnerInput({
          executionRevision: 2,
          files: { 'index.html': '<main>new</main>' },
          assets: [{ id: 'failed', mediaType: 'image', url: '/assets/failed.png' }],
        }),
      )
      .catch((error: unknown) => error);
    await vi.waitFor(() => {
      expect(frame.srcdoc).not.toBe(previousSrcdoc);
    });
    await vi.advanceTimersByTimeAsync(5_000);
    await flushMicrotasks();

    expect(frame.srcdoc).toBe(previousSrcdoc);
    dispatchReady(frame, 'session-1', previousToken);
    await expect(failedOutcome).resolves.toMatchObject({ message: 'Preview ready timeout' });

    const pendingSnapshot = runner.requestSnapshot({
      exerciseSessionId: 'session-1',
      executionRevision: 1,
      requestId: 'restored-request',
      policy,
    });
    const request = postMessage.mock.calls.at(-1)?.[0] as { readonly oneTimeToken: string };
    window.dispatchEvent(
      new MessageEvent('message', {
        source: childWindow,
        data: {
          version: PREVIEW_PROTOCOL_VERSION,
          type: 'snapshot.response',
          exerciseSessionId: 'session-1',
          requestId: 'restored-request',
          oneTimeToken: request.oneTimeToken,
          payload: snapshot(1),
        },
      }),
    );
    await expect(pendingSnapshot).resolves.toEqual(snapshot(1));
    await runner.dispose();
  });

  it('Course Assetの公開URLをData URLへ置換し、srcdocへ残さない', async () => {
    const fetchStub = vi.fn<PreviewAssetFetch>(async () =>
      response(new Blob(['png'], { type: 'image/png' })),
    );
    vi.stubGlobal('fetch', fetchStub);
    const frame = createFrame();
    const runner = new HtmlCssRunnerAdapter();
    await runner.prepare(frame);

    const pending = runner.render(
      runnerInput({
        files: { 'index.html': '<main><img src="asset:hero" alt="Hero"></main>' },
        assets: [{ id: 'hero', mediaType: 'image', url: '/assets/hero.png' }],
      }),
    );
    await vi.waitFor(() => {
      expect(frame.srcdoc).toContain('data:image/png;base64,');
    });
    expect(frame.srcdoc).not.toContain('/assets/hero.png');
    dispatchReady(frame);

    await expect(pending).resolves.toMatchObject({ diagnostics: [] });
    await runner.dispose();
  });

  it('sessionとrevisionが一致するactive previewだけにSnapshotを要求する', async () => {
    const frame = createFrame();
    const childWindow = frame.contentWindow!;
    const postMessage = vi.spyOn(childWindow, 'postMessage').mockImplementation(() => undefined);
    const runner = new HtmlCssRunnerAdapter();
    await runner.prepare(frame);
    const render = runner.render(runnerInput());
    await vi.waitFor(() => {
      expect(frame.srcdoc).not.toBe('');
    });
    dispatchReady(frame);
    await render;

    await expect(
      runner.requestSnapshot({
        exerciseSessionId: 'other-session',
        executionRevision: 1,
        requestId: 'wrong-session',
        policy,
      }),
    ).rejects.toThrow('not current');
    await expect(
      runner.requestSnapshot({
        exerciseSessionId: 'session-1',
        executionRevision: 2,
        requestId: 'wrong-revision',
        policy,
      }),
    ).rejects.toThrow('not current');

    const pending = runner.requestSnapshot({
      exerciseSessionId: 'session-1',
      executionRevision: 1,
      requestId: 'request-1',
      policy,
    });
    const request = postMessage.mock.calls.at(-1)?.[0] as { readonly oneTimeToken: string };
    window.dispatchEvent(
      new MessageEvent('message', {
        source: childWindow,
        data: {
          version: PREVIEW_PROTOCOL_VERSION,
          type: 'snapshot.response',
          exerciseSessionId: 'session-1',
          requestId: 'request-1',
          oneTimeToken: request.oneTimeToken,
          payload: snapshot(),
        },
      }),
    );
    await expect(pending).resolves.toEqual(snapshot());
    await runner.dispose();
  });

  it('並行renderは先行Bridge待機を中断し、最新generationだけをactiveにする', async () => {
    const frame = createFrame();
    const runner = new HtmlCssRunnerAdapter();
    await runner.prepare(frame);

    const first = runner.render(runnerInput({ executionRevision: 1 }));
    const firstOutcome = first.catch((error: unknown) => error);
    await vi.waitFor(() => {
      expect(frame.srcdoc).not.toBe('');
    });
    const firstToken = bootstrapToken(frame);
    const second = runner.render(runnerInput({ executionRevision: 2 }));
    await vi.waitFor(() => {
      expect(bootstrapToken(frame)).not.toBe(firstToken);
    });
    dispatchReady(frame);

    await expect(second).resolves.toMatchObject({ executionRevision: 2 });
    await expect(firstOutcome).resolves.toMatchObject({ name: 'AbortError' });
    await expect(
      runner.requestSnapshot({
        exerciseSessionId: 'session-1',
        executionRevision: 1,
        requestId: 'stale',
        policy,
      }),
    ).rejects.toThrow('not current');
    await runner.dispose();
  });

  it('disposeはin-flight Bridgeを拒否してsrcdocを冪等に解放する', async () => {
    const frame = createFrame();
    const runner = new HtmlCssRunnerAdapter();
    await runner.prepare(frame);
    const pending = runner.render(runnerInput());
    const outcome = pending.catch((error: unknown) => error);
    await vi.waitFor(() => {
      expect(frame.srcdoc).not.toBe('');
    });

    await runner.dispose();
    await runner.dispose();

    await expect(outcome).resolves.toMatchObject({ name: 'AbortError' });
    expect(frame.srcdoc).toBe('');
  });
});
