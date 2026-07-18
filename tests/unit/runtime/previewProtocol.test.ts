import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  PreviewNode,
  PreviewSnapshot,
  SnapshotPolicy,
} from '../../../src/core/runtime/contracts';
import {
  PREVIEW_PROTOCOL_VERSION,
  PreviewBridgeClient,
  isPreviewResponse,
} from '../../../src/adapters/runtime/html-css/previewProtocol';

const policy: SnapshotPolicy = {
  selectors: ['main'],
  attributes: ['id'],
  computedStyles: ['display'],
  includeAllElements: false,
};

/** Protocol schemaを通る最小Snapshotを生成する。 */
function snapshot(overrides: Partial<PreviewSnapshot> = {}): PreviewSnapshot {
  return {
    exerciseSessionId: 'session-1',
    executionRevision: 3,
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
    ...overrides,
  };
}

/** Protocol schemaを通る最小Nodeへ差分を重ねる。 */
function previewNode(overrides: Partial<PreviewNode> = {}): PreviewNode {
  return {
    nodeId: 1,
    parentId: null,
    documentOrder: 0,
    tagName: 'main',
    matchedSelectors: [],
    attributes: {},
    text: '',
    computedStyles: {},
    rect: { x: 0, y: 0, width: 100, height: 50 },
    overflow: {
      x: false,
      y: false,
      scrollWidth: 100,
      scrollHeight: 50,
      clientWidth: 100,
      clientHeight: 50,
    },
    focusable: false,
    accessibleName: '',
    role: 'main',
    ...overrides,
  };
}

/** 指定frameをsourceとするopaque-origin相当のMessageEventを親windowへ送る。 */
function dispatchFrom(frame: HTMLIFrameElement, data: unknown, source = frame.contentWindow): void {
  window.dispatchEvent(new MessageEvent('message', { data, source }));
}

/** Test用iframeをDOMへ接続し、contentWindowを確実に持たせる。 */
function createFrame(): HTMLIFrameElement {
  const frame = document.createElement('iframe');
  document.body.append(frame);
  return frame;
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('preview response schema', () => {
  const ready = {
    version: PREVIEW_PROTOCOL_VERSION,
    type: 'bridge.ready',
    exerciseSessionId: 'session-1',
    requestId: 'ready',
    oneTimeToken: 'bootstrap-token',
    payload: null,
  } as const;

  it('strictなversion・ID・token・payloadだけを受理する', () => {
    expect(isPreviewResponse(ready)).toBe(true);
    expect(isPreviewResponse({ ...ready, extra: true })).toBe(false);
    expect(isPreviewResponse({ ...ready, exerciseSessionId: '' })).toBe(false);
    expect(isPreviewResponse({ ...ready, oneTimeToken: '' })).toBe(false);
    expect(isPreviewResponse({ ...ready, payload: {} })).toBe(false);
    expect(isPreviewResponse({ type: 'snapshot.response', payload: {} })).toBe(false);
  });

  it('Snapshotのunknown field・非有限数・負寸法・identity欠落を拒否する', () => {
    const envelope = {
      ...ready,
      type: 'snapshot.response',
      requestId: 'request-1',
      oneTimeToken: 'request-token',
      payload: snapshot(),
    } as const;

    expect(isPreviewResponse(envelope)).toBe(true);
    expect(
      isPreviewResponse({
        ...envelope,
        payload: { ...envelope.payload, viewport: { id: 'desktop', width: Infinity, height: 720 } },
      }),
    ).toBe(false);
    expect(
      isPreviewResponse({
        ...envelope,
        payload: {
          ...envelope.payload,
          documentOverflow: { ...envelope.payload.documentOverflow, scrollWidth: -1 },
        },
      }),
    ).toBe(false);
    expect(
      isPreviewResponse({ ...envelope, payload: { ...envelope.payload, unknown: 'value' } }),
    ).toBe(false);
    expect(
      isPreviewResponse({ ...envelope, payload: { ...envelope.payload, exerciseSessionId: '' } }),
    ).toBe(false);
    expect(
      isPreviewResponse({
        ...envelope,
        payload: {
          ...envelope.payload,
          nodes: [previewNode(), previewNode({ documentOrder: 1 })],
        },
      }),
    ).toBe(false);
    expect(
      isPreviewResponse({
        ...envelope,
        payload: { ...envelope.payload, nodes: [previewNode({ parentId: 99 })] },
      }),
    ).toBe(false);
  });
});

describe('PreviewBridgeClient', () => {
  it('source・session・bootstrap tokenが揃ったreadyだけを一度受理する', async () => {
    const frame = createFrame();
    const client = new PreviewBridgeClient(frame, 'session-1', 3, 'bootstrap-token');
    const ready = client.waitUntilReady();
    let settled = false;
    void ready.then(() => {
      settled = true;
    });

    dispatchFrom(
      frame,
      {
        version: 1,
        type: 'bridge.ready',
        exerciseSessionId: 'session-1',
        requestId: 'ready',
        oneTimeToken: 'bootstrap-token',
        payload: null,
      },
      window,
    );
    dispatchFrom(frame, {
      version: 1,
      type: 'bridge.ready',
      exerciseSessionId: 'session-1',
      requestId: 'ready',
      oneTimeToken: 'wrong-token',
      payload: null,
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    dispatchFrom(frame, {
      version: 1,
      type: 'bridge.ready',
      exerciseSessionId: 'session-1',
      requestId: 'ready',
      oneTimeToken: 'bootstrap-token',
      payload: null,
    });
    await expect(ready).resolves.toBeUndefined();
    client.dispose();
  });

  it('requestごとのtokenでSnapshotを一度だけ受理し、重複requestIdを拒否する', async () => {
    const frame = createFrame();
    const childWindow = frame.contentWindow!;
    const postMessage = vi.spyOn(childWindow, 'postMessage').mockImplementation(() => undefined);
    const client = new PreviewBridgeClient(frame, 'session-1', 3, 'bootstrap-token');
    dispatchFrom(frame, {
      version: 1,
      type: 'bridge.ready',
      exerciseSessionId: 'session-1',
      requestId: 'ready',
      oneTimeToken: 'bootstrap-token',
      payload: null,
    });
    await client.waitUntilReady();

    const pending = client.requestSnapshot('request-1', policy);
    await expect(client.requestSnapshot('request-1', policy)).rejects.toThrow('already pending');
    const sent = postMessage.mock.calls[0]?.[0] as {
      readonly oneTimeToken: string;
      readonly payload: SnapshotPolicy;
    };
    expect(sent.payload).toEqual(policy);
    expect(sent.oneTimeToken).not.toBe('bootstrap-token');

    dispatchFrom(frame, {
      version: 1,
      type: 'snapshot.response',
      exerciseSessionId: 'session-1',
      requestId: 'request-1',
      oneTimeToken: `${sent.oneTimeToken}-wrong`,
      payload: snapshot(),
    });
    dispatchFrom(frame, {
      version: 1,
      type: 'snapshot.response',
      exerciseSessionId: 'session-1',
      requestId: 'request-1',
      oneTimeToken: sent.oneTimeToken,
      payload: snapshot(),
    });
    await expect(pending).resolves.toEqual(snapshot());
    client.dispose();
  });

  it('payload identity不一致をrejectし、ready・request timeoutとdisposeで資源を閉じる', async () => {
    vi.useFakeTimers();
    const timeoutFrame = createFrame();
    const timeoutClient = new PreviewBridgeClient(timeoutFrame, 'session-1', 3, 'bootstrap-token', {
      responseTimeoutMs: 25,
    });
    const timedOutReady = timeoutClient.waitUntilReady();
    await vi.advanceTimersByTimeAsync(25);
    await expect(timedOutReady).rejects.toThrow('ready timeout');
    timeoutClient.dispose();

    const frame = createFrame();
    const postMessage = vi
      .spyOn(frame.contentWindow!, 'postMessage')
      .mockImplementation(() => undefined);
    const client = new PreviewBridgeClient(frame, 'session-1', 3, 'bootstrap-token', {
      responseTimeoutMs: 25,
    });
    dispatchFrom(frame, {
      version: 1,
      type: 'bridge.ready',
      exerciseSessionId: 'session-1',
      requestId: 'ready',
      oneTimeToken: 'bootstrap-token',
      payload: null,
    });
    await client.waitUntilReady();
    const identityMismatch = client.requestSnapshot('identity', policy);
    const token = (
      postMessage.mock.calls[0]?.[0] as {
        oneTimeToken: string;
      }
    ).oneTimeToken;
    dispatchFrom(frame, {
      version: 1,
      type: 'snapshot.response',
      exerciseSessionId: 'session-1',
      requestId: 'identity',
      oneTimeToken: token,
      payload: snapshot({ executionRevision: 4 }),
    });
    await expect(identityMismatch).rejects.toThrow('identity mismatch');

    const disposed = client.requestSnapshot('disposed', policy);
    client.dispose();
    await expect(disposed).rejects.toThrow('disposed');
    await expect(client.requestSnapshot('after-dispose', policy)).rejects.toThrow('disposed');
  });
});
