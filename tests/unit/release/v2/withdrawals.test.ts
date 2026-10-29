// @vitest-environment node
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { verifyContent } from '../../../../scripts/release/v2/content';
const inventory = {
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
};
const baseline = {
  deploymentId: '501',
  sourceCommit: '1'.repeat(40),
  artifactDigest: 'e'.repeat(64),
  sourceRecordDigest: 'f'.repeat(64),
  inventory,
};
const withdrawal = {
  courseId: 'topic',
  lessonId: 'lesson',
  learnerDigest: 'a'.repeat(64),
  sourceCommit: '1'.repeat(40),
  reason: 'approval-withdrawn',
};
function receipts(digest = 'a'.repeat(64)) {
  return ['content', 'novice', 'recovery', 'maker'].map((role) => ({
    schemaVersion: 1,
    courseId: 'topic',
    lessonId: 'lesson',
    learnerDigest: digest,
    sourceCommit: '2'.repeat(40),
    authorId: 'author',
    actorId: 'reviewer-' + role,
    role,
    method: role === 'content' ? 'source-review' : 'agent-ui',
    status: 'approved',
    accuracy: 'approved',
    goalExerciseAlignment: 'approved',
    unexplainedTerms: 0,
    hintLeakage: 0,
    examplesExecuted: true,
    session: 'session-' + role,
    context: 'context-' + role,
    originalDigest: (role === 'content'
      ? '1'
      : role === 'novice'
        ? '2'
        : role === 'recovery'
          ? '3'
          : '4'
    ).repeat(64),
    receiptDigest: 'e'.repeat(64),
    originalsCheckedBy: 'independent-inspector',
  }));
}
it('blocks an explicit withdrawal even when the deployed baseline would normally carry unchanged content', () => {
  expect(() => verifyContent(inventory, [], baseline, [withdrawal])).toThrow(/withdraw/i);
});
it('cannot override an active withdrawal by appending positive receipts', () => {
  expect(() => verifyContent(inventory, receipts(), baseline, [withdrawal])).toThrow(/withdraw/i);
});
it('retains historical withdrawal scope while requiring all independent approvals for a revised lesson', () => {
  const changed = structuredClone(inventory);
  changed.courses[0]!.lessons[0]!.learnerDigest = '2'.repeat(64);
  expect(() => verifyContent(changed, [], baseline, [withdrawal])).toThrow(/Missing/);
  expect(verifyContent(changed, receipts('2'.repeat(64)), baseline, [withdrawal])).toMatchObject({
    status: 'approved',
    carriedLessons: [],
    newlyApprovedLessons: ['topic/lesson'],
  });
});
it('rejects ambiguous or malformed withdrawal declarations', () => {
  expect(() => verifyContent(inventory, [], baseline, [withdrawal, withdrawal])).toThrow(
    /Duplicate/,
  );
  for (const bad of [
    { ...withdrawal, learnerDigest: 'invalid' },
    { ...withdrawal, reason: 'automatic-approval' },
    { ...withdrawal, sourceCommit: 'missing' },
  ])
    expect(() => verifyContent(inventory, [], baseline, [bad])).toThrow();
});
it('preserves withdrawals through the full sidecar reader and prevents old receipt-only callers from dropping them', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'withdrawal-policy-'));
  try {
    const file = path.join(root, 'policy.json');
    await writeFile(
      file,
      JSON.stringify({ schemaVersion: 1, receipts: [], withdrawals: [withdrawal] }),
    );
    const readers = await import('../../../../scripts/release/v2/contentOriginals');
    const readPolicy = Reflect.get(readers, 'readContentPolicyFile') as (
      file: string,
    ) => Promise<unknown>;
    expect(await readPolicy(file)).toEqual({
      schemaVersion: 1,
      receipts: [],
      withdrawals: [withdrawal],
    });
    await expect(readers.readContentReceiptFile(file)).rejects.toThrow(/withdraw|policy/i);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
