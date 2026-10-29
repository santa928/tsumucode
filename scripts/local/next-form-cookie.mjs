import { nextWorkspace } from './next-project-protocol.mjs';
export const FORM_WORKSPACE = 'next-ch04-l01-e01';
export const ACTION_WORKSPACE = 'next-ch04-l02-e01';
const name = 'lesson-theme';
const epoch = 'Thu, 01 Jan 1970 00:00:00 GMT';

/** 通常HTTPの固定2教材だけで、run内のdocument読取と既存POSTを許可する。 */
function eligible(req, target) {
  if (
    target.profile !== 'next-project-v1' ||
    !['form-route-validation', 'server-action-validation'].includes(
      nextWorkspace(target.workspaceId)?.goal,
    ) ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(target.runId) ||
    !Number.isSafeInteger(target.sourceRevision) ||
    target.sourceRevision < 1 ||
    !/^[a-f0-9]{64}$/u.test(target.sourceHash ?? '') ||
    target.grading === true ||
    req.headers.host !== `${target.runId}.localhost:4175`
  )
    return false;
  const root = `/w/${target.workspaceId}/${target.runId}`;
  const origin = `http://${target.runId}.localhost:4175`;
  if (['GET', 'HEAD'].includes(req.method))
    return req.url === `${root}/` && (!req.headers.origin || req.headers.origin === origin);
  return (
    req.method === 'POST' &&
    req.headers.origin === origin &&
    (nextWorkspace(target.workspaceId)?.goal === 'form-route-validation'
      ? req.url === `${root}/api/note`
      : [root, `${root}/`].includes(req.url))
  );
}

/** 生Cookieを補正せず、単一の有限値だけから上流ヘッダーを作り直す。 */
export function lessonThemeRequestHeaders(req, target) {
  if (!eligible(req, target)) return {};
  const value = req.headers.cookie;
  if (typeof value !== 'string' || value.length > 4096 || /[^\x20-\x7e]/u.test(value)) return {};
  const raw = req.rawHeaders ?? [];
  if (raw.filter((item, index) => index % 2 === 0 && item.toLowerCase() === 'cookie').length > 1)
    return {};
  let theme;
  for (const part of value.split(';')) {
    const match =
      /^([!#$%&'*+.^_`|~0-9A-Za-z-]+)=([!\x23-\x2b\x2d-\x3a\x3c-\x5b\x5d-\x7e]*)$/u.exec(
        part.trim(),
      );
    if (!match) return {};
    if (match[1] !== name) continue;
    if (theme !== undefined || !['light', 'dark'].includes(match[2])) return {};
    theme = match[2];
  }
  return theme === undefined ? {} : { cookie: `${name}=${theme}` };
}

/** Nextのsession set／epoch deleteだけを受け、host-only・固定Pathへ再生成する。 */
function canonicalCookie(fields, target) {
  if (!Array.isArray(fields) || fields.length > 32) return undefined;
  const matching = fields.filter(
    (field) => typeof field === 'string' && field.trimStart().startsWith(`${name}=`),
  );
  if (matching.length !== 1) return undefined;
  const field = matching[0];
  if (field.length > 1024 || /[^\x20-\x7e]/u.test(field)) return undefined;
  const [pair, ...parts] = field.split(';').map((part) => part.trim());
  const value = pair.slice(name.length + 1);
  if (!['light', 'dark', ''].includes(value)) return undefined;
  const attributes = new Map();
  for (const part of parts) {
    const index = part.indexOf('=');
    const key = (index < 0 ? part : part.slice(0, index)).toLowerCase();
    const attribute = index < 0 ? true : part.slice(index + 1);
    if (attributes.has(key)) return undefined;
    attributes.set(key, attribute);
  }
  const path = `/w/${target.workspaceId}/${target.runId}`;
  for (const [key, attribute] of attributes) {
    if (key === 'path' && ['/', path].includes(attribute)) continue;
    if (key === 'httponly' && attribute === true) continue;
    if (
      key === 'samesite' &&
      typeof attribute === 'string' &&
      ['strict', 'lax', 'none'].includes(attribute.toLowerCase())
    )
      continue;
    if (value === '' && key === 'max-age' && attribute === '0') continue;
    if (value === '' && key === 'expires' && attribute === epoch) continue;
    return undefined;
  }
  if (value === '' && !attributes.has('max-age') && !attributes.has('expires')) return undefined;
  const cookie = `${name}=${value}; Path=${path}; HttpOnly; SameSite=Strict`;
  return value === '' ? `${cookie}; Max-Age=0; Expires=${epoch}` : cookie;
}

/** 検査済み公開POSTのheaders発行直前に実行・Source・socket・非採点を確認し、失効応答は拒否する。 */
export async function lessonThemeResponseHeaders(req, target, upstream, lookup) {
  if (
    !eligible(req, target) ||
    req.method !== 'POST' ||
    upstream.statusCode < 200 ||
    upstream.statusCode >= 300
  )
    return {};
  const cookie = canonicalCookie(upstream.headers['set-cookie'], target);
  // Cookieのない読取結果も、全量受信中に失効したrunから公開しない。
  const current = await lookup();
  const keys = ['workspaceId', 'profile', 'runId', 'sourceRevision', 'sourceHash', 'dev', 'ino'];
  if (!current || current.grading === true || keys.some((key) => current[key] !== target[key]))
    throw new Error('Expired lesson Cookie response');
  return cookie ? { 'set-cookie': cookie } : {};
}
