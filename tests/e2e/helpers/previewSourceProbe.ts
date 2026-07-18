import { expect, type Locator, type Page } from '@playwright/test';

interface SnapshotRequestEnvelope {
  readonly version: number;
  readonly type: string;
  readonly exerciseSessionId: string;
  readonly executionRevision: number;
  readonly requestId: string;
  readonly oneTimeToken: string;
  readonly payload: SnapshotPolicyEnvelope;
}

interface SnapshotPolicyEnvelope {
  readonly selectors: readonly string[];
  readonly attributes: readonly string[];
  readonly computedStyles: readonly string[];
  readonly includeAllElements: boolean;
}

interface OverflowSnapshot {
  readonly x: boolean;
  readonly y: boolean;
  readonly scrollWidth: number;
  readonly scrollHeight: number;
  readonly clientWidth: number;
  readonly clientHeight: number;
}

interface CapturedSnapshotRequest {
  readonly request: SnapshotRequestEnvelope;
  readonly sourceMatchesParent: boolean;
  readonly viewport: { readonly id: string; readonly width: number; readonly height: number };
  readonly documentOverflow: OverflowSnapshot;
}

export interface StrictSnapshotResponse {
  readonly version: 1;
  readonly type: 'snapshot.response';
  readonly exerciseSessionId: string;
  readonly requestId: string;
  readonly oneTimeToken: string;
  readonly payload: {
    readonly exerciseSessionId: string;
    readonly executionRevision: number;
    readonly viewport: { readonly id: string; readonly width: number; readonly height: number };
    readonly nodes: readonly [];
    readonly documentOverflow: OverflowSnapshot;
  };
}

const previewIframe = (page: Page): Locator =>
  page.getByTestId('runtime-preview-frame').locator('iframe');

/** 実requestがBridgeのstrict policy shapeを持つことをtest process側でも検証する。 */
function isStrictSnapshotPolicy(value: unknown): value is SnapshotPolicyEnvelope {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const policy = value as Record<string, unknown>;
  const keys = Object.keys(policy).sort();
  const expectedKeys = ['attributes', 'computedStyles', 'includeAllElements', 'selectors'];
  const isStringArray = (candidate: unknown): candidate is readonly string[] =>
    Array.isArray(candidate) && candidate.every((item) => typeof item === 'string');
  return (
    keys.length === expectedKeys.length &&
    keys.every((key, index) => key === expectedKeys[index]) &&
    isStringArray(policy.selectors) &&
    isStringArray(policy.attributes) &&
    isStringArray(policy.computedStyles) &&
    typeof policy.includeAllElements === 'boolean'
  );
}

/** reload後の全frameへ先行listenerを入れ、実snapshot requestだけをBridgeより先に停止する。 */
export async function installPreviewSourceProbe(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const marker = '__tsumucodePreviewSourceProbe';
    if (window.top === window) {
      const topWindow = window as Window & {
        __tsumucodePreviewSourceRequests?: unknown[];
        __tsumucodePreviewProbeInstallations?: number;
      };
      topWindow.__tsumucodePreviewSourceRequests = [];
      topWindow.__tsumucodePreviewProbeInstallations = 0;
      window.addEventListener('message', (event) => {
        const data = event.data as {
          marker?: unknown;
          capture?: unknown;
          installed?: unknown;
        } | null;
        if (data !== null && data.marker === marker) {
          if (data.installed === true) {
            topWindow.__tsumucodePreviewProbeInstallations =
              (topWindow.__tsumucodePreviewProbeInstallations ?? 0) + 1;
          }
          if (data.capture !== undefined) {
            topWindow.__tsumucodePreviewSourceRequests?.push(data.capture);
          }
        }
      });
      return;
    }

    window.parent.postMessage({ marker, installed: true }, '*');

    window.addEventListener(
      'message',
      (event) => {
        const data = event.data as Record<string, unknown> | null;
        if (
          event.source !== window.parent ||
          data === null ||
          data.version !== 1 ||
          data.type !== 'snapshot.request' ||
          typeof data.exerciseSessionId !== 'string' ||
          typeof data.executionRevision !== 'number' ||
          typeof data.requestId !== 'string' ||
          typeof data.oneTimeToken !== 'string'
        ) {
          return;
        }
        event.stopImmediatePropagation();
        const root = document.documentElement;
        window.parent.postMessage(
          {
            marker,
            capture: {
              request: data,
              sourceMatchesParent: event.source === window.parent,
              viewport: {
                id: 'desktop',
                width: window.innerWidth,
                height: window.innerHeight,
              },
              documentOverflow: {
                x: root.scrollWidth > root.clientWidth,
                y: root.scrollHeight > root.clientHeight,
                scrollWidth: root.scrollWidth,
                scrollHeight: root.scrollHeight,
                clientWidth: root.clientWidth,
                clientHeight: root.clientHeight,
              },
            },
          },
          '*',
        );
      },
      true,
    );
  });
  await page.reload();
  await page.getByTestId('code-workspace').waitFor();
  await expect(page.getByRole('button', { name: '判定する' })).toBeEnabled();
  await expect(previewIframe(page)).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const topWindow = window as Window & {
          __tsumucodePreviewProbeInstallations?: number;
        };
        return topWindow.__tsumucodePreviewProbeInstallations ?? 0;
      }),
    )
    .toBeGreaterThan(0);
}

/** active pending requestの実identityとiframe寸法からstrict-valid responseを作る。 */
export async function captureStrictSnapshotResponse(page: Page): Promise<StrictSnapshotResponse> {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const topWindow = window as Window & {
          __tsumucodePreviewSourceRequests?: unknown[];
        };
        return topWindow.__tsumucodePreviewSourceRequests?.length ?? 0;
      }),
    )
    .toBe(1);
  const captured = await page.evaluate(() => {
    const topWindow = window as Window & {
      __tsumucodePreviewSourceRequests?: CapturedSnapshotRequest[];
    };
    return topWindow.__tsumucodePreviewSourceRequests?.[0];
  });
  if (captured === undefined) throw new Error('Active snapshot request was not captured');
  const { request, sourceMatchesParent, viewport, documentOverflow } = captured;
  if (
    !sourceMatchesParent ||
    request.version !== 1 ||
    request.type !== 'snapshot.request' ||
    request.exerciseSessionId.length === 0 ||
    !Number.isInteger(request.executionRevision) ||
    request.requestId.length === 0 ||
    request.oneTimeToken.length === 0 ||
    !isStrictSnapshotPolicy(request.payload) ||
    viewport.width <= 0 ||
    viewport.height <= 0
  ) {
    throw new Error('Captured snapshot request is not an active strict protocol request');
  }
  return {
    version: 1,
    type: 'snapshot.response',
    exerciseSessionId: request.exerciseSessionId,
    requestId: request.requestId,
    oneTimeToken: request.oneTimeToken,
    payload: {
      exerciseSessionId: request.exerciseSessionId,
      executionRevision: request.executionRevision,
      viewport,
      nodes: [],
      documentOverflow,
    },
  };
}

/** top Window自身から同一応答を送り、focus変更なしでiframe以外のevent.sourceを再現する。 */
export async function respondFromTopWindow(
  page: Page,
  response: StrictSnapshotResponse,
): Promise<void> {
  await page.evaluate((message) => {
    window.postMessage(message, '*');
  }, response);
}

/** 対象opaque iframe自身から同一応答を送り、正しいevent.sourceを再現する。 */
export async function respondFromPreviewFrame(
  page: Page,
  response: StrictSnapshotResponse,
): Promise<void> {
  await previewIframe(page)
    .contentFrame()
    .locator('html')
    .evaluate((_, message) => {
      window.parent.postMessage(message, '*');
    }, response);
}

/** 短いbounded期間をtimeout成功にせず、判定pendingが継続したか毎frame観測する。 */
export async function observeValidationBusy(button: Locator): Promise<boolean> {
  return button.evaluate(async (element) => {
    if (!(element instanceof HTMLButtonElement)) return false;
    const deadline = performance.now() + 250;
    while (performance.now() < deadline) {
      if (!element.disabled || element.textContent.trim() !== '判定しています') return false;
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          resolve();
        });
      });
    }
    return element.disabled && element.textContent.trim() === '判定しています';
  });
}
