/** Public pathをURL parserで解釈しても同一Origin／base内へ保つ純粋helper module。 */
const SENTINEL_ORIGIN = 'https://tsumucode.invalid';
const PROTOCOL_OR_NETWORK_PATH = /^[a-z][a-z\d+.-]*:|^\/\//i;
const BASE_PATH_ERROR = 'BASE_PATHは同一OriginのPathで指定してください。';
const PUBLIC_ASSET_ERROR = 'Public Asset pathは安全な相対Pathで指定してください。';

/** Path契約違反を同じError型と文言で失敗させる。 */
function failPath(message: string): never {
  throw new Error(message);
}

/** 多重percent encodingを固定点までdecodeし、不正escapeを拒否する。 */
function decodeToFixedPoint(segment: string, errorMessage: string): string {
  let decoded = segment;
  for (let remaining = segment.length + 1; remaining > 0; remaining -= 1) {
    let next: string;
    try {
      next = decodeURIComponent(decoded);
    } catch {
      return failPath(errorMessage);
    }
    if (next === decoded) return decoded;
    decoded = next;
  }
  return failPath(errorMessage);
}

/** ASCIIのC0制御文字またはDELが含まれるかをcode pointで判定する。 */
function containsAsciiControlCharacter(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f)) return true;
  }
  return false;
}

/** Slashで分割した各segmentがURL正規化で構造を変えないことを検証する。 */
function assertCanonicalSegments(path: string, errorMessage: string): void {
  const segments = path.split('/');
  if (segments.some((segment) => segment.length === 0)) failPath(errorMessage);
  for (const segment of segments) {
    const decoded = decodeToFixedPoint(segment, errorMessage);
    if (
      decoded === '.' ||
      decoded === '..' ||
      decoded.includes('/') ||
      decoded.includes('\\') ||
      containsAsciiControlCharacter(decoded)
    ) {
      failPath(errorMessage);
    }
  }
}

/** 任意表記のBASE_PATHを同一Originのcanonical pathnameへ正規化する。 */
export function normalizePublicBasePath(value: string | undefined): string {
  const trimmed = value?.trim() ?? '';
  if (trimmed === '' || trimmed === '/') return '/';
  if (
    PROTOCOL_OR_NETWORK_PATH.test(trimmed) ||
    trimmed.includes('\\') ||
    trimmed.includes('?') ||
    trimmed.includes('#')
  ) {
    return failPath(BASE_PATH_ERROR);
  }

  const withoutLeadingSlash = trimmed.startsWith('/') ? trimmed.slice(1) : trimmed;
  const path = withoutLeadingSlash.endsWith('/')
    ? withoutLeadingSlash.slice(0, -1)
    : withoutLeadingSlash;
  if (path.length === 0) return '/';
  assertCanonicalSegments(path, BASE_PATH_ERROR);

  const canonical = new URL(`/${path}/`, SENTINEL_ORIGIN);
  if (canonical.origin !== SENTINEL_ORIGIN) return failPath(BASE_PATH_ERROR);
  return canonical.pathname.endsWith('/') ? canonical.pathname : `${canonical.pathname}/`;
}

/** ViteのBASE_URLと、安全なPublic相対Pathを結合する。 */
export function resolvePublicAsset(baseUrl: string, relativePath: string): string {
  let normalizedBase: string;
  try {
    normalizedBase = normalizePublicBasePath(baseUrl);
  } catch {
    return failPath(PUBLIC_ASSET_ERROR);
  }

  const path = relativePath.startsWith('./') ? relativePath.slice(2) : relativePath;
  const unsafe =
    path.length === 0 ||
    relativePath !== relativePath.trim() ||
    relativePath.startsWith('/') ||
    PROTOCOL_OR_NETWORK_PATH.test(relativePath) ||
    relativePath.includes('\\') ||
    relativePath.includes('?') ||
    relativePath.includes('#');

  if (unsafe) return failPath(PUBLIC_ASSET_ERROR);
  assertCanonicalSegments(path, PUBLIC_ASSET_ERROR);

  const base = new URL(normalizedBase, SENTINEL_ORIGIN);
  const target = new URL(path, base);
  if (target.origin !== SENTINEL_ORIGIN || !target.pathname.startsWith(base.pathname)) {
    return failPath(PUBLIC_ASSET_ERROR);
  }
  return target.pathname;
}
