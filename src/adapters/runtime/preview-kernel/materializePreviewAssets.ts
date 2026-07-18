/** Full／read-only共通でCourse Assetをboundedなopaque-frame用URLへ変換する。 */
import type { ResolvedPreviewAsset, RunnerDiagnostic } from '../../../core/runtime/contracts';

const DEFAULT_MAX_ASSET_BYTES = 10 * 1024 * 1024;
const DEFAULT_MAX_TOTAL_BYTES = 50 * 1024 * 1024;
const SAFE_ASSET_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const MAX_ASSET_ID_LENGTH = 256;
const SAFE_FONT_MIME = new Set([
  'application/font-woff',
  'application/vnd.ms-fontobject',
  'font/otf',
  'font/ttf',
  'font/woff',
  'font/woff2',
]);

export type PreviewAssetFetch = (url: string, init: RequestInit) => Promise<Response>;

export interface MaterializePreviewAssetsOptions {
  readonly signal?: AbortSignal;
  readonly fetch?: PreviewAssetFetch;
  readonly origin?: string;
  readonly createObjectURL?: (blob: Blob) => string;
  readonly revokeObjectURL?: (url: string) => void;
  readonly maxAssetBytes?: number;
  readonly maxTotalBytes?: number;
}

export interface MaterializedPreviewAssets {
  readonly assets: readonly ResolvedPreviewAsset[];
  readonly diagnostics: readonly RunnerDiagnostic[];
  dispose(): void;
}

type AssetSizeFailure = 'ASSET_TOO_LARGE' | 'ASSET_TOTAL_TOO_LARGE';

interface BoundedBodyResult {
  readonly blob?: Blob;
  readonly failure?: AssetSizeFailure;
}

/** 検証済みBlobをopaque-origin iframeでも読めるData URLへ変換する。 */
async function blobToDataUrl(blob: Blob): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => {
      reject(reader.error ?? new Error('Preview asset Data URL conversion failed'));
    };
    reader.onload = () => {
      if (typeof reader.result !== 'string' || !reader.result.startsWith('data:')) {
        reject(new Error('Preview asset Data URL conversion failed'));
        return;
      }
      resolve(reader.result);
    };
    reader.readAsDataURL(blob);
  });
}

/** Asset失敗を公開診断契約へ変換する。 */
function diagnostic(code: string, source: ResolvedPreviewAsset, detail: string): RunnerDiagnostic {
  return {
    code,
    kind: 'system',
    severity: 'error',
    message: `${source.id || '(empty asset id)'}: ${detail}`,
    learnerMessage: `教材Asset ${source.id || '(IDなし)'} を読み込めませんでした。教材を再読み込みしてください。`,
  };
}

/** 正の有限byte上限だけを受理する。 */
function byteLimit(value: number | undefined, fallback: number, label: string): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved <= 0) {
    throw new Error(`${label} must be a positive safe integer`);
  }
  return resolved;
}

/** sourceとredirect先を同一Origin HTTP(S) URLへ限定する。 */
function sameOriginHttpUrl(value: string, origin: string): URL | undefined {
  try {
    const base = new URL(origin);
    const result = new URL(value, `${base.origin}/`);
    if (
      (result.protocol !== 'http:' && result.protocol !== 'https:') ||
      result.origin !== base.origin ||
      result.username.length > 0 ||
      result.password.length > 0
    ) {
      return undefined;
    }
    return result;
  } catch {
    return undefined;
  }
}

/** 宣言したAsset分類とresponse MIMEが一致するか確認する。 */
function matchesMediaType(mediaType: ResolvedPreviewAsset['mediaType'], mime: string): boolean {
  const normalized = mime.split(';', 1)[0]!.trim().toLowerCase();
  if (normalized.length === 0) return false;
  const isImage = normalized.startsWith('image/');
  const isFont = normalized.startsWith('font/') || SAFE_FONT_MIME.has(normalized);
  if (mediaType === 'image') return isImage;
  if (mediaType === 'font') return isFont;
  return !isImage && !isFont;
}

/** Abort理由を常にAbortErrorへ正規化する。 */
function abortError(reason: unknown): Error {
  if (reason instanceof Error && reason.name === 'AbortError') return reason;
  return new DOMException('Preview asset materialization aborted', 'AbortError');
}

/** 非同期境界を越えた外部Abortを型解析に依存せず確認する。 */
function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw abortError(signal.reason);
}

/** fetch失敗がAbort由来かをsignalとErrorの両方から判定する。 */
function isAbortFailure(signal: AbortSignal, error: unknown): boolean {
  return signal.aborted || (error instanceof Error && error.name === 'AbortError');
}

/** Content-Lengthを安全な非負整数へ変換し、巨大値は上限超過として扱う。 */
function declaredContentLength(headers: Headers): number | undefined {
  const value = headers.get('content-length');
  if (value === null || !/^(?:0|[1-9]\d*)$/u.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : Number.POSITIVE_INFINITY;
}

/** response bodyを解放し、拒否後のdownload継続を防ぐ。 */
async function cancelBody(body: ReadableStream<Uint8Array> | null, reason: Error): Promise<void> {
  if (body === null) return;
  try {
    await body.cancel(reason);
  } catch {
    // 既にclose/error済みのstreamは解放済みなので追加処理しない。
  }
}

/** Streamをbyte上限まで読み、超過した時点でcancelしてBlob化を止める。 */
async function readBoundedBody(
  body: ReadableStream<Uint8Array> | null,
  mime: string,
  maxAssetBytes: number,
  remainingTotalBytes: number,
  signal: AbortSignal,
): Promise<BoundedBodyResult> {
  if (body === null) return { blob: new Blob([], { type: mime }) };
  const reader = body.getReader();
  const chunks: ArrayBuffer[] = [];
  let size = 0;
  let cancelled = false;
  const cancelForAbort = (): void => {
    cancelled = true;
    void reader.cancel(abortError(signal.reason)).catch(() => undefined);
  };
  signal.addEventListener('abort', cancelForAbort, { once: true });
  try {
    for (;;) {
      throwIfAborted(signal);
      const chunk = await reader.read();
      throwIfAborted(signal);
      if (chunk.done) break;
      const nextSize = size + chunk.value.byteLength;
      if (nextSize > maxAssetBytes) {
        cancelled = true;
        await reader
          .cancel(new Error('Preview asset exceeds item byte limit'))
          .catch(() => undefined);
        return { failure: 'ASSET_TOO_LARGE' };
      }
      if (nextSize > remainingTotalBytes) {
        cancelled = true;
        await reader
          .cancel(new Error('Preview assets exceed total byte limit'))
          .catch(() => undefined);
        return { failure: 'ASSET_TOTAL_TOO_LARGE' };
      }
      const copy = new Uint8Array(chunk.value.byteLength);
      copy.set(chunk.value);
      chunks.push(copy.buffer);
      size = nextSize;
    }
    return { blob: new Blob(chunks, { type: mime }) };
  } finally {
    signal.removeEventListener('abort', cancelForAbort);
    if (signal.aborted && !cancelled) {
      await reader.cancel(abortError(signal.reason)).catch(() => undefined);
    }
    reader.releaseLock();
  }
}

/** 同一OriginのCourse Assetを親側で取得し、opaque iframe用Data URLへ変換する。 */
export async function materializePreviewAssets(
  sources: readonly ResolvedPreviewAsset[],
  options: MaterializePreviewAssetsOptions = {},
): Promise<MaterializedPreviewAssets> {
  const fetchAsset = options.fetch ?? ((url, init) => fetch(url, init));
  const origin = options.origin ?? window.location.origin;
  const createObjectURL = options.createObjectURL;
  const revokeObjectURL =
    options.revokeObjectURL ??
    ((url) => {
      URL.revokeObjectURL(url);
    });
  const maxAssetBytes = byteLimit(options.maxAssetBytes, DEFAULT_MAX_ASSET_BYTES, 'maxAssetBytes');
  const maxTotalBytes = byteLimit(options.maxTotalBytes, DEFAULT_MAX_TOTAL_BYTES, 'maxTotalBytes');
  const controller = new AbortController();
  const abortFromCaller = (): void => {
    controller.abort(options.signal?.reason);
  };
  if (options.signal?.aborted === true) controller.abort(options.signal.reason);
  else options.signal?.addEventListener('abort', abortFromCaller, { once: true });

  const idCounts = new Map<string, number>();
  for (const source of sources) idCounts.set(source.id, (idCounts.get(source.id) ?? 0) + 1);
  const assets: ResolvedPreviewAsset[] = [];
  const diagnostics: RunnerDiagnostic[] = [];
  const objectUrls = new Set<string>();
  let totalBytes = 0;
  let disposed = false;
  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    for (const url of objectUrls) revokeObjectURL(url);
    objectUrls.clear();
  };

  try {
    for (const source of sources) {
      throwIfAborted(controller.signal);
      if (!SAFE_ASSET_ID.test(source.id) || source.id.length > MAX_ASSET_ID_LENGTH) {
        diagnostics.push(diagnostic('ASSET_INVALID_ID', source, 'asset ID is invalid'));
        continue;
      }
      if ((idCounts.get(source.id) ?? 0) > 1) {
        diagnostics.push(diagnostic('ASSET_DUPLICATE_ID', source, 'asset ID is duplicated'));
        continue;
      }
      const requestUrl = sameOriginHttpUrl(source.url, origin);
      if (requestUrl === undefined) {
        diagnostics.push(
          diagnostic('ASSET_SOURCE_REJECTED', source, 'asset source must be same-origin HTTP(S)'),
        );
        continue;
      }

      try {
        const result = await fetchAsset(requestUrl.href, {
          credentials: 'same-origin',
          redirect: 'error',
          signal: controller.signal,
        });
        throwIfAborted(controller.signal);
        if (!result.ok) {
          await cancelBody(result.body, new Error('Preview asset response was not successful'));
          diagnostics.push(
            diagnostic('ASSET_LOAD_FAILED', source, `HTTP ${String(result.status)}`),
          );
          continue;
        }
        if (
          result.url.length > 0 &&
          sameOriginHttpUrl(result.url, origin)?.origin !== requestUrl.origin
        ) {
          await cancelBody(result.body, new Error('Preview asset response URL was rejected'));
          diagnostics.push(
            diagnostic(
              'ASSET_SOURCE_REJECTED',
              source,
              'redirected outside the application origin',
            ),
          );
          continue;
        }
        const mime = result.headers.get('content-type') ?? '';
        if (!matchesMediaType(source.mediaType, mime)) {
          await cancelBody(result.body, new Error('Preview asset MIME type was rejected'));
          diagnostics.push(
            diagnostic('ASSET_MIME_MISMATCH', source, `unexpected MIME type: ${mime || '(empty)'}`),
          );
          continue;
        }
        const declaredBytes = declaredContentLength(result.headers);
        if (declaredBytes !== undefined && declaredBytes > maxAssetBytes) {
          await cancelBody(result.body, new Error('Preview asset exceeds item byte limit'));
          diagnostics.push(
            diagnostic('ASSET_TOO_LARGE', source, `asset exceeds ${String(maxAssetBytes)} bytes`),
          );
          continue;
        }
        if (declaredBytes !== undefined && totalBytes + declaredBytes > maxTotalBytes) {
          await cancelBody(result.body, new Error('Preview assets exceed total byte limit'));
          diagnostics.push(
            diagnostic(
              'ASSET_TOTAL_TOO_LARGE',
              source,
              `assets exceed ${String(maxTotalBytes)} bytes`,
            ),
          );
          continue;
        }
        const normalizedMime = mime.split(';', 1)[0]!.trim().toLowerCase();
        const bounded = await readBoundedBody(
          result.body,
          normalizedMime,
          maxAssetBytes,
          maxTotalBytes - totalBytes,
          controller.signal,
        );
        throwIfAborted(controller.signal);
        if (bounded.failure !== undefined) {
          diagnostics.push(
            bounded.failure === 'ASSET_TOO_LARGE'
              ? diagnostic(
                  'ASSET_TOO_LARGE',
                  source,
                  `asset exceeds ${String(maxAssetBytes)} bytes`,
                )
              : diagnostic(
                  'ASSET_TOTAL_TOO_LARGE',
                  source,
                  `assets exceed ${String(maxTotalBytes)} bytes`,
                ),
          );
          continue;
        }
        const blob = bounded.blob!;
        const assetUrl =
          createObjectURL === undefined ? await blobToDataUrl(blob) : createObjectURL(blob);
        throwIfAborted(controller.signal);
        if (createObjectURL !== undefined) {
          if (!assetUrl.startsWith('blob:')) {
            throw new Error('Object URL API returned a non-blob URL');
          }
          objectUrls.add(assetUrl);
        } else if (!assetUrl.startsWith(`data:${normalizedMime};base64,`)) {
          throw new Error('Data URL conversion returned an unexpected MIME type');
        }
        totalBytes += blob.size;
        assets.push({ ...source, url: assetUrl });
      } catch (error) {
        if (isAbortFailure(controller.signal, error)) {
          throw abortError(controller.signal.reason ?? error);
        }
        diagnostics.push(
          diagnostic(
            'ASSET_LOAD_FAILED',
            source,
            error instanceof Error ? error.message : String(error),
          ),
        );
      }
    }
  } catch (error) {
    dispose();
    throw error;
  } finally {
    options.signal?.removeEventListener('abort', abortFromCaller);
  }

  return { assets, diagnostics, dispose };
}
