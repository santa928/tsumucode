import {
  isTypeScriptCompileInput,
  isTypeScriptCompileResult,
  type TypeScriptCompileInput,
} from '../typescript/workerContract';
import type { TypeScriptCompileResult } from '../typescript/compileTypeScript';

/** 既存の容量・identity上限を保ち、TSXだけを追加する。予約moduleは入力できない。 */
export function isReactCompileInput(value: unknown): value is TypeScriptCompileInput {
  if (!value || typeof value !== 'object') return false;
  const input = value as Record<string, unknown>;
  if (Object.keys(input).sort().join(',') !== 'files,revision,sessionId') return false;
  if (!input.files || typeof input.files !== 'object' || Array.isArray(input.files)) return false;
  const entries = Object.entries(input.files as Record<string, unknown>);
  if (entries.some(([name]) => !/^(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\.tsx?$/u.test(name)))
    return false;
  const normalized: [string, unknown][] = entries.map(([name, source]) => [
    name.replace(/\.tsx$/u, '.ts'),
    source,
  ]);
  if (new Set(normalized.map(([name]) => name)).size !== entries.length) return false;
  return isTypeScriptCompileInput({ ...input, files: Object.fromEntries<unknown>(normalized) });
}

/** TSXの出力名を既存のstrict結果guardへ対応させ、余分なemitを拒否する。 */
export function isReactCompileResult(
  value: unknown,
  input: TypeScriptCompileInput,
): value is TypeScriptCompileResult {
  return isTypeScriptCompileResult(value, {
    ...input,
    files: Object.fromEntries(
      Object.entries(input.files).map(([name, source]) => [name.replace(/\.tsx$/u, '.ts'), source]),
    ),
  });
}
