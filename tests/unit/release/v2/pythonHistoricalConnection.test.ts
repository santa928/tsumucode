// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { beforeAll, describe, expect, it } from 'vitest';
import { compileCourse } from '../../../../scripts/content/compileCourse';
import { buildInventory } from '../../../../scripts/release/v2/inventory';
import { verifyContent } from '../../../../scripts/release/v2/content';
import { QualificationSchema } from '../../../../scripts/release/v2/admission';
import { planRelease } from '../../../../scripts/release/v2/plan';
import { hashValue } from '../../../../scripts/release/v2/identity';
import { pythonPracticeHistoricalDeclaration } from '../../../../scripts/release/v2/pythonPracticeHistoricalAcceptance';
import { pythonOopHistoricalDeclaration } from '../../../../scripts/release/v2/pythonOopHistoricalAcceptance';
import type { ReleaseInventory } from '../../../../scripts/release/v2/schema';

let inventory: ReleaseInventory;
let acceptances: Record<string, unknown>[];
beforeAll(async () => {
  inventory = buildInventory(
    await Promise.all(
      ['python-practice', 'python-oop'].map((id) => compileCourse('content/' + id)),
    ),
  );
  for (const course of inventory.courses) course.publicationStatus = 'published';
  acceptances = JSON.parse(
    await readFile('docs/quality/python-historical-acceptance.json', 'utf8'),
  ) as Record<string, unknown>[];
});
const candidate = () => structuredClone(inventory);
const migrate = (input = candidate(), rows: unknown = acceptances, withdrawals: unknown = []) =>
  verifyContent(input, [], undefined, withdrawals, rows);

describe('固定Python歴史受入の共通content接続', () => {
  it('5+9 Lessonを限定歴史受入として保持し、42件の新役割承認にしない', () => {
    const result = migrate();
    expect(result.status).toBe('historical');
    expect(result.newlyApprovedLessons).toEqual([]);
    expect(result.historicallyAcceptedLessons).toHaveLength(14);
    const parsed = QualificationSchema.shape.content.parse(result);
    expect(parsed.pythonHistoricalAcceptances).toHaveLength(2);
    expect(
      parsed.pythonHistoricalAcceptances?.find((row) => row.courseId === 'python-practice')
        ?.uiObservation,
    ).toMatchObject({
      actorCount: 3,
      completeAllLessonThreeRoleClaim: false,
      inferredActorRoleReceipts: 0,
    });
    expect(
      parsed.pythonHistoricalAcceptances?.find((row) => row.courseId === 'python-oop')
        ?.uiObservation,
    ).toMatchObject({
      actorCount: 3,
      exactObservationTimestamp: null,
      observedAfterByActor: {
        first: null,
        recovery: '18:49以降の新実操作との親報告',
        narrow: null,
      },
    });
  });

  it('裸の準備宣言・独立認証なしでは共通gateを通さない', () => {
    expect(() => migrate(candidate(), [pythonPracticeHistoricalDeclaration()])).toThrow();
    expect(() => migrate(candidate(), [pythonOopHistoricalDeclaration()])).toThrow();
    expect(() => migrate(candidate(), [])).toThrow(/Missing content/);
  });

  it.each(['duplicate', 'rehashed', 'inspector', 'source', 'roles'])(
    '%s の固定認証改変を拒否する',
    (kind) => {
      const rows = structuredClone(acceptances);
      if (kind === 'duplicate') rows.push(rows[0]!);
      else {
        const row = rows[0]!;
        if (kind === 'source') row.sourceCommit = '0'.repeat(40);
        if (kind === 'inspector') row.inspectorId = 'course-author';
        if (kind === 'roles') row.role = 'maker';
        if (kind === 'rehashed') {
          row.declarationDigest = '0'.repeat(64);
          const { receiptDigest, ...unsigned } = row;
          void receiptDigest;
          row.receiptDigest = hashValue(unsigned);
        }
      }
      expect(() => migrate(candidate(), rows)).toThrow();
    },
  );

  it.each(['learner', 'added', 'removed', 'foreign', 'empty-exercise'])(
    '%s を限定旧受入で覆さない',
    (kind) => {
      const input = candidate();
      const course = input.courses[0]!;
      if (kind === 'learner') course.lessons[0]!.learnerDigest = '0'.repeat(64);
      if (kind === 'added') course.lessons.push({ ...course.lessons[0]!, id: 'extra-lesson' });
      if (kind === 'removed') course.lessons.pop();
      if (kind === 'foreign') course.id = 'other-course';
      if (kind === 'empty-exercise') {
        course.lessons[0]!.exercises = [];
        course.lessons[0]!.exerciseDigest = hashValue([]);
      }
      expect(() => migrate(input)).toThrow();
    },
  );

  it('現withdrawalを旧受入で覆さない', () => {
    const lesson = inventory.courses.find((course) => course.id === 'python-practice')!.lessons[0]!;
    expect(() =>
      migrate(candidate(), acceptances, [
        {
          courseId: 'python-practice',
          lessonId: lesson.id,
          learnerDigest: lesson.learnerDigest,
          sourceCommit: pythonPracticeHistoricalDeclaration().sourceCommit,
          reason: 'approval-withdrawn',
        },
      ]),
    ).toThrow(/withdrawal/);
  });

  it('実践の技術差分を保持し、OOPの固定fingerprint差分は拒否する', () => {
    const input = candidate();
    input.courses.find((course) => course.id === 'python-practice')!.lessons[0]!.navigationDigest =
      '0'.repeat(64);
    expect(migrate(input).technicalRechecks).toContainEqual({
      lesson: 'python-practice/python-practice-ch01-l01',
      scopes: ['navigation'],
    });
    input.courses.find((course) => course.id === 'python-oop')!.lessons[0]!.persistenceDigest =
      '0'.repeat(64);
    expect(() => migrate(input)).toThrow();
  });

  it('qualificationから部分観察・未確認・技術再検証義務を落とせない', () => {
    const result = migrate();
    for (const field of ['uiObservation', 'unverified', 'requiredTechnicalChecks']) {
      const altered = structuredClone(result) as unknown as Record<string, unknown>;
      const summaries = altered.pythonHistoricalAcceptances as Record<string, unknown>[];
      summaries[0]![field] = [];
      expect(() => QualificationSchema.shape.content.parse(altered)).toThrow();
    }
    const dropped = { ...result, pythonHistoricalAcceptances: undefined };
    expect(() => QualificationSchema.shape.content.parse(dropped)).toThrow();
  });

  it('実公開baselineやplanを捏造せず、技術Browser・fixture・保存の要件を保持する', () => {
    const before = planRelease(inventory);
    migrate();
    expect(planRelease(inventory)).toEqual(before);
    expect(before.parent).toBeNull();
    for (const course of inventory.courses)
      for (const lesson of course.lessons) {
        const targets = before.targets.filter(
          (t) => t.courseId === course.id && t.lessonId === lesson.id,
        );
        expect(targets.filter((t) => t.kind === 'learning-engine')).toHaveLength(3);
        expect(targets.some((t) => t.kind === 'fixture' && t.mode === 'cpython')).toBe(true);
        expect(targets.some((t) => t.kind === 'fixture' && t.mode === 'pyodide')).toBe(true);
        expect(targets.some((t) => t.kind === 'persistence')).toBe(true);
      }
  });
});
