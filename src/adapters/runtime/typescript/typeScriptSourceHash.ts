import type { TypeScriptExerciseRuntime } from '../../../core/content/types';

/** 型が消去される前の全ファイル・設定・実行世代を結びつける非永続の証拠。 */
export async function typeScriptSourceHash(
  files: Readonly<Record<string, string>>,
  runtime: TypeScriptExerciseRuntime,
  sessionId: string,
  revision: number,
): Promise<string> {
  const source = JSON.stringify([
    'tsumucode-typescript-source-v1',
    sessionId,
    revision,
    runtime.entryFile,
    runtime.sourceType,
    runtime.capabilityProfile,
    runtime.primaryOutput,
    Object.keys(files)
      .sort()
      .map((file) => [file, files[file]]),
  ]);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
