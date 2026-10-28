import { z } from 'zod';
import { CommitSchema, DigestSchema, IdSchema, InventorySchema } from './schema';
import type { LessonInventory, ReleaseInventory } from './schema';

const ReceiptSchema = z
  .object({
    schemaVersion: z.literal(1),
    courseId: IdSchema,
    lessonId: IdSchema,
    learnerDigest: DigestSchema,
    sourceCommit: CommitSchema,
    authorId: z.string().min(1),
    actorId: z.string().min(1),
    role: z.enum(['content', 'novice', 'recovery', 'maker']),
    method: z.enum(['source-review', 'agent-ui', 'human-ui']),
    status: z.literal('approved'),
    accuracy: z.literal('approved'),
    goalExerciseAlignment: z.literal('approved'),
    unexplainedTerms: z.literal(0),
    hintLeakage: z.literal(0),
    examplesExecuted: z.boolean(),
    session: z.string().min(1),
    context: z.string().min(1),
    originalDigest: DigestSchema,
    receiptDigest: DigestSchema,
    originalsCheckedBy: z.string().min(1),
  })
  .strict();
export const BaselineSchema = z
  .object({
    deploymentId: z.string().regex(/^[1-9]\d*$/u),
    sourceCommit: CommitSchema,
    artifactDigest: DigestSchema,
    sourceRecordDigest: DigestSchema,
    inventory: InventorySchema,
  })
  .strict();
export type ContentBaseline = z.infer<typeof BaselineSchema>;
export type ContentReceipt = z.infer<typeof ReceiptSchema>;
const roles = ['content', 'novice', 'recovery', 'maker'] as const;
function publishedLessons(inventory: ReleaseInventory): Map<string, LessonInventory> {
  return new Map(
    inventory.courses
      .filter((course) => course.publicationStatus === 'published')
      .flatMap((course) =>
        course.lessons.map((lesson) => [`${course.id}/${lesson.id}`, lesson] as const),
      ),
  );
}

/** Baseline authenticity and original receipt inspection belong to the trusted caller.
 * Carrying historical content does not convert its outstanding obligations into approvals. */
export function verifyContent(
  inventoryInput: unknown,
  receiptsInput: unknown,
  baselineInput?: unknown,
) {
  const inventory = InventorySchema.parse(inventoryInput);
  const receipts = z.array(ReceiptSchema).parse(receiptsInput);
  const baseline = baselineInput === undefined ? undefined : BaselineSchema.parse(baselineInput);
  const current = publishedLessons(inventory);
  const previous = baseline
    ? publishedLessons(baseline.inventory)
    : new Map<string, LessonInventory>();
  for (const key of previous.keys())
    if (!current.has(key)) throw new Error(`Published lesson removed: ${key}`);
  const receiptKeys = new Set<string>();
  for (const receipt of receipts) {
    const key = `${receipt.courseId}/${receipt.lessonId}`;
    const lesson = current.get(key);
    if (!lesson || lesson.learnerDigest !== receipt.learnerDigest)
      throw new Error(`Stale or unknown content receipt: ${key}`);
    const roleKey = `${key}/${receipt.role}`;
    if (receiptKeys.has(roleKey)) throw new Error(`Duplicate receipt: ${roleKey}`);
    receiptKeys.add(roleKey);
    if (
      receipt.actorId === receipt.authorId ||
      receipt.originalsCheckedBy === receipt.authorId ||
      receipt.originalsCheckedBy === receipt.actorId
    )
      throw new Error(`Independent review required: ${roleKey}`);
    if (receipt.role === 'content') {
      if (receipt.method !== 'source-review' || !receipt.examplesExecuted)
        throw new Error(`Content examples must be executed: ${roleKey}`);
    } else if (receipt.method === 'source-review')
      throw new Error(`UI method required: ${roleKey}`);
  }
  const carriedLessons: string[] = [];
  const newlyApprovedLessons: string[] = [];
  const technicalRechecks: { lesson: string; scopes: string[] }[] = [];
  for (const [key, lesson] of current) {
    const old = previous.get(key);
    if (old?.learnerDigest === lesson.learnerDigest) carriedLessons.push(key);
    else {
      const rows = receipts.filter((row) => `${row.courseId}/${row.lessonId}` === key);
      for (const role of roles)
        if (!rows.some((row) => row.role === role))
          throw new Error(`Missing ${role} receipt: ${key}`);
      const ui = rows.filter((row) => row.role !== 'content');
      for (const field of ['actorId', 'session', 'context', 'originalDigest'] as const) {
        if (new Set(ui.map((row) => row[field])).size !== ui.length)
          throw new Error(`Independent UI ${field} required: ${key}`);
      }
      newlyApprovedLessons.push(key);
    }
    if (old) {
      const scopes = (['exercise', 'navigation', 'persistence'] as const).filter(
        (scope) => old[`${scope}Digest`] !== lesson[`${scope}Digest`],
      );
      if (scopes.length) technicalRechecks.push({ lesson: key, scopes });
    }
  }
  return {
    status: newlyApprovedLessons.length ? ('approved' as const) : ('maintenance' as const),
    carriedLessons,
    newlyApprovedLessons,
    technicalRechecks,
  };
}
