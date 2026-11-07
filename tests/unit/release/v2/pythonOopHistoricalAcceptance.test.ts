// @vitest-environment node
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { compileCourse } from '../../../../scripts/content/compileCourse';
import { buildInventory } from '../../../../scripts/release/v2/inventory';
import { hashValue } from '../../../../scripts/release/v2/identity';
import type { ReleaseInventory } from '../../../../scripts/release/v2/schema';
import {
  pythonOopHistoricalDeclaration,
  readVerifiedPythonOopHistoricalEvidence,
  validatePythonOopHistoricalDeclaration,
  validatePythonOopHistoricalOriginals,
  verifyPythonOopHistoricalCandidate,
} from '../../../../scripts/release/v2/pythonOopHistoricalAcceptance';

let inventory: ReleaseInventory;
let ledger: unknown;
beforeAll(async () => {
  inventory = buildInventory([await compileCourse('content/python-oop')]);
  ledger = parse(await readFile('docs/quality/content-review-python-oop.yaml', 'utf8'));
}, 15_000);

function review() {
  return {
    reviewLedger: structuredClone(ledger),
    sourceHashes: new Map(
      pythonOopHistoricalDeclaration().lessons.map(({ id, sourceHash }) => [id, sourceHash]),
    ),
    withdrawals: [] as unknown[],
  };
}

describe('Python OOPの限定歴史受入候補', () => {
  it('実教材9件を結び、限定3親報告から27件のrole receiptを生成しない', () => {
    const result = verifyPythonOopHistoricalCandidate(
      inventory,
      pythonOopHistoricalDeclaration(),
      review(),
    );
    expect(result.status).toBe('proposal-not-a-content-receipt');
    expect(result.lessons).toHaveLength(9);
    expect(result.uiObservation).toMatchObject({
      actorCount: 3,
      method: 'parent-direct-report-of-independent-computer-use',
      observedLessonIds: ['python-oop-ch01-l01', 'python-oop-ch04-l01'],
      independentChildImagesInspectedHere: false,
      inferredActorRoleReceipts: 0,
      completeAllLessonThreeRoleClaim: false,
      exactObservationTimestamp: null,
    });
    expect(result.technicalRechecks).toEqual([
      'runtime',
      'usability',
      'accessibility',
      'persistence',
      'delivery',
    ]);
    expect(result.currentReview).toEqual({ lessonsReviewed: 9, staleHashes: 0, rejected: 0 });
  });

  it('18:49以降という親報告は回復担当だけに結び、初見・小画面の時刻は未確認とする', () => {
    const observation = verifyPythonOopHistoricalCandidate(
      inventory,
      pythonOopHistoricalDeclaration(),
      review(),
    ).uiObservation;
    expect(observation).not.toHaveProperty('observedAfter');
    expect(observation).toHaveProperty('observedAfterByActor', {
      first: null,
      recovery: '18:49以降の新実操作との親報告',
      narrow: null,
    });
    expect(observation.exactObservationTimestamp).toBeNull();
  });

  it.each(['learner', 'exercise', 'navigation', 'persistence'] as const)(
    '%s fingerprintが変われば旧受入候補の継承を拒否する',
    (scope) => {
      const changed = structuredClone(inventory);
      changed.courses[0]!.lessons[0]![`${scope}Digest`] = '0'.repeat(64);
      expect(() =>
        verifyPythonOopHistoricalCandidate(changed, pythonOopHistoricalDeclaration(), review()),
      ).toThrow(/fingerprint/);
    },
  );

  it('Fixture実体の改変を集約digestの据置きでも拒否する', () => {
    const changed = structuredClone(inventory);
    changed.courses[0]!.lessons[0]!.exercises[0]!.fixtures[0]!.expectedStatus = 'system-error';
    expect(() =>
      verifyPythonOopHistoricalCandidate(changed, pythonOopHistoricalDeclaration(), review()),
    ).toThrow(/exercise/);
  });

  it.each(['add', 'remove', 'duplicate', 'other-course'])(
    '固定9 Lesson集合の%s変更を拒否する',
    (kind) => {
      const changed = structuredClone(inventory);
      const course = changed.courses[0]!;
      if (kind === 'add') course.lessons.push({ ...course.lessons[0]!, id: 'python-oop-extra' });
      if (kind === 'remove') course.lessons.pop();
      if (kind === 'duplicate') course.lessons[1] = structuredClone(course.lessons[0]!);
      if (kind === 'other-course') course.id = 'python-practice';
      expect(() =>
        verifyPythonOopHistoricalCandidate(changed, pythonOopHistoricalDeclaration(), review()),
      ).toThrow(/lesson set/);
    },
  );

  it('他Courseを同時に承認せずOOPだけを照合する', () => {
    const combined = structuredClone(inventory);
    combined.courses.push({ ...structuredClone(combined.courses[0]!), id: 'another-course' });
    expect(
      verifyPythonOopHistoricalCandidate(combined, pythonOopHistoricalDeclaration(), review())
        .courseId,
    ).toBe('python-oop');
  });

  it.each(['source', 'tree', 'course', 'lesson', 'scope', 'role', 'limits', 'audit'])(
    '宣言の%s改変を認めない',
    (kind) => {
      const changed = structuredClone(pythonOopHistoricalDeclaration());
      if (kind === 'source') changed.sourceCommit = '0'.repeat(40);
      if (kind === 'tree') changed.sourceTree = '0'.repeat(40);
      if (kind === 'course') Object.assign(changed, { courseId: 'python-practice' });
      if (kind === 'lesson') changed.lessons[0]!.learnerDigest = '0'.repeat(64);
      if (kind === 'scope') changed.uiObservation.observedLessonIds.push('python-oop-ch02-l01');
      if (kind === 'role') Object.assign(changed.uiObservation, { inferredActorRoleReceipts: 27 });
      if (kind === 'limits') changed.unverified = [];
      if (kind === 'audit') changed.privateReferences[0]!.sha256 = '0'.repeat(64);
      expect(() => validatePythonOopHistoricalDeclaration(changed)).toThrow(/declaration/);
    },
  );

  it('別宣言を再hashしてreceiptを名乗っても認めない', () => {
    const forged = pythonOopHistoricalDeclaration();
    forged.sourceCommit = '0'.repeat(40);
    Object.assign(forged, { receiptDigest: hashValue(forged) });
    expect(() => validatePythonOopHistoricalDeclaration(forged)).toThrow(/declaration/);
  });

  it('宣言の再hashを要さない軽微なscope書換えも拒否する', () => {
    const changed = pythonOopHistoricalDeclaration();
    changed.uiObservation.exactObservationTimestamp = '2026-10-14T18:49:00Z';
    expect(() => validatePythonOopHistoricalDeclaration(changed)).toThrow(/declaration/);
  });

  it.each(['withdrawn', 'known-finding'])('%sを別Sourceの承認で上書きしない', (kind) => {
    const current = review();
    const lesson = pythonOopHistoricalDeclaration().lessons[0]!;
    current.withdrawals = [
      {
        courseId: 'python-oop',
        lessonId: lesson.id,
        learnerDigest: lesson.learnerDigest,
        sourceCommit: '1'.repeat(40),
        reason: kind === 'withdrawn' ? 'approval-withdrawn' : 'known-finding',
      },
    ];
    expect(() =>
      verifyPythonOopHistoricalCandidate(inventory, pythonOopHistoricalDeclaration(), current),
    ).toThrow(/withdrawal/);
  });

  it.each(['digest', 'lesson'])('withdrawalの%s改変で固定案件を再承認しない', (kind) => {
    const current = review();
    const lesson = pythonOopHistoricalDeclaration().lessons[0]!;
    current.withdrawals = [
      {
        courseId: 'python-oop',
        lessonId: kind === 'lesson' ? 'python-oop-extra' : lesson.id,
        learnerDigest: kind === 'digest' ? '0'.repeat(64) : lesson.learnerDigest,
        sourceCommit: '1'.repeat(40),
        reason: 'approval-withdrawn',
      },
    ];
    expect(() =>
      verifyPythonOopHistoricalCandidate(inventory, pythonOopHistoricalDeclaration(), current),
    ).toThrow(/withdrawal/);
  });

  it.each(['rejected', 'author', 'hash', 'notes', 'missing'])(
    '現在の台帳またはSource hashの%s改変を拒否する',
    (kind) => {
      const current = review();
      const record = current.reviewLedger as { lessons: Record<string, unknown>[] };
      if (kind === 'rejected') record.lessons[0]!.decision = 'rejected';
      if (kind === 'author') record.lessons[0]!.reviewerId = record.lessons[0]!.authorId;
      if (kind === 'notes') record.lessons[0]!.notes = 'changed approval';
      if (kind === 'missing') record.lessons.pop();
      if (kind === 'hash') current.sourceHashes.set('python-oop-ch01-l01', '0'.repeat(64));
      expect(() =>
        verifyPythonOopHistoricalCandidate(inventory, pythonOopHistoricalDeclaration(), current),
      ).toThrow(/review|source hash/);
    },
  );

  it.each(['missing', 'extra'])('現在のsource hash集合の%sを拒否する', (kind) => {
    const current = review();
    if (kind === 'missing') current.sourceHashes.delete('python-oop-ch01-l01');
    else current.sourceHashes.set('python-oop-extra', '0'.repeat(64));
    expect(() =>
      verifyPythonOopHistoricalCandidate(inventory, pythonOopHistoricalDeclaration(), current),
    ).toThrow(/source hash/);
  });

  it('symlink原本を読み取らず拒否する', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'oop-history-link-'));
    try {
      const reference = pythonOopHistoricalDeclaration().privateReferences[0]!;
      const target = path.join(directory, 'target');
      await writeFile(target, new Uint8Array(reference.bytes));
      await symlink(target, path.join(directory, reference.path));
      await expect(
        readVerifiedPythonOopHistoricalEvidence(process.cwd(), directory),
      ).rejects.toThrow(/original file/);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('同byte長の偽原本を実file readerでも拒否する', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'oop-history-bytes-'));
    try {
      for (const reference of pythonOopHistoricalDeclaration().privateReferences)
        await writeFile(path.join(directory, reference.path), new Uint8Array(reference.bytes));
      await expect(
        readVerifiedPythonOopHistoricalEvidence(process.cwd(), directory),
      ).rejects.toThrow(/original bytes/);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('私有原本が欠ける／偽のbytesなら宣言で代用できない', () => {
    expect(() => validatePythonOopHistoricalOriginals(new Map())).toThrow(/original/);
    const forged = new Map(
      pythonOopHistoricalDeclaration().privateReferences.map(({ path, bytes }) => [
        path,
        new Uint8Array(bytes),
      ]),
    );
    expect(() => validatePythonOopHistoricalOriginals(forged)).toThrow(/original/);
  });
});
