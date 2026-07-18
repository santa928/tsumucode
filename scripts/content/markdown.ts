/** 教材Sourceを実行可能markupへ展開せず、許可済みSlideBlockだけへ変換する。 */
import { parseDocument } from 'yaml';
import type { SlideBlock } from '../../src/core/content/types';

const DANGEROUS_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const ASSET_ID_PATTERN = '[a-z0-9]+(?:-[a-z0-9]+)*';
const CODE_LANGUAGE_PATTERN = '[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*';
const RAW_MARKUP_PATTERN = /<\/?(?:>|[^\s<>]+(?=\s|\/?>|$))/u;
const JSX_PATTERN = /<\/?(?:>|(?:[$_A-Z]|[a-z][A-Za-z0-9_$]*\.)[^\s<>]*(?=\s|\/?>|$))/u;
const MDX_MODULE_PATTERN = /(?:^|\n)\s*(?:import|export)(?:\s|\{|\*|\/|$)/u;
const VALID_IMAGE_PATTERN = new RegExp(`^!\\[([^\\]]+)\\]\\(asset:(${ASSET_ID_PATTERN})\\)$`, 'u');
const VALID_CODE_FENCE_PATTERN = new RegExp(`^\`\`\`(${CODE_LANGUAGE_PATTERN})$`, 'u');
const UNORDERED_LIST_PATTERN = /^([-*])\s+(.+)$/u;
const ORDERED_LIST_PATTERN = /^(\d+)\.\s+(.+)$/u;

type PlainRecord = Record<string, unknown>;
type DirectiveName = 'practice' | 'callout';

export interface ParsedSlideMarkdown {
  readonly frontmatter: unknown;
  readonly blocks: SlideBlock[];
}

/** C0 control文字のうちMarkdownで必要なTAB／LF以外とDELを検出する。 */
function hasDisallowedControl(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (
      codePoint !== undefined &&
      ((codePoint >= 0 && codePoint <= 8) ||
        codePoint === 11 ||
        codePoint === 12 ||
        (codePoint >= 14 && codePoint <= 31) ||
        (codePoint >= 128 && codePoint <= 159) ||
        codePoint === 127)
    ) {
      return true;
    }
  }
  return false;
}

/** 改行と先頭BOMを正規化し、表示・解析を不安定にするcontrol文字を拒否する。 */
function normalizeSource(source: string): string {
  const withoutBom = source.startsWith('\uFEFF') ? source.slice(1) : source;
  const normalized = withoutBom.replace(/\r\n?/g, '\n');
  if (hasDisallowedControl(normalized) || normalized.includes('\uFEFF')) {
    throw new Error('教材Markdownにcontrol文字は使用できません。');
  }
  return normalized;
}

/** unknownがYAML由来のplain Objectかを判定する。 */
function isPlainRecord(value: unknown): value is PlainRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/** Code以外へ残す文字列にlink／image／Raw HTML／MDXがないことを保証する。 */
function assertSafeRenderedText(value: string): void {
  assertNoUnsupportedLinkOrImage(value);
  const hasMdxBrace = value.includes('{') || value.includes('}');
  if (JSX_PATTERN.test(value) || MDX_MODULE_PATTERN.test(value) || hasMdxBrace) {
    throw new Error('MDXは教材Markdownで使用できません。');
  }
  if (RAW_MARKUP_PATTERN.test(value)) {
    throw new Error('Raw HTMLは教材Markdownで使用できません。');
  }
}

/** YAML値を再帰走査し、prototype汚染keyと実行可能markupを拒否する。 */
function assertSafeYamlValue(value: unknown): void {
  if (typeof value === 'string') {
    assertSafeRenderedText(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) assertSafeYamlValue(item);
    return;
  }
  if (!isPlainRecord(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (DANGEROUS_KEYS.has(key)) {
      throw new Error(`教材YAMLに使用できないkeyがあります: ${key}`);
    }
    assertSafeRenderedText(key);
    assertSafeYamlValue(child);
  }
}

/** YAML 1.2 coreを安全設定でparseし、低水準parser errorを日本語へ包む。 */
function parseSafeYaml(source: string, label: string): unknown {
  let document;
  try {
    document = parseDocument(source, {
      version: '1.2',
      schema: 'core',
      strict: true,
      stringKeys: true,
      uniqueKeys: true,
    });
  } catch {
    throw new Error(`${label}のYAMLが不正です。`);
  }

  if (document.errors.length > 0 || document.warnings.length > 0) {
    throw new Error(`${label}のYAMLが不正です。`);
  }

  let value: unknown;
  try {
    value = document.toJS({ maxAliasCount: 0 }) as unknown;
  } catch {
    throw new Error(`${label}でYAML aliasは使用できません。`);
  }
  assertSafeYamlValue(value);
  return value;
}

/** Objectのkey集合がdirectiveの公開契約と完全一致することを確認する。 */
function hasExactKeys(
  record: PlainRecord,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean {
  const allowed = new Set([...required, ...optional]);
  return (
    required.every((key) => Object.hasOwn(record, key)) &&
    Object.keys(record).every((key) => allowed.has(key))
  );
}

/** 空白だけでない安全な教材文字列を返す。 */
function readNonEmptyText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  assertSafeRenderedText(trimmed);
  return trimmed;
}

/** practice YAMLをexact schemaで検証してSlideBlockへ変換する。 */
function parsePracticeDirective(source: string): SlideBlock {
  const value = parseSafeYaml(source, 'practice');
  if (
    !isPlainRecord(value) ||
    !hasExactKeys(value, ['prompt', 'expectedAction', 'estimatedMinutes'])
  ) {
    throw new Error('practiceの指定が不正です。');
  }
  const prompt = readNonEmptyText(value.prompt);
  const expectedAction = readNonEmptyText(value.expectedAction);
  const estimatedMinutes = value.estimatedMinutes;
  if (
    prompt === undefined ||
    expectedAction === undefined ||
    typeof estimatedMinutes !== 'number' ||
    !Number.isInteger(estimatedMinutes) ||
    estimatedMinutes < 1 ||
    estimatedMinutes > 5
  ) {
    throw new Error('practiceの指定が不正です。');
  }
  return { type: 'practice', prompt, expectedAction, estimatedMinutes };
}

/** callout YAMLをexact schemaで検証してSlideBlockへ変換する。 */
function parseCalloutDirective(source: string): SlideBlock {
  const value = parseSafeYaml(source, 'callout');
  if (!isPlainRecord(value) || !hasExactKeys(value, ['tone', 'text'], ['title'])) {
    throw new Error('calloutの指定が不正です。');
  }
  const text = readNonEmptyText(value.text);
  const title = Object.hasOwn(value, 'title') ? readNonEmptyText(value.title) : undefined;
  if (
    (value.tone !== 'note' && value.tone !== 'tip' && value.tone !== 'warning') ||
    text === undefined ||
    (Object.hasOwn(value, 'title') && title === undefined)
  ) {
    throw new Error('calloutの指定が不正です。');
  }
  return {
    type: 'callout',
    tone: value.tone,
    ...(title === undefined ? {} : { title }),
    text,
  };
}

/** directive開始位置から終端までを読み、Blockと次の行indexを返す。 */
function parseDirective(
  lines: readonly string[],
  index: number,
  name: DirectiveName,
): { readonly block: SlideBlock; readonly nextIndex: number } {
  const yamlLines: string[] = [];
  let cursor = index + 1;
  while (cursor < lines.length && lines[cursor] !== ':::') {
    const line = lines[cursor] ?? '';
    if (line.startsWith(':::')) {
      throw new Error(`${name} directiveを入れ子にできません。`);
    }
    yamlLines.push(line);
    cursor += 1;
  }
  if (lines[cursor] !== ':::') {
    throw new Error(`${name} directiveが閉じられていません。`);
  }
  const yamlSource = yamlLines.join('\n');
  const block =
    name === 'practice' ? parsePracticeDirective(yamlSource) : parseCalloutDirective(yamlSource);
  return { block, nextIndex: cursor + 1 };
}

/** Markdown image／linkが許可済みasset image以外として残らないよう検証する。 */
function assertNoUnsupportedLinkOrImage(value: string): void {
  if (/(?:^|[^<])!\[/u.test(value)) {
    throw new Error('画像は空でないaltとlower-kebab-caseのasset IDで指定してください。');
  }
  if (
    /\[[^\n]*\]\s*(?:\(|\[)/u.test(value) ||
    /^\s*\[[^\]]+\]:/u.test(value) ||
    /<(?:[A-Za-z][A-Za-z0-9+.-]*:[^<>\s]*|[^<>\s@]+@[^<>\s@]+)>/u.test(value) ||
    /\b(?:[A-Za-z][A-Za-z0-9+.-]*:\/\/|www\.)\S+/u.test(value) ||
    /\b[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+\b/u.test(value)
  ) {
    throw new Error('外部リンク／Markdown linkは教材Markdownで使用できません。');
  }
}

/** CommonMarkのthematic breakとして解釈される行かを判定する。 */
function isHorizontalRule(line: string): boolean {
  const trimmed = line.trim();
  return /^(?:(?:\*\s*){3,}|(?:-\s*){3,}|(?:_\s*){3,})$/u.test(trimmed);
}

/** GFM tableのdelimiter rowとして解釈される行かを判定する。 */
function isTableDelimiter(line: string): boolean {
  return /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/u.test(line);
}

/** 行が次のBlockまたは未対応Block構文の開始位置かを判定する。 */
function isBlockBoundary(line: string): boolean {
  return (
    /^:::/u.test(line) ||
    /^```/u.test(line) ||
    /^~~~/u.test(line) ||
    /^#{1,6}(?:\s|$)/u.test(line) ||
    /^!\[/u.test(line) ||
    /^[-*](?:\s|$)/u.test(line) ||
    /^\d+\.\s*/u.test(line) ||
    /^\+(?:\s|$)/u.test(line) ||
    /^\d+\)(?:\s|$)/u.test(line) ||
    /^(?:>|\|| {1,}|\t)/u.test(line) ||
    /^=+\s*$/u.test(line) ||
    isHorizontalRule(line) ||
    isTableDelimiter(line)
  );
}

/** paragraphへfallbackさせない未対応Markdown block syntaxを拒否する。 */
function assertNoUnsupportedBlockSyntax(line: string): void {
  if (
    /^~~~/u.test(line) ||
    /^(?:>|\|| {1,}|\t)/u.test(line) ||
    /^=+\s*$/u.test(line) ||
    /^\+(?:\s|$)/u.test(line) ||
    /^\d+\)(?:\s|$)/u.test(line) ||
    isHorizontalRule(line) ||
    isTableDelimiter(line)
  ) {
    throw new Error('未対応のMarkdown構文は使用できません。');
  }
}

/** list開始位置から同種のitemを読み、Blockと次の行indexを返す。 */
function parseList(
  lines: readonly string[],
  index: number,
  style: 'ordered' | 'unordered',
): { readonly block: SlideBlock; readonly nextIndex: number } {
  const pattern = style === 'ordered' ? ORDERED_LIST_PATTERN : UNORDERED_LIST_PATTERN;
  const malformedPattern = style === 'ordered' ? /^\d+\.\s*$/u : /^[-*]\s*$/u;
  const items: string[] = [];
  let expectedMarker = style === 'ordered' ? '1' : undefined;
  let cursor = index;
  while (cursor < lines.length) {
    const line = lines[cursor] ?? '';
    const match = line.match(pattern);
    if (match === null) {
      if (malformedPattern.test(line)) throw new Error('空のlist itemは使用できません。');
      break;
    }
    const marker = match[1] ?? '';
    if (expectedMarker === undefined) {
      expectedMarker = marker;
    } else if (marker !== expectedMarker) {
      throw new Error(
        style === 'ordered'
          ? 'ordered listは1から始まる連番で指定してください。'
          : 'unordered listのmarkerを混在できません。',
      );
    }
    const item = match[2]?.trim() ?? '';
    if (item.length === 0) throw new Error('空のlist itemは使用できません。');
    assertSafeRenderedText(item);
    items.push(item);
    if (style === 'ordered') expectedMarker = String(items.length + 1);
    cursor += 1;
  }
  return { block: { type: 'list', style, items }, nextIndex: cursor };
}

/** YAML Frontmatter付きSlide Markdownを検証済みDataへ変換する。 */
export function parseSlideMarkdown(source: string): ParsedSlideMarkdown {
  const normalized = normalizeSource(source);
  const lines = normalized.split('\n');
  if (lines[0] !== '---') {
    throw new Error('Slide MarkdownにはYAML Frontmatterが必要です。');
  }

  const closingIndex = lines.findIndex((line, index) => index > 0 && line === '---');
  if (closingIndex < 0) {
    throw new Error('Slide MarkdownのFrontmatterが閉じられていません。');
  }

  const frontmatter = parseSafeYaml(lines.slice(1, closingIndex).join('\n'), 'Frontmatter');
  if (!isPlainRecord(frontmatter)) {
    throw new Error('Slide MarkdownのFrontmatterはObjectで指定してください。');
  }

  return {
    frontmatter,
    blocks: parseRestrictedMarkdown(lines.slice(closingIndex + 1).join('\n')),
  };
}

/** Raw HTML／MDXを許さず、教材表示用の許可済みBlockだけを返す。 */
export function parseRestrictedMarkdown(source: string): SlideBlock[] {
  const lines = normalizeSource(source).split('\n');
  const blocks: SlideBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? '';
    if (line.trim().length === 0) {
      index += 1;
      continue;
    }

    if (line === ':::practice' || line === ':::callout') {
      const name: DirectiveName = line === ':::practice' ? 'practice' : 'callout';
      const parsed = parseDirective(lines, index, name);
      blocks.push(parsed.block);
      index = parsed.nextIndex;
      continue;
    }
    if (line.startsWith(':::')) {
      throw new Error(`未対応のdirectiveです: ${line}`);
    }

    if (line.startsWith('```')) {
      if (line === '```') throw new Error('Code fenceには言語名が必要です。');
      const fence = line.match(VALID_CODE_FENCE_PATTERN);
      if (fence === null) throw new Error('Code fenceの開始行が不正です。');
      const code: string[] = [];
      let cursor = index + 1;
      while (cursor < lines.length && lines[cursor] !== '```') {
        code.push(lines[cursor] ?? '');
        cursor += 1;
      }
      if (lines[cursor] !== '```') throw new Error('Code fenceが閉じられていません。');
      blocks.push({ type: 'code', language: fence[1] ?? '', code: code.join('\n') });
      index = cursor + 1;
      continue;
    }

    const image = line.match(VALID_IMAGE_PATTERN);
    if (image !== null) {
      const alt = image[1]?.trim() ?? '';
      const assetId = image[2] ?? '';
      if (alt.length === 0 || assetId.length === 0) {
        throw new Error('画像は空でないaltとlower-kebab-caseのasset IDで指定してください。');
      }
      assertSafeRenderedText(alt);
      blocks.push({ type: 'image', alt, assetId });
      index += 1;
      continue;
    }
    if (line.startsWith('![')) {
      throw new Error('画像は空でないaltとlower-kebab-caseのasset IDで指定してください。');
    }

    const heading = line.match(/^(##|###)\s+(.+)$/u);
    if (heading !== null) {
      const text = heading[2]?.trim() ?? '';
      if (text.length === 0) throw new Error('見出しには空でないtextが必要です。');
      assertSafeRenderedText(text);
      blocks.push({ type: 'heading', level: heading[1] === '##' ? 2 : 3, text });
      index += 1;
      continue;
    }
    if (/^#+(?:\s|$)/u.test(line)) {
      throw new Error('見出しは空でないlevel 2または3だけ使用できます。');
    }

    assertNoUnsupportedBlockSyntax(line);

    if (UNORDERED_LIST_PATTERN.test(line)) {
      const parsed = parseList(lines, index, 'unordered');
      blocks.push(parsed.block);
      index = parsed.nextIndex;
      continue;
    }
    if (ORDERED_LIST_PATTERN.test(line)) {
      const parsed = parseList(lines, index, 'ordered');
      blocks.push(parsed.block);
      index = parsed.nextIndex;
      continue;
    }
    if (/^(?:[-*]|\d+\.)\s*$/u.test(line)) {
      throw new Error('空のlist itemは使用できません。');
    }

    assertSafeRenderedText(line);

    const paragraph: string[] = [];
    while (index < lines.length) {
      const part = lines[index] ?? '';
      if (part.trim().length === 0 || (paragraph.length > 0 && isBlockBoundary(part))) break;
      assertNoUnsupportedBlockSyntax(part);
      assertSafeRenderedText(part);
      paragraph.push(part.trim());
      index += 1;
    }
    if (paragraph.length === 0) {
      throw new Error('教材Markdownを許可済みBlockへ変換できません。');
    }
    blocks.push({ type: 'paragraph', text: paragraph.join(' ') });
  }

  if (blocks.length === 0) throw new Error('教材Markdown本文が空です。');
  return blocks;
}
