/** Full／read-only共通でLearner CSSから外部resource境界だけをtoken単位で除去する。 */
import type { ResolvedPreviewAsset, RunnerDiagnostic } from '../../../core/runtime/contracts';

export interface SanitizedCss {
  readonly css: string;
  readonly diagnostics: readonly RunnerDiagnostic[];
}

type AssetMediaType = ResolvedPreviewAsset['mediaType'];

interface ConsumedIdentifier {
  readonly decoded: string;
  readonly end: number;
}

interface ConsumedEscape {
  readonly decoded: string;
  readonly end: number;
}

interface ConsumedFunction {
  readonly inner: string;
  readonly end: number;
}

const CSS_WHITESPACE = new Set(['\t', '\n', '\f', '\r', ' ']);
const SAFE_IMAGE_DATA_MIME = new Set([
  'image/avif',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/svg+xml',
  'image/webp',
]);
const SAFE_FONT_DATA_MIME = new Set([
  'application/font-woff',
  'application/vnd.ms-fontobject',
  'font/otf',
  'font/ttf',
  'font/woff',
  'font/woff2',
]);

/** Learner向けsecurity warningを共通契約で生成する。 */
function warning(code: string, learnerMessage: string): RunnerDiagnostic {
  return {
    code,
    kind: 'security',
    severity: 'warning',
    message: learnerMessage,
    learnerMessage,
  };
}

/** CSS identifierへ含められるASCII name文字またはnon-ASCII文字かを判定する。 */
function isNameCharacter(character: string | undefined): boolean {
  if (character === undefined) return false;
  const codePoint = character.codePointAt(0)!;
  return /[a-z0-9_-]/iu.test(character) || codePoint >= 0x80;
}

/** CSS hex digitかを判定する。 */
function isHexDigit(character: string | undefined): boolean {
  return character !== undefined && /[a-f0-9]/iu.test(character);
}

/** CSS escapeを1 code pointへdecodeし、無効な改行escapeは拒否する。 */
function consumeEscape(source: string, start: number): ConsumedEscape | undefined {
  if (source[start] !== '\\' || start + 1 >= source.length) return undefined;
  const next = source[start + 1]!;
  if (next === '\n' || next === '\r' || next === '\f') return undefined;
  if (!isHexDigit(next)) return { decoded: next, end: start + 2 };

  let end = start + 1;
  while (end < source.length && end < start + 7 && isHexDigit(source[end])) end += 1;
  const hexadecimal = source.slice(start + 1, end);
  let codePoint = Number.parseInt(hexadecimal, 16);
  if (codePoint === 0 || codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)) {
    codePoint = 0xfffd;
  }
  if (CSS_WHITESPACE.has(source[end] ?? '')) {
    if (source[end] === '\r' && source[end + 1] === '\n') end += 2;
    else end += 1;
  }
  return { decoded: String.fromCodePoint(codePoint), end };
}

/** CSS string内のbackslash付き改行を消費し、該当しなければundefinedを返す。 */
function consumeEscapedNewline(source: string, start: number): number | undefined {
  if (source[start] !== '\\') return undefined;
  const next = source[start + 1];
  if (next === '\r') return source[start + 2] === '\n' ? start + 3 : start + 2;
  if (next === '\n' || next === '\f') return start + 2;
  return undefined;
}

/** CSS identifierをcomment境界を越えずに読み、escape後の値と終端を返す。 */
function consumeIdentifier(source: string, start: number): ConsumedIdentifier {
  let decoded = '';
  let index = start;
  while (index < source.length) {
    const character = source[index];
    if (character === undefined) break;
    if (isNameCharacter(character)) {
      decoded += character;
      index += character.length;
      continue;
    }
    if (character === '\\') {
      const escaped = consumeEscape(source, index);
      if (escaped === undefined) break;
      decoded += escaped.decoded;
      index = escaped.end;
      continue;
    }
    break;
  }
  return { decoded, end: index };
}

/** CSS commentの閉じ位置またはEOFを返す。 */
function consumeComment(source: string, start: number): number {
  const end = source.indexOf('*/', start + 2);
  return end === -1 ? source.length : end + 2;
}

/** CSS stringをescape込みで読み、閉じquote直後・bad string改行・EOFを返す。 */
function consumeString(source: string, start: number): number {
  const quote = source[start];
  let index = start + 1;
  while (index < source.length) {
    if (source[index] === quote) return index + 1;
    if (source[index] === '\n' || source[index] === '\r' || source[index] === '\f') return index;
    if (source[index] === '\\') {
      const escapedNewlineEnd = consumeEscapedNewline(source, index);
      if (escapedNewlineEnd !== undefined) {
        index = escapedNewlineEnd;
        continue;
      }
      const escaped = consumeEscape(source, index);
      index = escaped?.end ?? Math.min(index + 2, source.length);
      continue;
    }
    index += 1;
  }
  return source.length;
}

/** @importのsemicolonまたはblock終端をstring/comment/括弧を考慮して探す。 */
function consumeAtRule(source: string, start: number): number {
  let parentheses = 0;
  let brackets = 0;
  let braces = 0;
  let index = start;
  while (index < source.length) {
    if (source.startsWith('/*', index)) {
      index = consumeComment(source, index);
      continue;
    }
    const character = source[index]!;
    if (character === '"' || character === "'") {
      index = consumeString(source, index);
      continue;
    }
    if (character === '\\') {
      index = consumeEscape(source, index)?.end ?? index + 1;
      continue;
    }
    if (character === '(') parentheses += 1;
    else if (character === ')') parentheses = Math.max(0, parentheses - 1);
    else if (character === '[') brackets += 1;
    else if (character === ']') brackets = Math.max(0, brackets - 1);
    else if (character === '{') braces += 1;
    else if (character === '}') {
      if (braces > 0) {
        braces -= 1;
        if (braces === 0 && parentheses === 0 && brackets === 0) return index + 1;
      }
    } else if (character === ';' && parentheses === 0 && brackets === 0 && braces === 0) {
      return index + 1;
    }
    index += 1;
  }
  return source.length;
}

/** function括弧をstring/comment/escape込みで読み、inner textと終端を返す。 */
function consumeFunction(source: string, openParenthesis: number): ConsumedFunction {
  let depth = 1;
  let index = openParenthesis + 1;
  while (index < source.length) {
    if (source.startsWith('/*', index)) {
      index = consumeComment(source, index);
      continue;
    }
    const character = source[index]!;
    if (character === '"' || character === "'") {
      index = consumeString(source, index);
      continue;
    }
    if (character === '\\') {
      index = consumeEscape(source, index)?.end ?? index + 1;
      continue;
    }
    if (character === '(') depth += 1;
    if (character === ')') {
      depth -= 1;
      if (depth === 0) {
        return { inner: source.slice(openParenthesis + 1, index), end: index + 1 };
      }
    }
    index += 1;
  }
  return { inner: source.slice(openParenthesis + 1), end: source.length };
}

/** CSS whitespaceだけを両端から除く。 */
function trimCssWhitespace(value: string): string {
  let start = 0;
  let end = value.length;
  while (start < end && CSS_WHITESPACE.has(value[start]!)) start += 1;
  while (end > start && CSS_WHITESPACE.has(value[end - 1]!)) end -= 1;
  return value.slice(start, end);
}

/** quoted CSS stringをdecodeし、quote後に余分なtokenがあれば拒否する。 */
function decodeQuotedUrl(value: string): string | undefined {
  const quote = value[0];
  let decoded = '';
  let index = 1;
  while (index < value.length) {
    const character = value[index]!;
    if (character === quote) {
      return trimCssWhitespace(value.slice(index + 1)).length === 0 ? decoded : undefined;
    }
    if (character === '\n' || character === '\r' || character === '\f') return undefined;
    if (character === '\\') {
      const escapedNewlineEnd = consumeEscapedNewline(value, index);
      if (escapedNewlineEnd !== undefined) {
        index = escapedNewlineEnd;
        continue;
      }
      const escaped = consumeEscape(value, index);
      if (escaped === undefined) return undefined;
      decoded += escaped.decoded;
      index = escaped.end;
      continue;
    }
    decoded += character;
    index += 1;
  }
  return undefined;
}

/** quoted/unquoted url()値をCSS escape後の単一文字列へ変換する。 */
function decodeUrlValue(inner: string): string | undefined {
  const value = trimCssWhitespace(inner);
  if (value.length === 0 || value.includes('/*')) return undefined;
  if (value[0] === '"' || value[0] === "'") return decodeQuotedUrl(value);

  let decoded = '';
  let index = 0;
  while (index < value.length) {
    const character = value[index]!;
    const codePoint = character.codePointAt(0)!;
    if (
      CSS_WHITESPACE.has(character) ||
      character === '"' ||
      character === "'" ||
      character === '(' ||
      character === ')' ||
      codePoint < 0x20 ||
      codePoint === 0x7f
    ) {
      return undefined;
    }
    if (character === '\\') {
      const escaped = consumeEscape(value, index);
      if (escaped === undefined) return undefined;
      decoded += escaped.decoded;
      index = escaped.end;
      continue;
    }
    decoded += character;
    index += character.length;
  }
  return decoded;
}

/** 解決済みAsset URLがmedia typeと一致するblob/data URLかを検証する。 */
function trustedAssetUrl(asset: ResolvedPreviewAsset): string | undefined {
  if (asset.mediaType === 'other' || containsUnsafeAssetUrlCharacter(asset.url)) return undefined;
  if (asset.url.startsWith('blob:') && asset.url.length > 'blob:'.length) return asset.url;
  const data = /^data:([^;,]+)(?:;[^,]*)?,/iu.exec(asset.url);
  if (data === null) return undefined;
  const mime = data[1]!.toLowerCase();
  if (asset.mediaType === 'image' && SAFE_IMAGE_DATA_MIME.has(mime)) return asset.url;
  if (asset.mediaType === 'font' && SAFE_FONT_DATA_MIME.has(mime)) return asset.url;
  return undefined;
}

/** CSS URL tokenを壊す空白・制御文字・区切り文字がAsset URLに含まれるか判定する。 */
function containsUnsafeAssetUrlCharacter(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (
      codePoint === undefined ||
      codePoint <= 0x20 ||
      character === '"' ||
      character === "'" ||
      character === '(' ||
      character === ')' ||
      character === '\\'
    ) {
      return true;
    }
  }
  return false;
}

/** asset:<id>だけを一意な信頼済みAsset URLへ解決し、直接URLと重複IDを拒否する。 */
export function resolvePreviewAssetUrl(
  reference: string,
  assets: readonly ResolvedPreviewAsset[],
  allowedMediaTypes: ReadonlySet<AssetMediaType>,
): string | undefined {
  if (!reference.startsWith('asset:')) return undefined;
  const id = reference.slice('asset:'.length);
  if (id.length === 0) return undefined;
  const matches = assets.filter((asset) => asset.id === id);
  if (matches.length !== 1 || !allowedMediaTypes.has(matches[0]!.mediaType)) return undefined;
  return trustedAssetUrl(matches[0]!);
}

/** @importと未許可resource URLをtoken境界で無効化し、CSPと二重でNetworkを遮断する。 */
export function sanitizeCss(source: string, assets: readonly ResolvedPreviewAsset[]): SanitizedCss {
  const diagnostics: RunnerDiagnostic[] = [];
  const output: string[] = [];
  const cssMediaTypes = new Set<AssetMediaType>(['image', 'font']);
  let index = 0;

  while (index < source.length) {
    if (source.startsWith('/*', index)) {
      const end = consumeComment(source, index);
      output.push(source.slice(index, end));
      index = end;
      continue;
    }
    const character = source[index]!;
    if (character === '"' || character === "'") {
      const end = consumeString(source, index);
      output.push(source.slice(index, end));
      index = end;
      continue;
    }
    if (character === '@') {
      const identifier = consumeIdentifier(source, index + 1);
      if (identifier.decoded.toLowerCase() === 'import') {
        index = consumeAtRule(source, identifier.end);
        diagnostics.push(
          warning('CSS_IMPORT_REMOVED', '外部CSSの読み込みはプレビューでは使えません'),
        );
        continue;
      }
    }
    if (isNameCharacter(character) || character === '\\') {
      const identifier = consumeIdentifier(source, index);
      if (
        identifier.end > index &&
        identifier.decoded.toLowerCase() === 'url' &&
        source[identifier.end] === '('
      ) {
        const consumed = consumeFunction(source, identifier.end);
        const reference = decodeUrlValue(consumed.inner);
        const resolved =
          reference === undefined
            ? undefined
            : resolvePreviewAssetUrl(reference, assets, cssMediaTypes);
        output.push(`url(${JSON.stringify(resolved ?? '')})`);
        if (resolved === undefined) {
          diagnostics.push(
            warning('CSS_URL_REMOVED', '教材に含まれない画像やフォントのURLを外しました'),
          );
        }
        index = consumed.end;
        continue;
      }
      if (identifier.end > index) {
        output.push(source.slice(index, identifier.end));
        index = identifier.end;
        continue;
      }
    }
    output.push(character);
    index += character.length;
  }

  return { css: output.join(''), diagnostics };
}
