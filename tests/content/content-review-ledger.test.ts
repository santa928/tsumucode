import { describe, expect, it } from 'vitest';
import { verifyReviewLedger } from '../../scripts/content/verifyContentReview';

const FIRST_HASH = '1'.repeat(64);
const SECOND_HASH = '2'.repeat(64);

/** 2 Lessonが承認済みの最小Review台帳を返す。 */
function createLedger(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    releaseStatus: 'draft',
    verifiedSourceCommit: 'draft',
    canonicalDistSha256: 'draft',
    lessons: [
      {
        lessonId: 'lesson-01',
        authorId: 'author-a',
        reviewerId: 'reviewer-b',
        sourceHash: FIRST_HASH,
        accuracy: 'approved',
        goalExerciseAlignment: 'approved',
        unexplainedTerms: 0,
        hintLeakage: 0,
        examplesExecuted: true,
        decision: 'approved',
        notes: '概念、例、実習の対応を確認',
      },
      {
        lessonId: 'lesson-02',
        authorId: 'author-a',
        reviewerId: 'reviewer-b',
        sourceHash: SECOND_HASH,
        accuracy: 'approved',
        goalExerciseAlignment: 'approved',
        unexplainedTerms: 0,
        hintLeakage: 0,
        examplesExecuted: true,
        decision: 'approved',
        notes: '解答と不合格例を実行して確認',
      },
    ],
  };
}

const lessonHashes = new Map([
  ['lesson-01', FIRST_HASH],
  ['lesson-02', SECOND_HASH],
]);

describe('教材Review台帳', () => {
  it('全Lessonの独立承認とsource hashが一致すれば通る', () => {
    expect(verifyReviewLedger(createLedger(), lessonHashes)).toEqual({
      lessonsReviewed: 2,
      staleHashes: 0,
      rejected: 0,
    });
  });

  it('hash不一致を拒否する', () => {
    const ledger = createLedger();
    const lessons = ledger.lessons as Array<Record<string, unknown>>;
    lessons[0]!.sourceHash = '3'.repeat(64);

    expect(() => verifyReviewLedger(ledger, lessonHashes)).toThrow('source hashが古い');
  });

  it('同一authorとreviewerを拒否する', () => {
    const ledger = createLedger();
    const lessons = ledger.lessons as Array<Record<string, unknown>>;
    lessons[0]!.reviewerId = 'author-a';

    expect(() => verifyReviewLedger(ledger, lessonHashes)).toThrow('authorとreviewerを分離');
  });

  it('未承認の観点を拒否する', () => {
    const ledger = createLedger();
    const lessons = ledger.lessons as Array<Record<string, unknown>>;
    lessons[0]!.goalExerciseAlignment = 'rejected';

    expect(() => verifyReviewLedger(ledger, lessonHashes)).toThrow('Lesson Reviewが未承認');
  });

  it('Lesson欠落を拒否する', () => {
    const ledger = createLedger();
    const lessons = ledger.lessons as Array<Record<string, unknown>>;
    ledger.lessons = lessons.slice(0, 1);

    expect(() => verifyReviewLedger(ledger, lessonHashes)).toThrow('Lesson Reviewが欠落');
  });
});
