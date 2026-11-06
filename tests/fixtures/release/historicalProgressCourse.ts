import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { z } from 'zod';
import { verifyPythonSyntheticProgressBundle } from '../../../scripts/release/pythonSyntheticContinuity';
import { verifyReactSyntheticProgressBundle } from '../../../scripts/release/reactSyntheticContinuity';
import type { CourseManifest } from '../../../src/core/content/types';

const DigestSchema = z.string().regex(/^[a-f0-9]{64}$/u);
const courseEntry = (revision: string) =>
  z
    .object({
      revision: z.literal(revision),
      sourceContentSha256: DigestSchema,
      runtimeSha256: DigestSchema,
      compressedSha256: DigestSchema,
    })
    .strict();
const ManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    purpose: z.literal('historical-initial-publication-progress-only'),
    sourceCommit: z.literal('f629fc6113fe398ad6cd74d16e2a2c0ca95872ff'),
    compilerSourceSha256: DigestSchema,
    courses: z
      .object({
        'python-basics': courseEntry('2026-10-12.1'),
        react: courseEntry('2026-10-07.7'),
      })
      .strict(),
  })
  .strict();
const digest = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

/** 旧Sourceの全Runtimeを保存契約のテストだけに使う。
 * 現在の公開Schemaや学習受入へ転用せず、旧Compiler・教材・圧縮前後のhashを結ぶ。
 */
export async function verifyHistoricalSyntheticProgressBundle(
  courseId: 'python-basics' | 'react',
  bundle: unknown,
) {
  const manifest = ManifestSchema.parse(
    JSON.parse(
      await readFile(new URL('./historical-progress-manifest.json', import.meta.url), 'utf8'),
    ) as unknown,
  );
  const entry = manifest.courses[courseId];
  const compressed = await readFile(
    new URL('./' + courseId + '-f629fc6-progress.json.gz', import.meta.url),
  );
  if (compressed.length > 1024 * 1024 || digest(compressed) !== entry.compressedSha256)
    throw Error('Historical progress fixture compressed hash or size differs');
  const bytes = gunzipSync(compressed, { maxOutputLength: 4 * 1024 * 1024 });
  if (digest(bytes) !== entry.runtimeSha256)
    throw Error('Historical progress fixture runtime hash differs');
  const historical: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  z.looseObject({ id: z.literal(courseId), revision: z.literal(entry.revision) }).parse(historical);
  // 変更しない旧保存helperへのテスト用アダプターに限定する。
  // 現CourseManifestSchemaの検証成功や公開承認を意味しない。
  const progressInput = historical as CourseManifest;
  return courseId === 'python-basics'
    ? verifyPythonSyntheticProgressBundle(progressInput, bundle)
    : verifyReactSyntheticProgressBundle(progressInput, bundle);
}
