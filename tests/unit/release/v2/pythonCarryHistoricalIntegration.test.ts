// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { beforeAll, expect, it } from 'vitest';
import { z } from 'zod';
import { compileCourse } from '../../../../scripts/content/compileCourse';
import { buildInventory } from '../../../../scripts/release/v2/inventory';
import { QualificationSchema } from '../../../../scripts/release/v2/admission';
import { ContentReceiptSchema, verifyContent } from '../../../../scripts/release/v2/content';
import { verifyMovementInputs } from '../../../../scripts/release/v2/movement';
import { planRelease } from '../../../../scripts/release/v2/plan';
import { pythonReferenceFixture, sealPythonReferenceFixture } from './pythonReferenceFixture';

let fixture: Awaited<ReturnType<typeof pythonReferenceFixture>>;
let histories: unknown[];
let receipts: z.infer<typeof ContentReceiptSchema>[];
beforeAll(async () => {
  fixture = await pythonReferenceFixture();
  const extra = buildInventory(
    await Promise.all(
      ['python-practice', 'python-oop', 'tailwind'].map((id) => compileCourse('content/' + id)),
    ),
  );
  for (const course of extra.courses) course.publicationStatus = 'published';
  fixture.inventory.courses.push(...extra.courses);
  const old = structuredClone(extra.courses);
  for (const course of old) course.publicationStatus = 'draft';
  fixture.baseline.inventory.courses.push(...old);
  fixture = sealPythonReferenceFixture(fixture);
  const python: unknown = JSON.parse(
    await readFile('docs/quality/python-historical-acceptance.json', 'utf8'),
  );
  const tailwind: unknown = JSON.parse(
    await readFile('docs/quality/tailwind-historical-acceptance.json', 'utf8'),
  );
  histories = [...z.array(z.unknown()).parse(python), tailwind];
  receipts = z
    .object({ receipts: z.array(ContentReceiptSchema) })
    .parse(JSON.parse(await readFile('docs/quality/content-v2-receipts.json', 'utf8')))
    .receipts.filter(({ courseId }) => fixture.inventory.courses.some(({ id }) => id === courseId));
}, 60000);

// 実Git/Compiler/固定sidecarを使う契約テスト。baseline認証とmovement承認は合成fixture。
function content(withdrawals: unknown = []) {
  const movement = verifyMovementInputs(fixture.inputs, fixture.inventory, fixture.baseline);
  return verifyContent(
    fixture.inventory,
    receipts,
    fixture.baseline,
    withdrawals,
    histories,
    movement,
  );
}

it('固定2教材carry・Python両history・Tailwindを同時に保持する', () => {
  const result = QualificationSchema.shape.content.parse(content());
  expect(result.movementLearnerAcceptance).toHaveLength(4);
  expect(
    result.movementLearnerAcceptance?.filter((row) => row.kind === 'reference-only'),
  ).toHaveLength(2);
  expect(result.historicallyAcceptedLessons).toHaveLength(19);
  expect(result.pythonHistoricalAcceptances?.map((row) => row.courseId).sort()).toEqual([
    'python-oop',
    'python-practice',
  ]);
  expect(result.historicalAcceptance?.migrationId).toBe('tailwind-2026-10-27');
  expect(result.newlyApprovedLessons.every((key) => key.startsWith('python-basics/'))).toBe(true);
  const movement = verifyMovementInputs(fixture.inputs, fixture.inventory, fixture.baseline);
  const plan = planRelease(fixture.inventory, fixture.baseline, movement);
  for (const id of ['python-basics-ch01-l05', 'python-basics-ch02-l01']) {
    expect(
      plan.targets.filter((row) => row.lessonId === id && row.kind === 'learning-engine'),
    ).toHaveLength(3);
    expect(result.technicalRechecks).toContainEqual({
      lesson: 'python-basics/' + id,
      scopes: ['navigation', 'persistence'],
    });
  }
});

it.each(['pythonHistoricalAcceptances', 'historicalAcceptance'] as const)(
  'movementがあっても%sの根拠省略を拒否する',
  (field) => {
    const result = { ...content(), [field]: undefined };
    expect(() => QualificationSchema.shape.content.parse(result)).toThrow();
  },
);

it.each(['movement', 'python-history'] as const)(
  '同居した旧受入によって%sのwithdrawalを覆さない',
  (kind) => {
    const old =
      kind === 'movement'
        ? fixture.baseline.inventory.courses.find((row) => row.id === 'python-basics')!
        : fixture.inventory.courses.find((row) => row.id === 'python-practice')!;
    const lesson =
      kind === 'movement'
        ? old.lessons.find((row) => row.id === 'python-basics-ch01-l05')!
        : old.lessons[0]!;
    expect(() =>
      content([
        {
          courseId: old.id,
          lessonId: lesson.id,
          learnerDigest: lesson.learnerDigest,
          sourceCommit: fixture.baseline.sourceCommit,
          reason: 'approval-withdrawn',
        },
      ]),
    ).toThrow(/withdrawal/);
  },
);
