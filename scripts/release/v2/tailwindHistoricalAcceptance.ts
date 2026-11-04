import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'yaml';
import { z } from 'zod';
import { CommitSchema, DigestSchema, InventorySchema, LessonInventorySchema } from './schema';
import { hashBytes, hashValue, repositoryEnvironment } from './identity';
import { readInventoryAtSource } from './sourceInventory';

const exec = promisify(execFile);
export const TAILWIND_HISTORICAL_PATH = 'docs/quality/tailwind-historical-acceptance.json';
// One independently inspected historical case, not a registry for future courses or receipts.
const PINNED_RECEIPT = '066fa7f11378a9d1b0f22b9d3443f5bdce484aea270e82725c66ebf3f5625386';
const ReferenceSchema = z
  .object({ path: z.string(), sha256: DigestSchema, sourceCommit: CommitSchema })
  .strict();
const HistoricalLessonSchema = LessonInventorySchema.omit({ kind: true, exercises: true });
const HistoricalSchema = z
  .object({
    schemaVersion: z.literal(1),
    migrationId: z.literal('tailwind-2026-10-27'),
    courseId: z.literal('tailwind'),
    sourceCommit: CommitSchema,
    sourceTree: CommitSchema,
    observedSourceCommit: CommitSchema,
    observedArtifactDigest: DigestSchema,
    contentReview: ReferenceSchema,
    qualityRecord: ReferenceSchema,
    uiObservation: z
      .object({
        actor: z.string().min(1),
        method: z.literal('computer-use'),
        contextSharing: z.literal('none'),
        originalDigest: DigestSchema,
        actorCount: z.literal(1),
      })
      .strict(),
    originalsInspection: z
      .object({
        actor: z.string().min(1),
        historicalReviewDigest: DigestSchema,
        auditReportDigest: DigestSchema,
        checkedPrivateReferences: z.literal(54),
        uniquePrivateFiles: z.literal(26),
        checkedZipMembers: z.literal(6),
        unrecomputedArtifactDeclarations: z.literal(10),
      })
      .strict(),
    authorizationReference: z.literal('docs/quality/tailwind-historical-acceptance.md'),
    unverified: z.array(z.string().min(1)).min(1),
    lessons: z.array(HistoricalLessonSchema).length(5),
    receiptDigest: DigestSchema,
  })
  .strict();
export type TailwindHistoricalAcceptance = z.infer<typeof HistoricalSchema>;
export const HistoricalAcceptanceSummarySchema = z
  .object({
    migrationId: HistoricalSchema.shape.migrationId,
    sourceCommit: CommitSchema,
    receiptDigest: DigestSchema,
    uiActorCount: z.literal(1),
    unverified: z.array(z.string()),
  })
  .strict();

/** Preserve the actual one-actor scope and outstanding limits; no caller can add roles or sources. */
export function validateTailwindHistoricalAcceptance(input: unknown): TailwindHistoricalAcceptance {
  const result = HistoricalSchema.safeParse(input);
  if (!result.success) throw Error('Historical acceptance shape differs');
  const { receiptDigest, ...unsigned } = result.data;
  if (receiptDigest !== PINNED_RECEIPT || hashValue(unsigned) !== PINNED_RECEIPT)
    throw Error('Historical receipt differs from the independently inspected record');
  return result.data;
}

const ReviewRowSchema = z.object({
  lessonId: z.string(),
  authorId: z.string(),
  reviewerId: z.string(),
  sourceHash: DigestSchema,
  accuracy: z.literal('approved'),
  goalExerciseAlignment: z.literal('approved'),
  unexplainedTerms: z.literal(0),
  hintLeakage: z.literal(0),
  examplesExecuted: z.literal(true),
  decision: z.literal('approved'),
});

/** Verify public bindings against real archived Git inputs. Private originals remain private. */
export async function readVerifiedTailwindHistoricalAcceptance(
  root: string,
  inventoryInput: unknown,
) {
  const inventory = InventorySchema.parse(inventoryInput);
  if (
    !inventory.courses.some(
      (course) => course.id === 'tailwind' && course.publicationStatus === 'published',
    )
  )
    return [];
  let raw: string;
  try {
    raw = await readFile(path.join(root, TAILWIND_HISTORICAL_PATH), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  if (Buffer.byteLength(raw) > 16 * 1024) throw Error('Historical receipt exceeds limit');
  const receipt = validateTailwindHistoricalAcceptance(JSON.parse(raw) as unknown);
  const env = await repositoryEnvironment(root);
  const git = async (...args: string[]) =>
    (await exec('git', args, { cwd: root, env, maxBuffer: 4 * 1024 * 1024 })).stdout.trim();
  if ((await git('rev-parse', receipt.sourceCommit + '^{tree}')) !== receipt.sourceTree)
    throw Error('Historical source tree differs');
  const reviewBytes = await git(
    'show',
    receipt.contentReview.sourceCommit + ':' + receipt.contentReview.path,
  );
  // Git stdout trimming is unsuitable for byte digests; fetch the original bytes separately.
  for (const reference of [receipt.contentReview, receipt.qualityRecord]) {
    const { stdout } = await exec('git', ['show', reference.sourceCommit + ':' + reference.path], {
      cwd: root,
      env,
      encoding: 'buffer',
      maxBuffer: 4 * 1024 * 1024,
    });
    if (hashBytes(stdout) !== reference.sha256) throw Error('Historical public evidence differs');
  }
  const review = z.object({ lessons: z.array(ReviewRowSchema) }).parse(parse(reviewBytes));
  const currentReview = z
    .object({ lessons: z.array(z.looseObject({ lessonId: z.string() })) })
    .parse(parse(await readFile(path.join(root, receipt.contentReview.path), 'utf8')));
  const archived = await readInventoryAtSource(root, receipt.sourceCommit, receipt.courseId);
  const originalLessons = archived.inventory.courses[0]?.lessons;
  if (!originalLessons || originalLessons.length !== receipt.lessons.length)
    throw Error('Historical lesson set differs');
  for (const lesson of receipt.lessons) {
    const row = review.lessons.filter(({ lessonId }) => lessonId === lesson.id);
    const current = currentReview.lessons.filter(({ lessonId }) => lessonId === lesson.id);
    if (
      row.length !== 1 ||
      current.length !== 1 ||
      row[0]!.authorId === row[0]!.reviewerId ||
      [row[0]!.authorId, row[0]!.reviewerId, receipt.uiObservation.actor].includes(
        receipt.originalsInspection.actor,
      )
    )
      throw Error('Historical independent review differs');
    // A known rejection/withdrawal is never made acceptable by retaining an old approval.
    if (!ReviewRowSchema.safeParse(current[0]).success)
      throw Error('Historical review is no longer approved');
    const original = originalLessons.find(({ id }) => id === lesson.id);
    if (!original) throw Error('Historical source lesson missing');
    const { kind, exercises, ...fingerprint } = original;
    void kind;
    void exercises;
    if (hashValue(HistoricalLessonSchema.parse(fingerprint)) !== hashValue(lesson))
      throw Error('Historical source lesson fingerprint differs');
    const chapter = lesson.id.startsWith('tailwind-ch01-') ? 'tailwind-ch01' : 'tailwind-ch02';
    const directory = `content/tailwind/chapters/${chapter}/lessons/${lesson.id}`;
    if (
      (await git('rev-parse', receipt.sourceCommit + ':' + directory)) !==
      (await git('rev-parse', receipt.observedSourceCommit + ':' + directory))
    )
      throw Error('Historical UI observation source differs');
  }
  return [receipt];
}
