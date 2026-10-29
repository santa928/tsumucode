// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { InventorySchema } from '../../../../scripts/release/v2/schema';

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
const baseline = {
  deploymentId: '501',
  sourceCommit: '1'.repeat(40),
  artifactDigest: 'e'.repeat(64),
  sourceRecordDigest: 'f'.repeat(64),
  inventory,
};
function receipts() {
  return ['content', 'novice', 'recovery', 'maker'].map((role) => ({
    schemaVersion: 1,
    courseId: 'topic',
    lessonId: 'lesson',
    learnerDigest: 'a'.repeat(64),
    sourceCommit: '2'.repeat(40),
    authorId: 'author',
    actorId: 'reviewer-' + role,
    role,
    method: role === 'content' ? 'source-review' : 'agent-ui',
    status: 'approved',
    examplesExecuted: true,
    session: 'session-' + role,
    context: 'context-' + role,
    accuracy: 'approved',
    goalExerciseAlignment: 'approved',
    unexplainedTerms: 0,
    hintLeakage: 0,
    originalDigest: String(['content', 'novice', 'recovery', 'maker'].indexOf(role) + 1).repeat(64),
    receiptDigest: '2'.repeat(64),
    originalsCheckedBy: 'independent-checker',
  }));
}
describe('content identity and historical obligations', () => {
  it('retains unchanged legacy work without inventing three new learner completions', async () => {
    const { verifyContent } = await import('../../../../scripts/release/v2/content');
    const result = verifyContent(inventory, [], baseline);
    expect(result.status).toBe('maintenance');
    expect(result.carriedLessons).toEqual(['topic/lesson']);
    expect(result.newlyApprovedLessons).toEqual([]);
  });
  it('requires every new independent role for an added or changed lesson', async () => {
    const { verifyContent } = await import('../../../../scripts/release/v2/content');
    expect(() =>
      verifyContent(
        inventory,
        receipts().filter((row) => row.role !== 'maker'),
      ),
    ).toThrow(/maker/);
    expect(verifyContent(inventory, receipts()).newlyApprovedLessons).toEqual(['topic/lesson']);
    const changed = structuredClone(inventory);
    changed.courses[0]!.lessons[0]!.learnerDigest = '0'.repeat(64);
    expect(() => verifyContent(changed, [], baseline)).toThrow();
  });
  it('does not convert independent source reviews into beginner UI observations', async () => {
    const { verifyContent } = await import('../../../../scripts/release/v2/content');
    expect(() =>
      verifyContent(
        inventory,
        receipts().map((row) => ({ ...row, method: 'source-review' })),
      ),
    ).toThrow(/method|UI/);
  });
  it.each([
    'stale',
    'duplicate',
    'author',
    'same-actor',
    'same-context',
    'unexecuted',
    'pending',
    'private-raw',
    'accuracy',
    'alignment',
    'terms',
    'hints',
    'same-original',
    'self-original',
  ])('rejects %s approval receipts', async (failure) => {
    const { verifyContent } = await import('../../../../scripts/release/v2/content');
    const rows: Record<string, unknown>[] = receipts();
    switch (failure) {
      case 'stale':
        rows[0]!.learnerDigest = '0'.repeat(64);
        break;
      case 'duplicate':
        rows.push({ ...rows[0] });
        break;
      case 'author':
        rows[0]!.actorId = 'author';
        break;
      case 'same-actor':
        rows[2]!.actorId = rows[1]!.actorId;
        break;
      case 'same-context':
        rows[2]!.context = rows[1]!.context;
        break;
      case 'unexecuted':
        rows[0]!.examplesExecuted = false;
        break;
      case 'pending':
        rows[0]!.status = 'pending';
        break;
      case 'private-raw':
        rows[0]!.rawSource = 'private learner code';
        break;
      case 'accuracy':
        rows[0]!.accuracy = 'rejected';
        break;
      case 'alignment':
        rows[0]!.goalExerciseAlignment = 'rejected';
        break;
      case 'terms':
        rows[0]!.unexplainedTerms = 1;
        break;
      case 'hints':
        rows[0]!.hintLeakage = 1;
        break;
      case 'same-original':
        rows[2]!.originalDigest = rows[1]!.originalDigest;
        break;
      case 'self-original':
        rows[1]!.originalsCheckedBy = rows[1]!.actorId;
        break;
    }
    expect(() => verifyContent(inventory, rows)).toThrow();
  });
  it('does not hide a removed published lesson in a maintenance update', async () => {
    const { verifyContent } = await import('../../../../scripts/release/v2/content');
    const old = structuredClone(inventory);
    old.courses[0]!.lessons.push({ ...old.courses[0]!.lessons[0]!, id: 'old-lesson' });
    expect(() => verifyContent(inventory, [], { ...baseline, inventory: old })).toThrow(
      /removed|削除/,
    );
  });
  it('keeps the learner review while requiring navigation and grading rechecks', async () => {
    const { verifyContent } = await import('../../../../scripts/release/v2/content');
    const changed = structuredClone(inventory);
    changed.courses[0]!.lessons[0]!.exerciseDigest = '3'.repeat(64);
    changed.courses[0]!.lessons[0]!.navigationDigest = '4'.repeat(64);
    const result = verifyContent(changed, [], baseline);
    expect(result.carriedLessons).toEqual(['topic/lesson']);
    expect(result.technicalRechecks).toEqual([
      { lesson: 'topic/lesson', scopes: ['exercise', 'navigation'] },
    ]);
  });
});
