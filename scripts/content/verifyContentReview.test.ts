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

/** 1 Lessonを承認済みにした最小Review台帳を書く。 */
async function writeApprovedReview(
  reviewPath: string,
  lessonId: string,
  lessonDirectory: string,
): Promise<void> {
  await mkdir(path.dirname(reviewPath), { recursive: true });
  const sourceHash = await computeLessonSourceHash(lessonDirectory);
  await writeFile(
    reviewPath,
    `schemaVersion: 1
releaseStatus: draft
verifiedSourceCommit: draft
canonicalDistSha256: draft
lessons:
  - lessonId: ${lessonId}
    authorId: fixture-author
    reviewerId: fixture-reviewer
    sourceHash: ${sourceHash}
    accuracy: approved
    goalExerciseAlignment: approved
    unexplainedTerms: 0
    hintLeakage: 0
    examplesExecuted: true
    decision: approved
    notes: Test用の教材Reviewを完了しています。
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
    await writeApprovedReview(
      path.join(reviewRoot, 'content-review.yaml'),
      'lesson-first-heading',
      path.join(contentRoot, 'html-css/chapters/ch00-web-map/lessons/lesson-first-heading'),
    );
    await writeApprovedReview(
      path.join(reviewRoot, 'content-review-javascript.yaml'),
      'javascript-ch00-l01',
      path.join(contentRoot, 'javascript/chapters/javascript-ch00/lessons/javascript-ch00-l01'),
    );

    await expect(verifyAllContentReviews({ contentRoot, publicRoot, reviewRoot })).resolves.toEqual(
      {
        coursesReviewed: 2,
        lessonsReviewed: 2,
        staleHashes: 0,
        rejected: 0,
      },
    );
  });
});
