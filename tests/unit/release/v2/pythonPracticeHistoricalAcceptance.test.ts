// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { beforeAll, describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import type { ReleaseInventory } from '../../../../scripts/release/v2/schema';
import { compileCourse } from '../../../../scripts/content/compileCourse';
import { buildInventory } from '../../../../scripts/release/v2/inventory';
import { hashValue } from '../../../../scripts/release/v2/identity';
import { verifyContent } from '../../../../scripts/release/v2/content';
import {
  pythonPracticeHistoricalDeclaration,
  validatePythonPracticeHistoricalDeclaration,
  validatePythonPracticeHistoricalOriginals,
  verifyPythonPracticeHistoricalCandidate,
} from '../../../../scripts/release/v2/pythonPracticeHistoricalAcceptance';

const declaration = () => pythonPracticeHistoricalDeclaration();
let compiledInventory: ReleaseInventory;
beforeAll(async () => {
  compiledInventory = buildInventory([await compileCourse('content/python-practice')]);
});
function candidate() {
  return structuredClone(compiledInventory);
}
async function currentReview() {
  const ledger: unknown = parse(
    await readFile('docs/quality/content-review-python-practice.yaml', 'utf8'),
  );
  return {
    reviewLedger: ledger,
    sourceHashes: new Map(declaration().lessons.map((lesson) => [lesson.id, lesson.sourceHash])),
    withdrawals: [] as unknown[],
  };
}

describe('Python実践だけの歴史証拠の準備用検証', () => {
  it('旧Source・5 Lesson・3名の限定範囲を保持し、receiptを発行しない', async () => {
    const result = verifyPythonPracticeHistoricalCandidate(
      candidate(),
      declaration(),
      await currentReview(),
    );
    expect(result).toMatchObject({
      status: 'verified-proposal-not-a-content-receipt',
      sourceCommit: '6b06d58530a57a5bda7c6c1a8b0eb3d95fce7931',
      sourceTree: '85b143b26b35aaeb68ce11df1b8b16729a6ab966',
      courseTree: '36829dae17cb50ddaedf4fdeb0d3b0697c7531a8',
      uiObservation: {
        actorCount: 3,
        observedLessonIds: ['python-practice-ch01-l01', 'python-practice-ch03-l01'],
        method: 'parent-direct-report-of-independent-computer-use',
        independentChildImagesInspectedHere: false,
        completeAllLessonThreeRoleClaim: false,
        inferredActorRoleReceipts: 0,
        exactObservationTimestamp: null,
      },
      currentReview: { lessonsReviewed: 5, staleHashes: 0, rejected: 0 },
      technicalRechecks: [],
    });
    expect(result.lessons.map(({ id }) => id)).toEqual([
      'python-practice-ch01-l01',
      'python-practice-ch01-l02',
      'python-practice-ch01-l03',
      'python-practice-ch02-l01',
      'python-practice-ch03-l01',
    ]);
    expect(result.unverified).toContain('original-independent-child-cua-images');
    expect(result.auditUnverified).toContain('full-historical-source-6148-file-byte-comparison');
    expect(result.uiObservation.actorScopes.map(({ observedAfter }) => observedAfter)).toEqual([
      null,
      '18:49以降の新実操作との親報告',
      null,
    ]);
    expect(result.uiObservation.lessonMapping).toBe(
      'inferred-from-course-scope-not-raw-lesson-ids',
    );
    expect(result).not.toHaveProperty('receiptDigest');
    expect(result).not.toHaveProperty('newlyApprovedLessons');
    const published = candidate();
    published.courses[0]!.publicationStatus = 'published';
    expect(() => verifyContent(published, [], undefined, [], [result])).toThrow();
    expect(() => verifyContent(published, [])).toThrow(/Missing content/);
  });

  it.each([
    'course',
    'source',
    'tree',
    'digest',
    'scope',
    'actor-scope',
    'actor-limits',
    'audit-limits',
    'actors',
    'limits',
    'timestamp',
    'performance',
    'receipt',
    'duplicate',
    'missing',
  ])('固定宣言の%s改変を拒否する', (kind) => {
    const forged = declaration();
    if (kind === 'course') forged.courseId = 'python-basics';
    if (kind === 'source') forged.sourceCommit = '0'.repeat(40);
    if (kind === 'tree') forged.courseTree = '0'.repeat(40);
    if (kind === 'digest') forged.proposalDigest = '0'.repeat(64);
    if (kind === 'scope') forged.uiObservation.observedLessonIds.push('python-practice-ch01-l02');
    if (kind === 'actor-scope')
      forged.uiObservation.actorScopes[0]!.lessonIds.push('python-practice-ch03-l01');
    if (kind === 'actor-limits') forged.uiObservation.actorScopes[1]!.unverified = [];
    if (kind === 'audit-limits') forged.auditUnverified = [];
    if (kind === 'actors') forged.uiObservation.actorCount = 15;
    if (kind === 'limits') forged.unverified = [];
    if (kind === 'timestamp')
      forged.uiObservation.exactObservationTimestamp = '2026-11-06T00:00:00Z';
    if (kind === 'performance') forged.performance.currentRemeasurement = true;
    if (kind === 'receipt')
      Object.assign(forged, { receiptDigest: 'a'.repeat(64), status: 'approved' });
    if (kind === 'duplicate') forged.lessons[1] = { ...forged.lessons[0]! };
    if (kind === 'missing') forged.lessons.pop();
    expect(() => validatePythonPracticeHistoricalDeclaration(forged)).toThrow(/Historical/);
  });

  it('返された宣言の変更が次の検証の固定値を変更しない', () => {
    const mutated = declaration();
    mutated.lessons.pop();
    mutated.unverified.length = 0;
    expect(validatePythonPracticeHistoricalDeclaration(declaration()).lessons).toHaveLength(5);
  });

  it.each(['learner', 'course', 'duplicate', 'missing', 'additional'])(
    '候補の%s差分を過去の承認へ付け替えない',
    async (kind) => {
      const changed = candidate();
      const course = changed.courses[0]!;
      if (kind === 'learner') course.lessons[0]!.learnerDigest = '0'.repeat(64);
      if (kind === 'course') course.id = 'python-basics';
      if (kind === 'duplicate') course.lessons[1] = { ...course.lessons[0]! };
      if (kind === 'missing') course.lessons.pop();
      if (kind === 'additional')
        course.lessons.push({ ...course.lessons[0]!, id: 'python-practice-new' });
      const review = await currentReview();
      expect(() => verifyPythonPracticeHistoricalCandidate(changed, declaration(), review)).toThrow(
        /Historical/,
      );
    },
  );

  it.each(['exercise', 'navigation', 'persistence'] as const)(
    '%s変更の現候補での技術再検証義務を返す',
    async (scope) => {
      const changed = candidate();
      const lesson = changed.courses[0]!.lessons[0]!;
      if (scope === 'exercise') {
        lesson.exercises[0]!.digest = '0'.repeat(64);
        lesson.exerciseDigest = hashValue(lesson.exercises);
      } else lesson[`${scope}Digest`] = '0'.repeat(64);
      const result = verifyPythonPracticeHistoricalCandidate(
        changed,
        declaration(),
        await currentReview(),
      );
      expect(result.technicalRechecks).toEqual([
        { lesson: 'python-practice/python-practice-ch01-l01', scopes: [scope] },
      ]);
    },
  );

  it.each([
    'missing-exercises',
    'empty-rehashed',
    'changed-exercise',
    'missing-fixture',
    'changed-fixture',
    'forged-aggregate',
  ])('exercise内訳と集約が一致しない%s候補を拒否する', async (kind) => {
    const changed = candidate();
    const lesson = changed.courses[0]!.lessons[0]!;
    if (kind === 'missing-exercises') lesson.exercises = [];
    if (kind === 'empty-rehashed') {
      lesson.exercises = [];
      lesson.exerciseDigest = hashValue([]);
    }
    if (kind === 'changed-exercise') lesson.exercises[0]!.digest = '0'.repeat(64);
    if (kind === 'missing-fixture') lesson.exercises[0]!.fixtures.pop();
    if (kind === 'changed-fixture') lesson.exercises[0]!.fixtures[0]!.sourceDigest = '0'.repeat(64);
    if (kind === 'forged-aggregate') lesson.exerciseDigest = '0'.repeat(64);
    const review = await currentReview();
    expect(() => verifyPythonPracticeHistoricalCandidate(changed, declaration(), review)).toThrow(
      /exercise inventory/,
    );
  });

  it.each(['rejected', 'withdrawn', 'stale', 'missing-review', 'duplicate-review', 'self-review'])(
    '現台帳の%sを旧承認で覆さない',
    async (kind) => {
      const review = await currentReview();
      const ledger = review.reviewLedger as {
        lessons: { lessonId: string; decision: string; reviewerId: string; authorId: string }[];
      };
      const first = ledger.lessons[0]!;
      if (kind === 'rejected') first.decision = 'rejected';
      if (kind === 'withdrawn')
        review.withdrawals.push({
          courseId: 'python-practice',
          lessonId: first.lessonId,
          learnerDigest: declaration().lessons[0]!.learnerDigest,
          sourceCommit: declaration().sourceCommit,
          reason: 'known-finding',
        });
      if (kind === 'stale') review.sourceHashes.set(first.lessonId, '0'.repeat(64));
      if (kind === 'missing-review') ledger.lessons.pop();
      if (kind === 'duplicate-review') ledger.lessons.push({ ...first });
      if (kind === 'self-review') first.reviewerId = first.authorId;
      expect(() =>
        verifyPythonPracticeHistoricalCandidate(candidate(), declaration(), review),
      ).toThrow();
    },
  );

  it('任意の原本bytesや宣言を正式receiptとして受け付けない', () => {
    expect(() =>
      validatePythonPracticeHistoricalOriginals(Buffer.from('{}'), Buffer.from('{}')),
    ).toThrow(/original/);
    expect(() =>
      validatePythonPracticeHistoricalDeclaration({ ...declaration(), role: 'maker' }),
    ).toThrow(/Historical/);
  });
});
