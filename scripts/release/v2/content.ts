import { z } from 'zod';
import { CommitSchema, DigestSchema, IdSchema, InventorySchema, BaselineSchema } from './schema';
import type { LessonInventory, ReleaseInventory } from './schema';
import { consumeVerifiedMovement } from './movement';
import { MovementLearnerAcceptanceSchema } from './learnerMovement';
import {
  validateTailwindHistoricalAcceptance,
  type TailwindHistoricalAcceptance,
} from './tailwindHistoricalAcceptance';
import {
  validatePythonHistoricalAcceptance,
  pythonHistoricalSummary,
} from './pythonHistoricalAcceptance';
import { hashValue } from './identity';

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
export const ContentReceiptSchema = ReceiptSchema;
export const ContentWithdrawalSchema = z
  .object({
    courseId: IdSchema,
    lessonId: IdSchema,
    learnerDigest: DigestSchema,
    sourceCommit: CommitSchema,
    reason: z.enum(['approval-withdrawn', 'known-finding']),
  })
  .strict();
export { BaselineSchema } from './schema';
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
  withdrawalsInput: unknown = [],
  historicalInput: unknown = [],
  movementInput?: unknown,
) {
  const inventory = InventorySchema.parse(inventoryInput);
  const receipts = z.array(ReceiptSchema).parse(receiptsInput);
  const withdrawals = z.array(ContentWithdrawalSchema).parse(withdrawalsInput);
  const histories = z
    .array(z.unknown())
    .max(3)
    .parse(historicalInput)
    .map((row) => {
      const course = z.object({ courseId: z.string() }).parse(row).courseId;
      return course === 'python-practice' || course === 'python-oop'
        ? validatePythonHistoricalAcceptance(row)
        : validateTailwindHistoricalAcceptance(row);
    });
  if (new Set(histories.map((row) => row.courseId)).size !== histories.length)
    throw Error('Duplicate historical course');
  const historical = histories.find(
    (row): row is TailwindHistoricalAcceptance => !('receipt' in row),
  );
  const pythonHistories = histories.filter((row) => row.courseId !== 'tailwind');
  const withdrawn = new Set<string>();
  for (const row of withdrawals) {
    const key = row.courseId + '/' + row.lessonId + '/' + row.learnerDigest;
    if (withdrawn.has(key)) throw Error('Duplicate content withdrawal');
    withdrawn.add(key);
  }
  const baseline = baselineInput === undefined ? undefined : BaselineSchema.parse(baselineInput);
  const movement = consumeVerifiedMovement(movementInput, inventory, baseline);
  const current = publishedLessons(inventory);
  const previous = baseline
    ? publishedLessons(baseline.inventory)
    : new Map<string, LessonInventory>();
  for (const history of histories) {
    const course = inventory.courses.find((row) => row.id === history.courseId);
    if (!course || course.publicationStatus !== 'published') continue;
    for (const lesson of history.lessons)
      if (!current.has(history.courseId + '/' + lesson.id))
        throw Error('Historical lesson removed: ' + lesson.id);
    if ('receipt' in history) {
      if (
        course.lessons.length !== history.lessons.length ||
        new Set(course.lessons.map((row) => row.id)).size !== course.lessons.length
      )
        throw Error('Python historical lesson set differs');
      if (withdrawals.some((row) => row.courseId === course.id))
        throw Error('Python historical withdrawal blocks this fixed case');
      for (const lesson of course.lessons) {
        const prior = history.lessons.find((row) => row.id === lesson.id)!;
        if (
          prior.learnerDigest !== lesson.learnerDigest ||
          !lesson.exercises.length ||
          hashValue(lesson.exercises) !== lesson.exerciseDigest
        )
          throw Error('Python historical content or exercise inventory differs');
        if (
          course.id === 'python-oop' &&
          (['exercise', 'navigation', 'persistence'] as const).some(
            (scope) => prior[`${scope}Digest`] !== lesson[`${scope}Digest`],
          )
        )
          throw Error('Python OOP historical fingerprint differs');
      }
    }
  }
  for (const key of previous.keys())
    if (!current.has(key)) throw new Error(`Published lesson removed: ${key}`);
  const receiptKeys = new Set<string>();
  for (const receipt of receipts) {
    const key = `${receipt.courseId}/${receipt.lessonId}`;
    const lesson = current.get(key);
    if (!lesson || lesson.learnerDigest !== receipt.learnerDigest)
      throw new Error(`Stale or unknown content receipt: ${key}`);
    const roleKey = `${key}/${receipt.role}`;
    if (movement?.rechecks.has(key) && receipt.sourceCommit !== movement.candidateContentCommit)
      throw new Error(`Movement requires a fresh candidate-source receipt: ${roleKey}`);
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
  const historicallyAcceptedLessons: string[] = [];
  const technicalRechecks: { lesson: string; scopes: string[] }[] = [];
  const movementLearnerAcceptance: z.infer<typeof MovementLearnerAcceptanceSchema>[] = [];
  for (const [key, lesson] of current) {
    if (withdrawn.has(key + '/' + lesson.learnerDigest))
      throw Error('Explicit content withdrawal blocks publication: ' + key);
    const old = previous.get(key);
    const learnerCarry = movement?.learnerCarries.get(key);
    if (
      learnerCarry &&
      withdrawals.some(
        (row) =>
          row.courseId === learnerCarry.courseId &&
          row.lessonId === learnerCarry.fromLessonId &&
          row.learnerDigest === learnerCarry.fromLearnerDigest,
      )
    )
      throw Error('Explicit historical content withdrawal blocks publication: ' + key);
    const priorAcceptance = histories
      .find((row) => row.courseId === key.split('/')[0])
      ?.lessons.find(({ id }) => id === lesson.id);
    if (learnerCarry) {
      if (learnerCarry.kind === 'content-delta') {
        const content = receipts.find(
          (row) => `${row.courseId}/${row.lessonId}` === key && row.role === 'content',
        );
        if (!content) throw Error('Missing content receipt: ' + key);
        if (content.sourceCommit !== learnerCarry.candidateContentCommit)
          throw Error('Movement requires a fresh candidate-source receipt: ' + key + '/content');
        movementLearnerAcceptance.push(
          MovementLearnerAcceptanceSchema.parse({
            ...learnerCarry,
            contentReceiptDigest: content.receiptDigest,
          }),
        );
      } else movementLearnerAcceptance.push(MovementLearnerAcceptanceSchema.parse(learnerCarry));
    } else if (!movement?.rechecks.has(key) && old?.learnerDigest === lesson.learnerDigest)
      carriedLessons.push(key);
    else if (
      !movement?.rechecks.has(key) &&
      priorAcceptance?.learnerDigest === lesson.learnerDigest
    )
      historicallyAcceptedLessons.push(key);
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
    const prior =
      (learnerCarry
        ? previous.get(learnerCarry.courseId + '/' + learnerCarry.fromLessonId)
        : old) ??
      (priorAcceptance?.learnerDigest === lesson.learnerDigest ? priorAcceptance : undefined);
    if (prior) {
      const scopes = (['exercise', 'navigation', 'persistence'] as const).filter(
        (scope) => prior[`${scope}Digest`] !== lesson[`${scope}Digest`],
      );
      if (scopes.length) technicalRechecks.push({ lesson: key, scopes });
    }
  }
  return {
    status: newlyApprovedLessons.length
      ? ('approved' as const)
      : historicallyAcceptedLessons.length || movementLearnerAcceptance.length
        ? ('historical' as const)
        : ('maintenance' as const),
    carriedLessons,
    newlyApprovedLessons,
    technicalRechecks,
    ...(movementLearnerAcceptance.length ? { movementLearnerAcceptance } : {}),
    ...(movement?.predecessorSummary ? { movementPredecessor: movement.predecessorSummary } : {}),
    ...(historicallyAcceptedLessons.length ? { historicallyAcceptedLessons } : {}),
    ...(pythonHistories.some((history) =>
      historicallyAcceptedLessons.some((key) => key.startsWith(history.courseId + '/')),
    )
      ? {
          pythonHistoricalAcceptances: pythonHistories
            .filter((history) =>
              historicallyAcceptedLessons.some((key) => key.startsWith(history.courseId + '/')),
            )
            .map((history) =>
              pythonHistoricalSummary('receipt' in history ? history.receipt : history),
            ),
        }
      : {}),
    ...(historicallyAcceptedLessons.some((key) => key.startsWith('tailwind/')) && historical
      ? {
          historicalAcceptance: {
            migrationId: historical.migrationId,
            sourceCommit: historical.sourceCommit,
            receiptDigest: historical.receiptDigest,
            uiActorCount: historical.uiObservation.actorCount,
            unverified: historical.unverified,
          },
        }
      : {}),
  };
}
