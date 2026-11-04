// @vitest-environment node
import { readFileSync } from 'node:fs';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import os from 'node:os';
import { describe, expect, it } from 'vitest';
import { verifyContent } from '../../../../scripts/release/v2/content';
import { InventorySchema } from '../../../../scripts/release/v2/schema';
import { gitFixtureEnvironment } from './gitFixture';
import { hashValue } from '../../../../scripts/release/v2/identity';
import { QualificationSchema } from '../../../../scripts/release/v2/admission';

const historical = JSON.parse(
  readFileSync('docs/quality/tailwind-historical-acceptance.json', 'utf8'),
) as Record<string, unknown> & {
  lessons: {
    id: string;
    learnerDigest: string;
    exerciseDigest: string;
    navigationDigest: string;
    persistenceDigest: string;
  }[];
};
function inventory() {
  return InventorySchema.parse({
    schemaVersion: 1,
    fingerprintVersion: 1,
    courses: [
      {
        id: 'tailwind',
        revision: '2026-10-15.2',
        publicationStatus: 'published',
        runner: 'tailwind',
        lessons: historical.lessons.map((lesson) => ({
          ...lesson,
          kind: lesson.id === 'tailwind-ch02-l01' ? 'guided-project' : 'standard',
          exercises: [],
        })),
      },
    ],
  });
}
const migrate = (
  candidate = inventory(),
  receipt: unknown = historical,
  withdrawals: unknown[] = [],
) => verifyContent(candidate, [], undefined, withdrawals, [receipt]);

describe('bounded Tailwind historical acceptance', () => {
  it('retains five historical lessons and the one real AI actor without inventing new role approvals', () => {
    const result = migrate();
    expect(QualificationSchema.shape.content.parse(result)).toMatchObject({
      status: 'historical',
      carriedLessons: [],
      newlyApprovedLessons: [],
      historicallyAcceptedLessons: historical.lessons.map(({ id }) => 'tailwind/' + id),
      historicalAcceptance: {
        migrationId: 'tailwind-2026-10-27',
        sourceCommit: historical.sourceCommit,
        uiActorCount: 1,
        unverified: historical.unverified,
      },
    });
    expect(() =>
      QualificationSchema.shape.content.parse({
        ...result,
        historicalAcceptance: undefined,
      }),
    ).toThrow(/Historical qualification/);
  });

  it('does not admit a changed lesson or an additional lesson using the historical receipt', () => {
    const changed = inventory();
    changed.courses[0]!.lessons[0]!.learnerDigest = '0'.repeat(64);
    expect(() => migrate(changed)).toThrow(/Missing content/);
    const added = inventory();
    added.courses[0]!.lessons.push({ ...added.courses[0]!.lessons[0]!, id: 'tailwind-new' });
    expect(() => migrate(added)).toThrow(/Missing content/);
    const removed = inventory();
    removed.courses[0]!.lessons.pop();
    expect(() => migrate(removed)).toThrow(/Historical lesson removed/);
  });

  it('requires new roles only for a changed lesson while retaining the other four histories', () => {
    const changed = inventory();
    const lesson = changed.courses[0]!.lessons[0]!;
    lesson.learnerDigest = '0'.repeat(64);
    const rows = ['content', 'novice', 'recovery', 'maker'].map((role, index) => ({
      schemaVersion: 1,
      courseId: 'tailwind',
      lessonId: lesson.id,
      learnerDigest: lesson.learnerDigest,
      sourceCommit: '1'.repeat(40),
      authorId: 'new-author',
      actorId: 'new-' + role,
      role,
      method: role === 'content' ? 'source-review' : 'agent-ui',
      status: 'approved',
      accuracy: 'approved',
      goalExerciseAlignment: 'approved',
      unexplainedTerms: 0,
      hintLeakage: 0,
      examplesExecuted: true,
      session: 'new-session-' + role,
      context: 'new-context-' + role,
      originalDigest: String(index + 1).repeat(64),
      receiptDigest: 'a'.repeat(64),
      originalsCheckedBy: 'new-inspector',
    }));
    expect(verifyContent(changed, rows, undefined, [], [historical])).toMatchObject({
      status: 'approved',
      newlyApprovedLessons: ['tailwind/' + lesson.id],
      historicallyAcceptedLessons: historical.lessons.slice(1).map(({ id }) => 'tailwind/' + id),
    });
    const other = inventory();
    other.courses[0]!.id = 'another-course';
    expect(() => migrate(other)).toThrow(/Missing content/);
  });

  it('keeps explicit withdrawal effective for the exact historical lesson', () => {
    const lesson = historical.lessons[0]!;
    expect(() =>
      migrate(inventory(), historical, [
        {
          courseId: 'tailwind',
          lessonId: lesson.id,
          learnerDigest: lesson.learnerDigest,
          sourceCommit: historical.sourceCommit,
          reason: 'known-finding',
        },
      ]),
    ).toThrow(/withdrawal/);
  });

  it('retains historical content but reports changed exercise/navigation/persistence for current checks', () => {
    const changed = inventory();
    changed.courses[0]!.lessons[0]!.exerciseDigest = '0'.repeat(64);
    changed.courses[0]!.lessons[0]!.navigationDigest = '1'.repeat(64);
    changed.courses[0]!.lessons[0]!.persistenceDigest = '2'.repeat(64);
    expect(migrate(changed)).toMatchObject({
      technicalRechecks: [
        {
          lesson: 'tailwind/tailwind-ch01-l01',
          scopes: ['exercise', 'navigation', 'persistence'],
        },
      ],
    });
  });

  it.each([
    'source',
    'actor-count',
    'fingerprint',
    'hidden-role',
    'other-course',
    'missing-limits',
  ])('rejects a %s alteration rather than broadening the historical acceptance', (kind) => {
    const forged = structuredClone(historical);
    if (kind === 'source') forged.sourceCommit = '0'.repeat(40);
    if (kind === 'actor-count')
      forged.uiObservation = { ...(forged.uiObservation as object), actorCount: 3 };
    if (kind === 'fingerprint') forged.lessons[0]!.learnerDigest = '0'.repeat(64);
    if (kind === 'hidden-role') forged.role = 'maker';
    if (kind === 'other-course') forged.courseId = 'another-course';
    if (kind === 'missing-limits') forged.unverified = [];
    expect(() => migrate(inventory(), forged)).toThrow(/Historical (?:acceptance|receipt)/);
  });

  it('does not turn a freshly rehashed caller declaration into another historical migration', () => {
    const forged = structuredClone(historical);
    forged.sourceCommit = '0'.repeat(40);
    const { receiptDigest, ...unsigned } = forged;
    void receiptDigest;
    forged.receiptDigest = hashValue(unsigned);
    expect(() => migrate(inventory(), forged)).toThrow(/Historical receipt/);
  });

  it('verifies archived Git bytes, old five-lesson fingerprints and observation-source equality', async () => {
    const { readVerifiedTailwindHistoricalAcceptance } =
      await import('../../../../scripts/release/v2/tailwindHistoricalAcceptance');
    const rows = await readVerifiedTailwindHistoricalAcceptance(process.cwd(), inventory());
    expect(rows).toEqual([historical]);
  }, 15_000);

  it('does not override a current rejected review with the old approval', async () => {
    const { readVerifiedTailwindHistoricalAcceptance, TAILWIND_HISTORICAL_PATH } =
      await import('../../../../scripts/release/v2/tailwindHistoricalAcceptance');
    const root = await mkdtemp(path.join(os.tmpdir(), 'tailwind-rejected-'));
    try {
      const exec = promisify(execFile);
      const common = (
        await exec('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'])
      ).stdout.trim();
      // Own metadata/config; only immutable source objects come from the read-only CI mount.
      await exec('git', ['init', '--quiet', root], { env: gitFixtureEnvironment() });
      await writeFile(
        path.join(root, '.git/objects/info/alternates'),
        path.join(common, 'objects') + '\n',
      );
      await mkdir(path.dirname(path.join(root, TAILWIND_HISTORICAL_PATH)), { recursive: true });
      await writeFile(path.join(root, TAILWIND_HISTORICAL_PATH), JSON.stringify(historical));
      const review = readFileSync('docs/quality/content-review-tailwind.yaml', 'utf8').replace(
        'decision: approved',
        'decision: rejected',
      );
      await writeFile(path.join(root, 'docs/quality/content-review-tailwind.yaml'), review);
      await expect(readVerifiedTailwindHistoricalAcceptance(root, inventory())).rejects.toThrow(
        /no longer approved/,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 15_000);

  it('does not substitute a declaration for missing or tampered evidence, or use it for a draft', async () => {
    const { readVerifiedTailwindHistoricalAcceptance, TAILWIND_HISTORICAL_PATH } =
      await import('../../../../scripts/release/v2/tailwindHistoricalAcceptance');
    const root = await mkdtemp(path.join(os.tmpdir(), 'tailwind-history-'));
    try {
      expect(await readVerifiedTailwindHistoricalAcceptance(root, inventory())).toEqual([]);
      const file = path.join(root, TAILWIND_HISTORICAL_PATH);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, JSON.stringify({ ...historical, sourceCommit: '0'.repeat(40) }));
      await expect(readVerifiedTailwindHistoricalAcceptance(root, inventory())).rejects.toThrow(
        /Historical receipt/,
      );
      const draft = inventory();
      draft.courses[0]!.publicationStatus = 'draft';
      expect(await readVerifiedTailwindHistoricalAcceptance(root, draft)).toEqual([]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
