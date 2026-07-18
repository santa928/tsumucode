import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parse } from 'yaml';
import { z } from 'zod';
import { CourseManifestSchema } from '../../src/core/content/schema';

const HashSchema = z.string().regex(/^[a-f0-9]{64}$/u);
const DraftOrCommitSchema = z.union([z.literal('draft'), z.string().regex(/^[a-f0-9]{40}$/u)]);
const DraftOrHashSchema = z.union([z.literal('draft'), HashSchema]);
const ApprovalSchema = z.enum(['approved', 'rejected']);

const LessonReviewSchema = z
  .object({
    lessonId: z.string().trim().min(1),
    authorId: z.string().trim().min(1),
    reviewerId: z.string().trim().min(1),
    sourceHash: HashSchema,
    accuracy: ApprovalSchema,
    goalExerciseAlignment: ApprovalSchema,
    unexplainedTerms: z.number().int().nonnegative(),
    hintLeakage: z.number().int().nonnegative(),
    examplesExecuted: z.boolean(),
    decision: ApprovalSchema,
    notes: z.string().trim().min(1),
  })
  .strict();

export const ContentReviewLedgerSchema = z
  .object({
    schemaVersion: z.literal(1),
    releaseStatus: z.enum(['draft', 'approved']),
    verifiedSourceCommit: DraftOrCommitSchema,
    canonicalDistSha256: DraftOrHashSchema,
    lessons: z.array(LessonReviewSchema),
  })
  .strict();

export type ContentReviewLedger = z.infer<typeof ContentReviewLedgerSchema>;

export interface ContentReviewReport {
  readonly lessonsReviewed: number;
  readonly staleHashes: number;
  readonly rejected: number;
}

export interface VerifyContentReviewOptions {
  readonly courseRoot?: string;
  readonly courseManifestPath?: string;
  readonly reviewPath?: string;
}

/** Directory配下の通常FileをPOSIX相対path順で列挙し、symlinkを拒否する。 */
async function collectRegularFiles(
  rootDirectory: string,
  relativeDirectory = '',
): Promise<readonly string[]> {
  const directory =
    relativeDirectory === '' ? rootDirectory : path.join(rootDirectory, relativeDirectory);
  const entries = (await readdir(directory, { withFileTypes: true })).sort((left, right) =>
    left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
  );
  const files: string[] = [];
  for (const entry of entries) {
    const relativePath =
      relativeDirectory === '' ? entry.name : `${relativeDirectory}/${entry.name}`;
    if (entry.isSymbolicLink()) {
      throw new Error(`教材Review対象にsymlinkを含められません: ${relativePath}`);
    }
    if (entry.isDirectory()) {
      files.push(...(await collectRegularFiles(rootDirectory, relativePath)));
    } else if (entry.isFile()) {
      files.push(relativePath);
    }
  }
  return files;
}

/** Lesson directory内のpathとbytesを正規順で連結し、内容SHA-256を返す。 */
export async function computeLessonSourceHash(lessonDirectory: string): Promise<string> {
  const hash = createHash('sha256');
  for (const relativePath of await collectRegularFiles(lessonDirectory)) {
    hash.update(relativePath, 'utf8');
    hash.update(Buffer.from([0]));
    hash.update(await readFile(path.join(lessonDirectory, ...relativePath.split('/'))));
  }
  return hash.digest('hex');
}

/** Course treeからlesson.yamlを探索し、Lesson IDと所有Directoryを1対1で返す。 */
async function collectLessonDirectories(courseRoot: string): Promise<ReadonlyMap<string, string>> {
  const result = new Map<string, string>();

  async function visit(relativeDirectory = ''): Promise<void> {
    const directory =
      relativeDirectory === '' ? courseRoot : path.join(courseRoot, relativeDirectory);
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const relativePath =
        relativeDirectory === '' ? entry.name : `${relativeDirectory}/${entry.name}`;
      if (entry.isSymbolicLink()) {
        throw new Error(`Course treeにsymlinkを含められません: ${relativePath}`);
      }
      if (entry.isDirectory()) {
        await visit(relativePath);
        continue;
      }
      if (!entry.isFile() || entry.name !== 'lesson.yaml') continue;
      const source = z
        .looseObject({ id: z.string().trim().min(1) })
        .parse(parse(await readFile(path.join(courseRoot, relativePath), 'utf8')));
      if (result.has(source.id)) throw new Error(`Lesson IDが重複しています: ${source.id}`);
      result.set(source.id, path.dirname(path.join(courseRoot, relativePath)));
    }
  }

  await visit();
  return result;
}

/** Review台帳をLesson集合と照合し、承認条件とsource hashの不一致をまとめて拒否する。 */
export function verifyReviewLedger(
  input: unknown,
  lessonHashes: ReadonlyMap<string, string>,
): ContentReviewReport {
  const ledger = ContentReviewLedgerSchema.parse(input);
  const expectedIds = new Set(lessonHashes.keys());
  const reviewedIds = new Set<string>();
  const errors: string[] = [];
  let staleHashes = 0;
  let rejected = 0;

  for (const review of ledger.lessons) {
    if (reviewedIds.has(review.lessonId)) {
      errors.push(`Review Lesson IDが重複しています: ${review.lessonId}`);
      continue;
    }
    reviewedIds.add(review.lessonId);
    const expectedHash = lessonHashes.get(review.lessonId);
    if (expectedHash === undefined) {
      errors.push(`ReleaseにないLesson Reviewです: ${review.lessonId}`);
      continue;
    }
    if (review.sourceHash !== expectedHash) {
      staleHashes += 1;
      errors.push(`Lesson source hashが古いです: ${review.lessonId}`);
    }
    if (review.authorId === review.reviewerId) {
      rejected += 1;
      errors.push(`authorとreviewerを分離してください: ${review.lessonId}`);
    }
    if (
      review.accuracy !== 'approved' ||
      review.goalExerciseAlignment !== 'approved' ||
      review.unexplainedTerms !== 0 ||
      review.hintLeakage !== 0 ||
      !review.examplesExecuted ||
      review.decision !== 'approved'
    ) {
      rejected += 1;
      errors.push(`Lesson Reviewが未承認です: ${review.lessonId}`);
    }
  }

  for (const lessonId of expectedIds) {
    if (!reviewedIds.has(lessonId)) errors.push(`Lesson Reviewが欠落しています: ${lessonId}`);
  }
  if (errors.length > 0) throw new Error(`教材Review Gateに失敗しました:\n${errors.join('\n')}`);
  return { lessonsReviewed: reviewedIds.size, staleHashes, rejected };
}

/** 公開Manifest、Source tree、Review台帳を読み込み、51 Lessonのbindingを検証する。 */
export async function verifyContentReview(
  options: VerifyContentReviewOptions = {},
): Promise<ContentReviewReport> {
  const courseRoot = path.resolve(options.courseRoot ?? 'content/html-css');
  const courseManifestPath = path.resolve(
    options.courseManifestPath ?? 'public/generated/content/courses/html-css.json',
  );
  const reviewPath = path.resolve(options.reviewPath ?? 'docs/quality/content-review.yaml');
  const course = CourseManifestSchema.parse(
    JSON.parse(await readFile(courseManifestPath, 'utf8')) as unknown,
  );
  const releaseLessonIds = new Set(
    course.phases
      .flatMap(({ chapters }) => chapters)
      .flatMap(({ lessons }) => lessons)
      .map(({ id }) => id),
  );
  const lessonDirectories = await collectLessonDirectories(courseRoot);
  const directoryIds = new Set(lessonDirectories.keys());
  const missingDirectories = [...releaseLessonIds].filter((id) => !directoryIds.has(id));
  const extraDirectories = [...directoryIds].filter((id) => !releaseLessonIds.has(id));
  if (missingDirectories.length > 0 || extraDirectories.length > 0) {
    throw new Error(
      `Release ManifestとLesson Sourceが一致しません: missing=${missingDirectories.join(',')} extra=${extraDirectories.join(',')}`,
    );
  }
  const lessonHashes = new Map<string, string>();
  for (const lessonId of [...releaseLessonIds].sort()) {
    const lessonDirectory = lessonDirectories.get(lessonId);
    if (lessonDirectory === undefined) throw new Error(`Lesson Directoryがありません: ${lessonId}`);
    lessonHashes.set(lessonId, await computeLessonSourceHash(lessonDirectory));
  }
  return verifyReviewLedger(parse(await readFile(reviewPath, 'utf8')), lessonHashes);
}

/** CLI実行時にReview reportを1行で出力する。 */
async function runCli(): Promise<void> {
  const report = await verifyContentReview();
  process.stdout.write(
    `${String(report.lessonsReviewed)} lessons reviewed / stale hashes ${String(report.staleHashes)} / rejected ${String(report.rejected)}\n`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  void runCli();
}
