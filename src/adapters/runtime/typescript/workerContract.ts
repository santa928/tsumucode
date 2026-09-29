import type { TypeScriptCompileResult } from './compileTypeScript';

export interface TypeScriptCompileInput {
  readonly sessionId: string;
  readonly revision: number;
  readonly files: Readonly<Record<string, string>>;
}

export interface CompilerWorkerRequest {
  readonly requestId: string;
  readonly input: TypeScriptCompileInput;
}

/** compilerを初期chunkへimportせず、Workerへ渡す文字列Mapとidentityを検証する。 */
export function isTypeScriptCompileInput(value: unknown): value is TypeScriptCompileInput {
  if (!value || typeof value !== 'object') return false;
  const input = value as Record<string, unknown>;
  if (
    typeof input['sessionId'] !== 'string' ||
    !input['sessionId'] ||
    input['sessionId'].length > 128 ||
    !Number.isSafeInteger(input['revision']) ||
    Number(input['revision']) < 0 ||
    !input['files'] ||
    typeof input['files'] !== 'object' ||
    Array.isArray(input['files'])
  )
    return false;
  const files = Object.entries(input['files']);
  return (
    files.length > 0 &&
    files.length <= 16 &&
    files.every(
      ([name, source]) =>
        name.length <= 256 &&
        /^(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\.ts$/u.test(name) &&
        typeof source === 'string',
    ) &&
    files.reduce((size, [, source]) => size + (source as string).length, 0) <= 131_072
  );
}

/** Worker結果はplain dataの成功/診断に限定し、出力pathと件数も入力に対応させる。 */
export function isTypeScriptCompileResult(
  value: unknown,
  input: TypeScriptCompileInput,
): value is TypeScriptCompileResult {
  if (!value || typeof value !== 'object') return false;
  const result = value as Record<string, unknown>;
  const expectedKeys =
    result['status'] === 'ready' ? ['files', 'status'] : ['diagnostics', 'status'];
  if (JSON.stringify(Object.keys(result).sort()) !== JSON.stringify(expectedKeys)) return false;
  if (result['status'] === 'ready') {
    if (!result['files'] || typeof result['files'] !== 'object' || Array.isArray(result['files']))
      return false;
    const files = Object.entries(result['files']);
    const expected = new Set(Object.keys(input.files).map((name) => name.replace(/\.ts$/u, '.js')));
    return (
      files.length === expected.size &&
      files.every(
        ([name, text]) =>
          expected.has(name) && typeof text === 'string' && text.length <= 1_048_576,
      )
    );
  }
  if (
    !['invalid-input', 'environment-error', 'syntax-error', 'type-error'].includes(
      String(result['status']),
    ) ||
    !Array.isArray(result['diagnostics']) ||
    !result['diagnostics'].length ||
    result['diagnostics'].length > 51
  )
    return false;
  return result['diagnostics'].every((item: unknown) => {
    if (!item || typeof item !== 'object') return false;
    const diagnostic = item as Record<string, unknown>;
    return (
      Number.isSafeInteger(diagnostic['code']) &&
      typeof diagnostic['message'] === 'string' &&
      diagnostic['message'].length <= 2_000 &&
      (diagnostic['file'] === undefined ||
        (typeof diagnostic['file'] === 'string' && diagnostic['file'].length <= 256)) &&
      ['line', 'column'].every(
        (key) =>
          diagnostic[key] === undefined ||
          (Number.isSafeInteger(diagnostic[key]) && Number(diagnostic[key]) > 0),
      )
    );
  });
}
