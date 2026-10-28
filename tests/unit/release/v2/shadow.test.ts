// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { InventorySchema } from '../../../../scripts/release/v2/schema';
import type { LegacyCourseEvidence } from '../../../../scripts/release/v2/legacy';
const inventory = InventorySchema.parse({
  schemaVersion: 1,
  fingerprintVersion: 1,
  courses: [
    {
      id: 'topic',
      revision: '1',
      publicationStatus: 'published',
      runner: 'html-css',
      lessons: [
        {
          id: 'lesson',
          kind: 'standard',
          learnerDigest: 'a'.repeat(64),
          exerciseDigest: 'b'.repeat(64),
          navigationDigest: 'c'.repeat(64),
          persistenceDigest: 'd'.repeat(64),
          exercises: [],
        },
      ],
    },
  ],
});
function legacy(): LegacyCourseEvidence {
  return {
    courseId: 'topic',
    format: 'legacy',
    records: [
      {
        kind: 'approval',
        path: 'approval.yaml',
        sha256: 'a'.repeat(64),
        declaredSource: 'draft',
        declaredStatus: 'draft',
        observations: [
          {
            role: 'source-reviewer',
            method: 'independent-ai-source-review',
            source: '1'.repeat(40),
            lessonIds: ['lesson'],
          },
        ],
      },
    ],
    contentLessons: [
      {
        lessonId: 'lesson',
        sourceHash: 'b'.repeat(64),
        actualSourceHash: 'b'.repeat(64),
        sourceHashMatches: true,
        authorId: 'author',
        reviewerId: 'reviewer',
        examplesExecuted: true,
        decision: 'approved',
        accuracy: 'approved',
        goalExerciseAlignment: 'approved',
        unexplainedTerms: 0,
        hintLeakage: 0,
      },
    ],
    coverage: {
      actualLessonIds: ['lesson'],
      missingLessonIds: [],
      extraLessonIds: [],
      duplicateReviewLessonIds: [],
      duplicateSourceLessonIds: [],
    },
    missingRecordPaths: [],
  };
}
describe('legacy shadow migration', () => {
  it('keeps content approval, pending publication and original source-review method separate', async () => {
    const { compareLegacy } = await import('../../../../scripts/release/v2/shadow');
    const report = compareLegacy(inventory, [legacy()]);
    expect(report.courses[0]).toMatchObject({
      courseId: 'topic',
      contentRows: 'valid',
      publication: 'pending',
      learnerApproval: 'historical-only',
    });
    expect(report.courses[0]!.originalRecords).toEqual(legacy().records);
    expect(report.status).toBe('shadow-only');
  });
  it.each(['hash', 'accuracy', 'alignment', 'terms', 'hints', 'self', 'scope'])(
    'rejects invalid old content rows: %s',
    async (failure) => {
      const { compareLegacy } = await import('../../../../scripts/release/v2/shadow');
      const old = structuredClone(legacy());
      const row = old.contentLessons[0]! as unknown as Record<string, unknown>;
      switch (failure) {
        case 'hash':
          row.sourceHashMatches = false;
          break;
        case 'accuracy':
          row.accuracy = 'rejected';
          break;
        case 'alignment':
          row.goalExerciseAlignment = 'rejected';
          break;
        case 'terms':
          row.unexplainedTerms = 1;
          break;
        case 'hints':
          row.hintLeakage = 1;
          break;
        case 'self':
          row.reviewerId = 'author';
          break;
        case 'scope':
          (old.coverage as unknown as Record<string, unknown>).missingLessonIds = ['other'];
          break;
      }
      expect(compareLegacy(inventory, [old]).courses[0]!.contentRows).toBe('invalid');
    },
  );
  it('does not approve a new course with no legacy record', async () => {
    const { compareLegacy } = await import('../../../../scripts/release/v2/shadow');
    expect(compareLegacy(inventory, []).courses[0]).toMatchObject({
      contentRows: 'missing',
      publication: 'unknown',
      learnerApproval: 'new-evidence-required',
    });
  });
  it('removes only unchanged content-review targets from a maintenance plan', async () => {
    const { planRelease } = await import('../../../../scripts/release/v2/plan');
    const baseline = {
      deploymentId: '1',
      sourceCommit: '1'.repeat(40),
      artifactDigest: '2'.repeat(64),
      sourceRecordDigest: '3'.repeat(64),
      inventory,
    };
    const plan = planRelease(inventory, baseline);
    expect(
      plan.targets.some((target) => target.kind === 'content' || target.kind === 'learning'),
    ).toBe(false);
    expect(plan.targets.some((target) => target.kind === 'persistence')).toBe(true);
    const changed = structuredClone(inventory);
    changed.courses[0]!.lessons[0]!.learnerDigest = '4'.repeat(64);
    expect(
      planRelease(changed, baseline).targets.filter((target) => target.kind === 'learning'),
    ).toHaveLength(3);
  });
});
