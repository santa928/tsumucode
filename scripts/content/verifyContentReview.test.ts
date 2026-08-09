// @vitest-environment node
/** Catalogに含まれる全Courseを教材Review Gateへ通す統合境界を検証する。 */
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { compileContent } from './compile';
import { computeLessonSourceHash, verifyAllContentReviews } from './verifyContentReview';

const temporaryRoots: string[] = [];

/** Testごとに隔離した一時Rootを作る。 */
async function createTemporaryRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'tsumucode-content-review-'));
  temporaryRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

interface ApprovedReviewFixture {
  readonly lessonId: string;
  readonly lessonDirectory: string;
}

/** 指定Lessonをすべて承認済みにした最小Review台帳を書く。 */
async function writeApprovedReviews(
  reviewPath: string,
  fixtures: readonly ApprovedReviewFixture[],
): Promise<void> {
  await mkdir(path.dirname(reviewPath), { recursive: true });
  const lessons = await Promise.all(
    fixtures.map(async ({ lessonId, lessonDirectory }) => ({
      lessonId,
      sourceHash: await computeLessonSourceHash(lessonDirectory),
    })),
  );
  await writeFile(
    reviewPath,
    `schemaVersion: 1
releaseStatus: draft
verifiedSourceCommit: draft
canonicalDistSha256: draft
lessons:
${lessons
  .map(
    ({ lessonId, sourceHash }) => `  - lessonId: ${lessonId}
    authorId: fixture-author
    reviewerId: fixture-reviewer
    sourceHash: ${sourceHash}
    accuracy: approved
    goalExerciseAlignment: approved
    unexplainedTerms: 0
    hintLeakage: 0
    examplesExecuted: true
    decision: approved
    notes: Test用の教材Reviewを完了しています。`,
  )
  .join('\n')}
`,
    'utf8',
  );
}

describe('verifyAllContentReviews', () => {
  it('Catalogのpublishedとdraftを区別せず全CourseのReview台帳へ結び付ける', async () => {
    const root = await createTemporaryRoot();
    const contentRoot = path.join(root, 'content');
    const publicRoot = path.join(root, 'public');
    const reviewRoot = path.join(root, 'reviews');
    await cp(path.resolve('tests/fixtures/foundation-content'), contentRoot, { recursive: true });
    await cp(path.resolve('content/javascript'), path.join(contentRoot, 'javascript'), {
      recursive: true,
    });
    await compileContent({
      sourceRoot: contentRoot,
      outputRoot: path.join(publicRoot, 'generated/content'),
      checkOnly: false,
    });
    await writeApprovedReviews(path.join(reviewRoot, 'content-review.yaml'), [
      {
        lessonId: 'lesson-first-heading',
        lessonDirectory: path.join(
          contentRoot,
          'html-css/chapters/ch00-web-map/lessons/lesson-first-heading',
        ),
      },
    ]);
    await writeApprovedReviews(
      path.join(reviewRoot, 'content-review-javascript.yaml'),
      [
        'javascript-ch00-l01',
        ...Array.from({ length: 4 }, (_, index) => `javascript-ch01-l0${String(index + 1)}`),
        ...Array.from({ length: 4 }, (_, index) => `javascript-ch02-l0${String(index + 1)}`),
      ].map((lessonId) => ({
        lessonId,
        lessonDirectory: path.join(
          contentRoot,
          'javascript/chapters',
          lessonId.replace(/-l\d+$/u, ''),
          'lessons',
          lessonId,
        ),
      })),
    );

    await expect(verifyAllContentReviews({ contentRoot, publicRoot, reviewRoot })).resolves.toEqual(
      {
        coursesReviewed: 2,
        lessonsReviewed: 10,
        staleHashes: 0,
        rejected: 0,
      },
    );
  }, 15_000);
});
