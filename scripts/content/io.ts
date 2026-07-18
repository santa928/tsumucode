/** 教材Compiler専用のRoot境界、symlink拒否、fatal UTF-8、strict YAML I/Oを提供する。 */
import { constants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import path from 'node:path';
import type { ZodType } from 'zod';
import { isMap, isScalar, isSeq, parseDocument } from 'yaml';
import { SourcePathSchema } from './sourceSchema';

const DANGEROUS_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

/** candidateがroot自身またはroot配下かを判定する。 */
function isInside(root: string, candidate: string): boolean {
  return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

/** 教材Rootを越えないcanonical表記の字句Pathを返す。 */
export function resolveInside(root: string, relativePath: string): string {
  if (!SourcePathSchema.safeParse(relativePath).success) {
    throw new Error(`教材Rootの外は参照できません: ${relativePath}`);
  }
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, ...relativePath.split('/'));
  if (!isInside(resolvedRoot, resolved)) {
    throw new Error(`教材Rootの外は参照できません: ${relativePath}`);
  }
  return resolved;
}

/** Course相対owner directoryとowner相対Source pathをPOSIX表記で結合する。 */
export function joinSourcePath(ownerDirectory: string, relativePath: string): string {
  if (ownerDirectory !== '' && !SourcePathSchema.safeParse(ownerDirectory).success) {
    throw new Error(`教材Owner Directoryが不正です: ${ownerDirectory}`);
  }
  if (!SourcePathSchema.safeParse(relativePath).success) {
    throw new Error(`教材Source Pathが不正です: ${relativePath}`);
  }
  const joined =
    ownerDirectory === '' ? relativePath : path.posix.join(ownerDirectory, relativePath);
  if (!SourcePathSchema.safeParse(joined).success) {
    throw new Error(`教材Source Pathを安全に結合できません: ${joined}`);
  }
  return joined;
}

/** Rootから対象までの全componentがsymlinkでないことを確認する。 */
async function assertNoSymlinkComponents(root: string, relativePath: string): Promise<void> {
  let current = path.resolve(root);
  for (const segment of relativePath.split('/')) {
    current = path.join(current, segment);
    const stats = await lstat(current);
    if (stats.isSymbolicLink()) {
      throw new Error(`教材Sourceにsymlinkは使用できません: ${relativePath}`);
    }
  }
}

/** Root内の通常Fileをnofollowで開いて読み込む。 */
async function readBinaryFileUnchecked(root: string, relativePath: string): Promise<Uint8Array> {
  const resolvedRoot = path.resolve(root);
  const candidate = resolveInside(resolvedRoot, relativePath);
  const canonicalRoot = await realpath(resolvedRoot);
  await assertNoSymlinkComponents(resolvedRoot, relativePath);
  const canonicalCandidate = await realpath(candidate);
  if (!isInside(canonicalRoot, canonicalCandidate)) {
    throw new Error(`教材Rootの外は参照できません: ${relativePath}`);
  }

  const handle = await open(canonicalCandidate, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stats = await handle.stat();
    if (!stats.isFile()) {
      throw new Error(`教材Sourceは通常Fileである必要があります: ${relativePath}`);
    }
    return Uint8Array.from(await handle.readFile());
  } finally {
    await handle.close();
  }
}

/** Root内の通常Fileを1度だけ読み、低水準I/O errorをpath付き日本語へ包む。 */
export async function readBinaryFile(root: string, relativePath: string): Promise<Uint8Array> {
  try {
    return await readBinaryFileUnchecked(root, relativePath);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('教材')) throw error;
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`教材Source Fileがありません: ${relativePath}`, { cause: error });
    }
    throw new Error(`教材Source Fileを読めません: ${relativePath}`, { cause: error });
  }
}

/** Root内の通常Fileを不正byteを許さないUTF-8として読む。 */
export async function readUtf8File(root: string, relativePath: string): Promise<string> {
  const source = await readBinaryFile(root, relativePath);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(source);
  } catch {
    throw new Error(`教材SourceをUTF-8として読めません: ${relativePath}`);
  }
}

/** YAML由来値がJSON-safeで危険keyを含まないことを再帰的に確認する。 */
function assertSafeYamlValue(value: unknown, relativePath: string): void {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  ) {
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) assertSafeYamlValue(item, relativePath);
    return;
  }
  if (typeof value !== 'object') {
    throw new Error(`教材YAMLにJSON化できない値があります: ${relativePath}`);
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error(`教材YAMLにJSON化できない値があります: ${relativePath}`);
  }
  for (const [key, child] of Object.entries(value)) {
    if (DANGEROUS_KEYS.has(key)) {
      throw new Error(`教材YAMLに使用できないkeyがあります: ${relativePath}/${key}`);
    }
    assertSafeYamlValue(child, relativePath);
  }
}

/** YAML ASTを走査し、暗黙文字列化されるnon-string keyを検出する。 */
function hasNonStringYamlKey(value: unknown): boolean {
  if (isMap(value)) {
    return value.items.some(
      (pair) =>
        !isScalar(pair.key) ||
        typeof pair.key.value !== 'string' ||
        hasNonStringYamlKey(pair.value),
    );
  }
  if (isSeq(value)) return value.items.some(hasNonStringYamlKey);
  return false;
}

/** UTF-8 YAMLを安全設定で読み、指定したstrict Source Schemaへ通す。 */
export async function readYamlFile<T>(
  root: string,
  relativePath: string,
  schema: ZodType<T>,
): Promise<T> {
  const source = await readUtf8File(root, relativePath);
  let document;
  let keyInspectionDocument;
  try {
    keyInspectionDocument = parseDocument(source, {
      version: '1.2',
      schema: 'core',
      strict: true,
      stringKeys: false,
      uniqueKeys: true,
    });
    document = parseDocument(source, {
      version: '1.2',
      schema: 'core',
      strict: true,
      stringKeys: true,
      uniqueKeys: true,
    });
  } catch {
    throw new Error(`教材SourceのYAMLが不正です: ${relativePath}`);
  }
  if (document.errors.length > 0 || document.warnings.length > 0) {
    throw new Error(`教材SourceのYAMLが不正です: ${relativePath}`);
  }
  if (
    keyInspectionDocument.errors.length > 0 ||
    keyInspectionDocument.warnings.length > 0 ||
    hasNonStringYamlKey(keyInspectionDocument.contents)
  ) {
    throw new Error(`教材SourceのYAMLが不正です: ${relativePath}`);
  }

  let value: unknown;
  try {
    value = document.toJS({ maxAliasCount: 0 }) as unknown;
  } catch {
    throw new Error(`教材SourceでYAML aliasは使用できません: ${relativePath}`);
  }
  assertSafeYamlValue(value, relativePath);

  const result = schema.safeParse(value);
  if (!result.success) {
    const firstIssue = result.error.issues[0];
    const issuePath = firstIssue?.path.map(String).join('.') ?? '';
    const location = issuePath.length > 0 ? `${relativePath}:${issuePath}` : relativePath;
    throw new Error(
      `教材Source Schemaに適合しません: ${location}${firstIssue === undefined ? '' : ` ${firstIssue.message}`}`,
    );
  }
  return result.data;
}
