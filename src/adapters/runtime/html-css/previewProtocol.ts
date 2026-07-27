/** Opaque-origin Preview iframeから許可済みSnapshotだけを受け取る通信契約。 */
import { z } from 'zod';
import type { PreviewSnapshot, SnapshotPolicy } from '../../../core/runtime/contracts';

export const PREVIEW_PROTOCOL_VERSION = 1 as const;

const MAX_ID_LENGTH = 256;
const MAX_TOKEN_LENGTH = 512;
const MAX_NODES = 5_000;
const MAX_SELECTORS = 64;
const MAX_ATTRIBUTES = 64;
const MAX_COMPUTED_STYLES = 128;
const MAX_TEXT_LENGTH = 100_000;
const DEFAULT_RESPONSE_TIMEOUT_MS = 5_000;

const IdentifierSchema = z.string().min(1).max(MAX_ID_LENGTH);
const TokenSchema = z.string().min(1).max(MAX_TOKEN_LENGTH);
const FiniteNumberSchema = z.number();
const NonNegativeNumberSchema = FiniteNumberSchema.nonnegative();
const OverflowSchema = z
  .object({
    x: z.boolean(),
    y: z.boolean(),
    scrollWidth: NonNegativeNumberSchema,
    scrollHeight: NonNegativeNumberSchema,
    clientWidth: NonNegativeNumberSchema,
    clientHeight: NonNegativeNumberSchema,
  })
  .strict();
const ViewportSchema = z
  .object({
    id: IdentifierSchema,
    width: FiniteNumberSchema.positive(),
    height: FiniteNumberSchema.positive(),
    reducedMotion: z.literal('reduce').optional(),
  })
  .strict();
const AttributeRecordSchema = z
  .record(z.string().min(1).max(256), z.string().max(MAX_TEXT_LENGTH))
  .refine((record) => Object.keys(record).length <= MAX_ATTRIBUTES);
const ComputedStyleRecordSchema = z
  .record(z.string().min(1).max(256), z.string().max(MAX_TEXT_LENGTH))
  .refine((record) => Object.keys(record).length <= MAX_COMPUTED_STYLES);
const PreviewNodeSchema = z
  .object({
    nodeId: z.number().int().positive(),
    parentId: z.number().int().positive().nullable(),
    documentOrder: z.number().int().nonnegative(),
    tagName: z.string().min(1).max(64),
    matchedSelectors: z.array(z.string().max(1_000)).max(MAX_SELECTORS),
    attributes: AttributeRecordSchema,
    text: z.string().max(MAX_TEXT_LENGTH),
    computedStyles: ComputedStyleRecordSchema,
    focusVisibleComputedStyles: ComputedStyleRecordSchema,
    rect: z
      .object({
        x: FiniteNumberSchema,
        y: FiniteNumberSchema,
        width: NonNegativeNumberSchema,
        height: NonNegativeNumberSchema,
      })
      .strict(),
    overflow: OverflowSchema,
    focusable: z.boolean(),
    accessibleName: z.string().max(MAX_TEXT_LENGTH),
    role: z.string().max(256),
  })
  .strict();
const PreviewSnapshotSchema = z
  .object({
    exerciseSessionId: IdentifierSchema,
    executionRevision: z.number().int().nonnegative(),
    viewport: ViewportSchema,
    nodes: z.array(PreviewNodeSchema).max(MAX_NODES),
    documentOverflow: OverflowSchema,
  })
  .strict()
  .superRefine((snapshot, context) => {
    const precedingIds = new Set<number>();
    snapshot.nodes.forEach((node, index) => {
      if (precedingIds.has(node.nodeId)) {
        context.addIssue({
          code: 'custom',
          path: ['nodes', index, 'nodeId'],
          message: 'nodeId must be unique',
        });
      }
      if (node.documentOrder !== index) {
        context.addIssue({
          code: 'custom',
          path: ['nodes', index, 'documentOrder'],
          message: 'documentOrder must be contiguous',
        });
      }
      if (node.parentId !== null && !precedingIds.has(node.parentId)) {
        context.addIssue({
          code: 'custom',
          path: ['nodes', index, 'parentId'],
          message: 'parentId must reference a preceding node',
        });
      }
      precedingIds.add(node.nodeId);
    });
  });
const EnvelopeBase = {
  version: z.literal(PREVIEW_PROTOCOL_VERSION),
  exerciseSessionId: IdentifierSchema,
  requestId: IdentifierSchema,
  oneTimeToken: TokenSchema,
};
const PreviewEnvelopeSchema = z.discriminatedUnion('type', [
  z.object({ ...EnvelopeBase, type: z.literal('bridge.ready'), payload: z.null() }).strict(),
  z
    .object({
      ...EnvelopeBase,
      type: z.literal('bridge.error'),
      payload: z.string().min(1).max(2_000),
    })
    .strict(),
  z
    .object({
      ...EnvelopeBase,
      type: z.literal('snapshot.response'),
      payload: PreviewSnapshotSchema,
    })
    .strict(),
]);

export type PreviewEnvelope = z.infer<typeof PreviewEnvelopeSchema>;

export interface PreviewBridgeClientOptions {
  /** readyとSnapshot応答を待つ上限。Testでは短縮できる。 */
  readonly responseTimeoutMs?: number;
}

interface PendingRequest {
  readonly token: string;
  readonly resolve: (snapshot: PreviewSnapshot) => void;
  readonly reject: (error: Error) => void;
  readonly timeout: ReturnType<typeof setTimeout>;
}

/** EnvelopeだけでなくSnapshot payloadの全field・上限・型をstrictに検証する。 */
export function isPreviewResponse(value: unknown): value is PreviewEnvelope {
  return PreviewEnvelopeSchema.safeParse(value).success;
}

/** Client timeout optionを有限な正数へ限定する。 */
function responseTimeout(options: PreviewBridgeClientOptions | undefined): number {
  const timeout = options?.responseTimeoutMs ?? DEFAULT_RESPONSE_TIMEOUT_MS;
  if (!Number.isFinite(timeout) || timeout <= 0) {
    throw new Error('Preview response timeout must be a positive finite number');
  }
  return timeout;
}

/** Runtime内部IDがProtocol上の空でないbounded stringかを確認する。 */
function assertIdentifier(value: string, label: string): void {
  if (value.length === 0 || value.length > MAX_ID_LENGTH) {
    throw new Error(`${label} must be a non-empty bounded string`);
  }
}

/** opaque-origin iframeをevent.source・session・使い捨てtokenで認証する親Client。 */
export class PreviewBridgeClient {
  readonly #pending = new Map<string, PendingRequest>();
  readonly #sourceWindow: Window;
  readonly #timeoutMs: number;
  readonly #ready: Promise<void>;
  #readyResolve: (() => void) | undefined;
  #readyReject: ((error: Error) => void) | undefined;
  #readyTimeout: ReturnType<typeof setTimeout> | undefined;
  #readyState: 'pending' | 'resolved' | 'rejected' = 'pending';
  #disposed = false;

  readonly #listener = (event: MessageEvent): void => {
    if (this.#disposed || event.source !== this.#sourceWindow) return;
    const parsed = PreviewEnvelopeSchema.safeParse(event.data);
    if (!parsed.success) return;
    const message = parsed.data;
    if (message.exerciseSessionId !== this.exerciseSessionId) return;

    if (message.type === 'bridge.ready') {
      if (
        this.#readyState !== 'pending' ||
        message.requestId !== 'ready' ||
        message.oneTimeToken !== this.bootstrapToken
      ) {
        return;
      }
      this.#readyState = 'resolved';
      if (this.#readyTimeout !== undefined) clearTimeout(this.#readyTimeout);
      this.#readyTimeout = undefined;
      this.#readyResolve?.();
      this.#readyResolve = undefined;
      this.#readyReject = undefined;
      return;
    }

    const pending = this.#pending.get(message.requestId);
    if (pending === undefined || pending.token !== message.oneTimeToken) return;
    clearTimeout(pending.timeout);
    this.#pending.delete(message.requestId);
    if (message.type === 'bridge.error') {
      pending.reject(new Error(message.payload));
      return;
    }
    if (
      message.payload.exerciseSessionId !== this.exerciseSessionId ||
      message.payload.executionRevision !== this.executionRevision
    ) {
      pending.reject(new Error('Snapshot payload identity mismatch'));
      return;
    }
    pending.resolve(message.payload);
  };

  constructor(
    private readonly frame: HTMLIFrameElement,
    private readonly exerciseSessionId: string,
    private readonly executionRevision: number,
    private readonly bootstrapToken: string,
    options?: PreviewBridgeClientOptions,
  ) {
    assertIdentifier(exerciseSessionId, 'exerciseSessionId');
    if (!Number.isInteger(executionRevision) || executionRevision < 0) {
      throw new Error('executionRevision must be a non-negative integer');
    }
    if (bootstrapToken.length === 0 || bootstrapToken.length > MAX_TOKEN_LENGTH) {
      throw new Error('bootstrapToken must be a non-empty bounded string');
    }
    const sourceWindow = frame.contentWindow;
    if (sourceWindow === null) throw new Error('Preview frame has no contentWindow');
    this.#sourceWindow = sourceWindow;
    this.#timeoutMs = responseTimeout(options);
    this.#ready = new Promise<void>((resolve, reject) => {
      this.#readyResolve = resolve;
      this.#readyReject = reject;
    });
    void this.#ready.catch(() => undefined);
    this.#readyTimeout = setTimeout(() => {
      this.#close(new Error('Preview ready timeout'));
    }, this.#timeoutMs);
    window.addEventListener('message', this.#listener);
  }

  /** DOM構築済みBridgeの認証済みreadyを待つ。 */
  waitUntilReady(): Promise<void> {
    return this.#ready;
  }

  /** 一意request IDと使い捨てtokenでSnapshotを要求する。 */
  requestSnapshot(requestId: string, policy: SnapshotPolicy): Promise<PreviewSnapshot> {
    if (this.#disposed) return Promise.reject(new Error('Preview disposed'));
    if (this.#readyState !== 'resolved') return Promise.reject(new Error('Preview is not ready'));
    try {
      assertIdentifier(requestId, 'requestId');
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
    if (this.#pending.has(requestId)) {
      return Promise.reject(new Error(`Snapshot request already pending: ${requestId}`));
    }

    const token = crypto.randomUUID();
    let pending!: PendingRequest;
    const promise = new Promise<PreviewSnapshot>((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (this.#pending.get(requestId) !== pending) return;
        this.#pending.delete(requestId);
        reject(new Error('Snapshot response timeout'));
      }, this.#timeoutMs);
      pending = { token, resolve, reject, timeout };
      this.#pending.set(requestId, pending);
    });

    try {
      this.#sourceWindow.postMessage(
        {
          version: PREVIEW_PROTOCOL_VERSION,
          type: 'snapshot.request',
          exerciseSessionId: this.exerciseSessionId,
          executionRevision: this.executionRevision,
          requestId,
          oneTimeToken: token,
          payload: policy,
        },
        '*',
      );
    } catch (error) {
      clearTimeout(pending.timeout);
      this.#pending.delete(requestId);
      pending.reject(error instanceof Error ? error : new Error(String(error)));
    }
    return promise;
  }

  /** Listener・ready timer・全pending requestを冪等に破棄する。 */
  dispose(): void {
    this.#close(new Error('Preview disposed'));
  }

  /** Clientを一度だけ閉じ、全Promiseとtimerを同じErrorで終了する。 */
  #close(error: Error): void {
    if (this.#disposed) return;
    this.#disposed = true;
    window.removeEventListener('message', this.#listener);
    if (this.#readyTimeout !== undefined) clearTimeout(this.#readyTimeout);
    this.#readyTimeout = undefined;
    if (this.#readyState === 'pending') {
      this.#readyState = 'rejected';
      this.#readyReject?.(error);
    }
    this.#readyResolve = undefined;
    this.#readyReject = undefined;
    for (const request of this.#pending.values()) {
      clearTimeout(request.timeout);
      request.reject(error);
    }
    this.#pending.clear();
  }
}
