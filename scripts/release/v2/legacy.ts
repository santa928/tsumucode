import { lstat, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'yaml';
import { z } from 'zod';
import { computeLessonSourceHash } from '../../content/verifyContentReview';
import { hashBytes } from './identity';

export interface LegacyObservation {
  readonly role: string | null;
  readonly method: string | null;
  readonly source: string | null;
  readonly lessonIds: readonly string[];
}

export interface LegacyRecordReference {
  readonly kind: string;
  readonly path: string;
  readonly sha256: string;
  readonly declaredSource: string | null;
  readonly declaredStatus: string | null;
  readonly observations: readonly LegacyObservation[];
}

export interface LegacyContentLesson {
  readonly lessonId: string;
  readonly sourceHash: string;
  readonly actualSourceHash: string | null;
  readonly sourceHashMatches: boolean;
  readonly authorId: string;
  readonly reviewerId: string;
  readonly examplesExecuted: boolean;
  readonly decision: string | null;
  readonly accuracy: 'approved' | 'rejected' | null;
  readonly goalExerciseAlignment: 'approved' | 'rejected' | null;
  readonly unexplainedTerms: number | null;
  readonly hintLeakage: number | null;
}

export interface LegacyLessonCoverage {
  readonly actualLessonIds: readonly string[];
  readonly missingLessonIds: readonly string[];
  readonly extraLessonIds: readonly string[];
  readonly duplicateReviewLessonIds: readonly string[];
  readonly duplicateSourceLessonIds: readonly string[];
}

export interface LegacyCourseEvidence {
  readonly courseId: string;
  readonly format: 'legacy' | 'new-evidence-required';
  readonly records: readonly LegacyRecordReference[];
  readonly contentLessons: readonly LegacyContentLesson[];
  readonly coverage: LegacyLessonCoverage;
  readonly missingRecordPaths: readonly string[];
}

type RecordPath = readonly [kind: string, relativePath: string];

const DeclaredApprovalSchema = z.enum(['approved', 'rejected']).nullish();
const ContentLessonSchema = z.object({
  lessonId: z.string().min(1),
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/u),
  authorId: z.string().min(1),
  reviewerId: z.string().min(1),
  examplesExecuted: z.boolean(),
  decision: DeclaredApprovalSchema,
  accuracy: DeclaredApprovalSchema,
  goalExerciseAlignment: DeclaredApprovalSchema,
  unexplainedTerms: z.number().int().nonnegative().nullish(),
  hintLeakage: z.number().int().nonnegative().nullish(),
});
const ContentLessonsSchema = z.object({ lessons: z.array(ContentLessonSchema) });

// Migration boundary only. Future courses must supply new evidence, not join this table.
const HISTORICAL_RECORDS: ReadonlyMap<string, readonly RecordPath[]> = new Map([
  [
    'html-css',
    [
      ['contentReview', 'docs/quality/content-review.yaml'],
      ['approval', 'docs/quality/release-approval.yaml'],
      ['acceptance', 'docs/quality/novice-observation.md'],
      ['history', 'content/html-css/release-history.yaml'],
    ],
  ],
  [
    'javascript',
    [
      ['contentReview', 'docs/quality/content-review-javascript.yaml'],
      ['approval', 'docs/quality/javascript-release-approval.yaml'],
      ['acceptance', 'docs/quality/javascript-agent-learning.yaml'],
      ['history', 'content/javascript/release-history.yaml'],
    ],
  ],
  [
    'typescript',
    [
      ['contentReview', 'docs/quality/content-review-typescript.yaml'],
      ['approval', 'docs/quality/typescript-release-approval.yaml'],
      ['acceptance', 'docs/quality/typescript-release-acceptance.yaml'],
      ['history', 'content/typescript/release-history.yaml'],
    ],
  ],
  [
    'react',
    [
      ['contentReview', 'docs/quality/content-review-react.yaml'],
      ['approval', 'docs/quality/react-release-approval.yaml'],
      ['acceptance', 'docs/quality/react-release-acceptance.yaml'],
      ['history', 'content/react/release-history.yaml'],
    ],
  ],
  [
    'next',
    [
      ['contentReview', 'docs/quality/content-review-next.yaml'],
      ['approval', 'docs/quality/next-release-approval.yaml'],
      ['acceptance', 'docs/quality/next-release-acceptance.yaml'],
      ['history', 'content/next/release-history.yaml'],
    ],
  ],
  [
    'python-basics',
    [
      ['contentReview', 'docs/quality/content-review-python-basics.yaml'],
      ['approval', 'docs/quality/python-release-approval.yaml'],
      ['acceptance', 'docs/quality/python-release-acceptance.yaml'],
      ['history', 'content/python-basics/release-history.yaml'],
    ],
  ],
]);

function object(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
function text(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}
function parseLegacyYaml(source: string, relativePath: string): unknown {
  try {
    return parse(source) as unknown;
  } catch {
    // YAML diagnostics can contain raw private reports; expose only the public record reference.
    throw new Error(`Invalid legacy YAML: ${relativePath}`);
  }
}
function objects(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return (value as unknown[]).map(object).filter((item) => item !== undefined);
}

/** Explicit fields only: absent methods and per-observation sources stay absent. */
function observation(row: Record<string, unknown>): LegacyObservation {
  const lessonIds: string[] = [];
  const ownLessonId = text(row.lessonId);
  if (ownLessonId !== null) lessonIds.push(ownLessonId);
  if (Array.isArray(row.lessonIds)) {
    for (const value of row.lessonIds as unknown[]) {
      if (typeof value === 'string') lessonIds.push(value);
    }
  }
  for (const item of [...objects(row.lessons), ...objects(row.results)]) {
    const id = text(item.lessonId);
    if (id !== null) lessonIds.push(id);
  }
  return {
    role: text(row.role) ?? text(row.roleId) ?? text(row.reviewerRole),
    method: text(row.method) ?? text(row.interactionMethod) ?? text(row.evidenceKind),
    source: text(row.sourceCommit) ?? text(row.verifiedSourceCommit),
    lessonIds,
  };
}

function observations(record: Record<string, unknown>, markdown: boolean): LegacyObservation[] {
  if (markdown) return [observation(record)];
  const rows = [...objects(record.personas), ...objects(record.lessonEvaluations)];
  const acceptance = object(record.acceptance);
  if (acceptance !== undefined) rows.push(acceptance, ...objects(acceptance.personas));
  return rows.map(observation);
}

/** Only the original leading metadata is structured; later prose is not new observation data. */
function markdownMetadata(source: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const leading = source.split(/^## /mu, 1)[0] ?? '';
  for (const match of leading.matchAll(/^- ([A-Za-z][A-Za-z0-9]*): `([^`]*)`/gmu)) {
    if (!(match[1]! in result)) result[match[1]!] = match[2]!;
  }
  return result;
}

/** Refuse links and special files before any read, including ancestor directories. */
async function existingPath(root: string, relative: string): Promise<string | undefined> {
  let current = root;
  const segments = relative.split('/');
  for (let index = -1; index < segments.length; index += 1) {
    if (index >= 0) current = path.join(current, segments[index]!);
    try {
      const stat = await lstat(current);
      if (stat.isSymbolicLink()) throw new Error('Legacy symlink is forbidden');
      if (index < segments.length - 1 && !stat.isDirectory())
        throw new Error('Legacy ancestor must be a directory');
      if (!stat.isFile() && !stat.isDirectory())
        throw new Error('Legacy inputs must be ordinary files or directories');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw error;
    }
  }
  return current;
}

async function currentLessons(root: string, courseId: string): Promise<Map<string, string[]>> {
  const lessons = new Map<string, string[]>();
  const courseRoot = await existingPath(root, `content/${courseId}`);
  if (courseRoot === undefined) return lessons;
  async function visit(directory: string): Promise<void> {
    for (const name of (await readdir(directory)).sort()) {
      const target = path.join(directory, name);
      const stat = await lstat(target);
      if (stat.isSymbolicLink()) throw new Error('Legacy source symlink is forbidden');
      if (stat.isDirectory()) await visit(target);
      else if (!stat.isFile()) throw new Error('Legacy source must contain ordinary files only');
      else if (name === 'lesson.yaml') {
        const source = parseLegacyYaml(
          await readFile(target, 'utf8'),
          path.relative(root, target).split(path.sep).join('/'),
        );
        const { id } = z.object({ id: z.string().min(1) }).parse(source);
        const hashes = lessons.get(id) ?? [];
        hashes.push(await computeLessonSourceHash(directory));
        lessons.set(id, hashes);
      }
    }
  }
  await visit(courseRoot);
  return lessons;
}

function emptyCoverage(): LegacyLessonCoverage {
  return {
    actualLessonIds: [],
    missingLessonIds: [],
    extraLessonIds: [],
    duplicateReviewLessonIds: [],
    duplicateSourceLessonIds: [],
  };
}

/** Read historical declarations and hashes; this function never grants approval. */
export async function readLegacyEvidence(
  root: string,
  courseIds: readonly string[],
): Promise<LegacyCourseEvidence[]> {
  const results: LegacyCourseEvidence[] = [];
  for (const courseId of courseIds) {
    const paths = HISTORICAL_RECORDS.get(courseId);
    if (paths === undefined) {
      results.push({
        courseId,
        format: 'new-evidence-required',
        records: [],
        contentLessons: [],
        coverage: emptyCoverage(),
        missingRecordPaths: [],
      });
      continue;
    }
    const records: LegacyRecordReference[] = [];
    const missingRecordPaths: string[] = [];
    let reviews: z.infer<typeof ContentLessonSchema>[] = [];
    for (const [kind, relativePath] of paths) {
      const absolute = await existingPath(path.resolve(root), relativePath);
      if (absolute === undefined) {
        missingRecordPaths.push(relativePath);
        continue;
      }
      if (!(await lstat(absolute)).isFile())
        throw new Error('Legacy record must be an ordinary file');
      const bytes = await readFile(absolute);
      const markdown = relativePath.endsWith('.md');
      const input: unknown = markdown
        ? markdownMetadata(bytes.toString('utf8'))
        : parseLegacyYaml(bytes.toString('utf8'), relativePath);
      const record = object(input);
      if (record === undefined) throw new Error('Legacy record must be an object');
      records.push({
        kind,
        path: relativePath,
        sha256: hashBytes(bytes),
        declaredSource: text(record.verifiedSourceCommit) ?? text(record.sourceCommit),
        declaredStatus: text(record.releaseStatus) ?? text(record.status),
        observations: observations(record, markdown),
      });
      if (kind === 'contentReview') reviews = ContentLessonsSchema.parse(input).lessons;
    }
    const actual = await currentLessons(path.resolve(root), courseId);
    const reviewCounts = new Map<string, number>();
    const contentLessons = reviews.map((review): LegacyContentLesson => {
      reviewCounts.set(review.lessonId, (reviewCounts.get(review.lessonId) ?? 0) + 1);
      const hashes = actual.get(review.lessonId);
      const actualSourceHash = hashes?.length === 1 ? hashes[0]! : null;
      return {
        lessonId: review.lessonId,
        sourceHash: review.sourceHash,
        actualSourceHash,
        sourceHashMatches: actualSourceHash !== null && actualSourceHash === review.sourceHash,
        authorId: review.authorId,
        reviewerId: review.reviewerId,
        examplesExecuted: review.examplesExecuted,
        decision: review.decision ?? null,
        accuracy: review.accuracy ?? null,
        goalExerciseAlignment: review.goalExerciseAlignment ?? null,
        unexplainedTerms: review.unexplainedTerms ?? null,
        hintLeakage: review.hintLeakage ?? null,
      };
    });
    results.push({
      courseId,
      format: 'legacy',
      records,
      contentLessons,
      missingRecordPaths,
      coverage: {
        actualLessonIds: [...actual.keys()].sort(),
        missingLessonIds: [...actual.keys()].filter((id) => !reviewCounts.has(id)).sort(),
        extraLessonIds: [...reviewCounts.keys()].filter((id) => !actual.has(id)).sort(),
        duplicateReviewLessonIds: [...reviewCounts]
          .filter(([, count]) => count > 1)
          .map(([id]) => id)
          .sort(),
        duplicateSourceLessonIds: [...actual]
          .filter(([, hashes]) => hashes.length > 1)
          .map(([id]) => id)
          .sort(),
      },
    });
  }
  return results;
}
