import type { ReactExerciseRuntime } from '../../../core/content/types';

/** 元TSX全ファイル・固定profile・同一session/revisionを実行証拠へ結ぶ。 */
export async function reactSourceHash(
  files: Readonly<Record<string, string>>,
  runtime: ReactExerciseRuntime,
  sessionId: string,
  revision: number,
): Promise<string> {
  const source = JSON.stringify([
    'tsumucode-react-source-v1',
    sessionId,
    revision,
    runtime,
    Object.keys(files)
      .sort()
      .map((file) => [file, files[file]]),
  ]);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
