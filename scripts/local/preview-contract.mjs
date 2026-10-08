import { weatherRscRoute } from './next-data-preview.mjs';
import { RequestError } from './protocol.mjs';
import { URLSearchParams } from 'node:url';
import { NEXT_PROFILE, nextWorkspace } from './next-project-protocol.mjs';

export const CONTROL_SOCKET = '/var/run/tsumucode-preview/control.sock';
export const TRANSPORT_ROOT = '/var/lib/tsumucode/preview-transport';
export const PREVIEW_PORT = 4175;
export const PREVIEW_LIMITS = Object.freeze({
  bodyBytes: 64 * 1024,
  responseBytes: 512 * 1024,
  httpMs: 30000,
  httpConnections: 8,
  websocketConnections: 2,
  websocketBytes: 2 * 1024 * 1024,
});

export function previewRunId(value) {
  if (
    typeof value !== 'string' ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(value)
  )
    throw new RequestError(400, 'Preview実行IDが不正です。');
  return value;
}

export function previewBase(workspaceId, runId) {
  return `/w/${workspaceId}/${runId}/`;
}

export function previewOrigin(runId) {
  return `http://${previewRunId(runId)}.localhost:${PREVIEW_PORT}`;
}

/** no-referrer下のnative formだけはOrigin:nullになる。固定echoの同一origin navigationに限定する。 */
export function previewRequestOrigin(req, target, websocket = false) {
  const origin = req.headers.origin;
  if (origin === previewOrigin(target.runId)) return true;
  if (!origin) return !websocket && ['GET', 'HEAD'].includes(req.method);
  return (
    !websocket &&
    origin === 'null' &&
    req.method === 'POST' &&
    req.url === `${previewBase(target.workspaceId, target.runId)}api/echo` &&
    req.headers['content-type'] === 'application/x-www-form-urlencoded' &&
    req.headers['sec-fetch-site'] === 'same-origin' &&
    req.headers['sec-fetch-mode'] === 'navigate' &&
    ['iframe', 'document'].includes(req.headers['sec-fetch-dest'])
  );
}

/** learnerのHTML・meta・上流ヘッダーでは緩和できないBrowser境界を固定する。 */
export function previewHeaders(runId, profile = 'vite-project-v1') {
  return {
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'content-security-policy': [
      'sandbox allow-scripts allow-same-origin allow-forms',
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${profile === NEXT_PROFILE ? " 'unsafe-eval'" : ''}`,
      "style-src 'self' 'unsafe-inline'",
      `connect-src 'self' ${previewOrigin(runId).replace('http:', 'ws:')}`,
      "form-action 'self'",
      'frame-ancestors http://127.0.0.1:4173',
      "worker-src 'none'",
      "object-src 'none'",
      "base-uri 'none'",
      "frame-src 'none'",
    ].join('; '),
  };
}

/** decodeやURL正規化の前にraw pathを検査し、固定Viteの必要経路だけを許可する。 */
export function previewRoute(raw, target, websocket = false) {
  if (target.profile === NEXT_PROFILE) return nextPreviewRoute(raw, target, websocket);
  if (typeof raw !== 'string' || raw.length > 2048 || /[%\\#\s]/u.test(raw)) return false;
  const [pathname, query = ''] = raw.split('?');
  if (
    raw.split('?').length > 2 ||
    pathname.split('/').some((part) => part === '.' || part === '..')
  )
    return false;
  const base = previewBase(target.workspaceId, target.runId);
  if (!pathname.startsWith(base)) return false;
  const file = pathname.slice(base.length);
  const parameters = new URLSearchParams(query);
  if (websocket) {
    return (
      file === 'hmr' &&
      parameters.size === 1 &&
      /^[\w-]{1,128}$/u.test(parameters.get('token') ?? '')
    );
  }
  if (
    ![
      '',
      'index.html',
      'main.js',
      'message.js',
      'styles.css',
      '@vite/client',
      '@fs/opt/node_modules/vite/dist/client/env.mjs',
      'api/echo',
    ].includes(file)
  )
    return false;
  const names = new Set();
  for (const [key, value] of parameters) {
    if (names.has(key)) return false;
    names.add(key);
    if (key === 't' && /^\d{1,16}$/u.test(value)) continue;
    if (key === 'v' && /^[a-f0-9]{1,32}$/u.test(value)) continue;
    if (['import', 'direct'].includes(key) && value === '') continue;
    return false;
  }
  return true;
}

/** 固定Nextのpage/query/chunk/HMRだけを許可する。内部APIや任意percent decodeは認めない。 */
function nextPreviewRoute(raw, target, websocket) {
  const contract = nextWorkspace(target.workspaceId);
  if (!contract) return false;
  if (typeof raw !== 'string' || raw.length > 2048 || /[\\#\s]/u.test(raw)) return false;
  const parts = raw.split('?');
  if (parts.length > 2) return false;
  const [pathname, query = ''] = parts;
  const base = previewBase(target.workspaceId, target.runId);
  if (!pathname.startsWith(base) || pathname.includes('..')) return false;
  const file = pathname.slice(base.length);
  const parameters = new URLSearchParams(query);
  if (websocket) {
    return (
      file === '_next/hmr' &&
      parameters.size === 1 &&
      /^[a-zA-Z0-9._-]{1,128}$/u.test(parameters.get('id') ?? '') &&
      !query.includes('%')
    );
  }
  // 同じrunでも別教材のpage/APIは開かず、固定契約のraw URLだけを通す。
  if (contract.pages.includes(file + (parts.length > 1 ? `?${query}` : ''))) return true;
  if (parts.length > 1) return weatherRscRoute(file, query, target.workspaceId);
  return /^_next\/static\/chunks\/(?:[a-zA-Z0-9_.-]|%5Bturbopack%5D|%40swc){1,180}\.(?:js|css)$/u.test(
    file,
  );
}

/** 上流Content-Typeではなく、trusted profileと検査済み固定chunk経路で上限を選ぶ。 */
export function previewResponseLimit(raw, target) {
  return target.profile === NEXT_PROFILE &&
    previewRoute(raw, target) &&
    raw.startsWith(`${previewBase(target.workspaceId, target.runId)}_next/static/chunks/`)
    ? 2 * 1024 * 1024
    : PREVIEW_LIMITS.responseBytes;
}

export function previewWebSocketProtocol(profile) {
  return profile === NEXT_PROFILE ? undefined : 'vite-hmr';
}
