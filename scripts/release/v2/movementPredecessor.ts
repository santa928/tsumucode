import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { AppRecordSchema, parseAppBinding } from './appRecord';
import { BaselineProofSchema, CapturedBaselineSchema, validateCapturedBaseline } from './parent';
import { ArtifactManifestSchema, hashBytes, hashValue } from './identity';
import { ExecutionPlanSchema, createExecutionPlan } from './executionPlan';
import { MovementLearnerAcceptanceSchema } from './learnerMovement';
import { PYTHON_REFERENCE_UPDATE } from './pythonReferenceCarry';
import {
  type BaselineSchema,
  BuildIdentitySchema,
  CommitSchema,
  DigestSchema,
  InventorySchema,
  PlanSchema,
} from './schema';

export const MovementPredecessorSummarySchema = z
  .object({
    stage: z.literal('python-first'),
    sourceCommit: CommitSchema,
    sourceRecordDigest: DigestSchema,
    inventoryDigest: DigestSchema,
    movementDeclarationDigest: DigestSchema,
    qualificationDigest: DigestSchema,
    pythonCourseDigest: DigestSchema,
    movedFixtureCount: z.literal(28),
    replacementIntentCount: z.literal(10),
  })
  .strict();

const HistorySchema = z
  .object({
    proof: BaselineProofSchema,
    tagObject: z
      .string()
      .min(1)
      .max(4 * 1024 * 1024),
    qualification: z.record(z.string(), z.json()),
    bundle: z
      .object({
        snapshot: z
          .object({
            schemaVersion: z.literal(1),
            inventory: InventorySchema,
            plan: PlanSchema,
            publicContent: ArtifactManifestSchema,
            movementInputs: z.unknown(),
          })
          .strict(),
        executionPlan: ExecutionPlanSchema,
        candidate: BuildIdentitySchema,
        capturedBaseline: CapturedBaselineSchema,
      })
      .strict(),
  })
  .strict();
const QualificationHistorySchema = z
  .object({
    schemaVersion: z.literal(1),
    status: z.literal('qualified'),
    candidateDigest: DigestSchema,
    parent: PlanSchema.shape.parent,
    qualifiedAt: z.iso.datetime(),
    technical: z
      .object({
        status: z.literal('technical-passed'),
        candidateDigest: DigestSchema,
        buildAttempt: z.number().int().positive(),
        expiresAt: z.iso.datetime(),
      })
      .loose(),
    content: z
      .object({
        movementLearnerAcceptance: z.union([
          z.array(MovementLearnerAcceptanceSchema).length(2),
          z.array(MovementLearnerAcceptanceSchema).length(4),
        ]),
      })
      .loose(),
  })
  .loose();
const PythonHeaderSchema = z
  .object({
    declaration: z
      .object({
        body: z
          .object({
            stage: z.literal('python-first'),
            candidateContentCommit: CommitSchema,
            pythonReferenceUpdates: z.literal(PYTHON_REFERENCE_UPDATE).optional(),
            baseline: z.object({ sourceRecordDigest: DigestSchema }).loose(),
          })
          .loose(),
      })
      .loose(),
  })
  .loose();

/** 現在の認証baselineに結ぶ1段だけ。過去の技術期限を現資格へ延長しない。 */
export function verifyPythonMovementPredecessor(
  input: unknown,
  baseline: z.infer<typeof BaselineSchema>,
  expectedDigest: string,
  verifyPrior: (
    input: unknown,
    inventory: unknown,
    baseline: unknown,
  ) => { readonly declarationDigest: string },
) {
  const parsed = HistorySchema.safeParse(input);
  if (!parsed.success) throw Error('Python predecessor history is missing or malformed');
  const history = parsed.data;
  if (hashValue(input) !== expectedDigest) throw Error('Python predecessor payload digest differs');
  // proofの自己hashではなく、呼出側の認証済みbaselineのsourceRecordDigestへ一致させる。
  validateCapturedBaseline({ baseline, proof: history.proof });
  if (hashBytes(history.tagObject) !== history.proof.tagDigest)
    throw Error('Python predecessor annotated tag digest differs');
  const tag =
    /^object ([a-f0-9]{40})\ntype commit\ntag ([A-Za-z0-9._-]+)\ntagger [^\n]+\n\n([\s\S]+)$/u.exec(
      history.tagObject,
    );
  const tagSource = tag?.[1];
  const tagName = tag?.[2];
  const message = tag?.[3];
  if (
    tagSource === undefined ||
    tagName === undefined ||
    message === undefined ||
    tagSource !== baseline.sourceCommit ||
    'refs/tags/' + tagName !== history.proof.tag
  )
    throw Error('Python predecessor annotated tag Source differs');
  const record = AppRecordSchema.parse(JSON.parse(message) as unknown);
  parseAppBinding(message, baseline.sourceCommit, {
    repository: history.proof.repository,
    deploymentId: baseline.deploymentId,
    workflowHeadCommit: history.proof.workflowHeadCommit,
    runId: history.proof.runId,
    siteUrl:
      'https://' +
      history.proof.repository.split('/')[0]! +
      '.github.io' +
      record.candidate.recipe.basePath,
  });
  if (record.qualificationDigest !== hashValue(history.qualification))
    throw Error('Python predecessor qualification hash differs');
  const qualification = QualificationHistorySchema.parse(history.qualification);
  const { snapshot, executionPlan, candidate } = history.bundle;
  if (
    record.inventoryDigest !== hashValue(snapshot.inventory) ||
    record.inventoryDigest !== hashValue(baseline.inventory) ||
    record.publicContentDigest !== snapshot.publicContent.digest ||
    record.publicContentDigest !== history.proof.publicContentDigest
  )
    throw Error('Python predecessor inventory or public content digest differs');
  if (
    hashValue(candidate) !== hashValue(record.candidate) ||
    qualification.candidateDigest !== hashValue(candidate) ||
    qualification.technical.candidateDigest !== hashValue(candidate) ||
    qualification.technical.buildAttempt !== candidate.buildAttempt ||
    candidate.buildJobId !== 'build' ||
    candidate.artifactDigest !== baseline.artifactDigest
  )
    throw Error('Python predecessor candidate differs');
  if (
    candidate.planDigest !== hashValue({ plan: snapshot.plan, executionPlan }) ||
    snapshot.plan.inventoryDigest !== record.inventoryDigest ||
    hashValue(executionPlan) !==
      hashValue(
        createExecutionPlan(
          snapshot.plan,
          executionPlan.testManifests,
          hashValue(snapshot.publicContent),
        ),
      )
  )
    throw Error('Python predecessor frozen plan differs');
  if (
    Date.parse(qualification.qualifiedAt) >= Date.parse(qualification.technical.expiresAt) ||
    Date.parse(qualification.qualifiedAt) > Date.parse(record.observedAt) ||
    Date.parse(record.observedAt) > Date.parse(history.proof.observedAt)
  )
    throw Error('Python predecessor historical qualification clock differs');
  const prior = PythonHeaderSchema.safeParse(snapshot.movementInputs);
  if (!prior.success || Object.hasOwn(prior.data, 'predecessor'))
    throw Error('Python predecessor must be one python-first stage without history recursion');
  const captured = validateCapturedBaseline(history.bundle.capturedBaseline);
  const parent = {
    deploymentId: captured.baseline.deploymentId,
    sourceRecordDigest: captured.baseline.sourceRecordDigest,
  };
  if (
    hashValue(snapshot.plan.parent) !== hashValue(parent) ||
    hashValue(qualification.parent) !== hashValue(parent)
  )
    throw Error('Python predecessor original parent differs');
  const checked = verifyPrior(snapshot.movementInputs, snapshot.inventory, captured.baseline);
  if (snapshot.plan.movementDeclarationDigest !== checked.declarationDigest)
    throw Error('Python predecessor declaration differs from frozen plan');
  const expectedCarries = [
    ['python-basics-ch01-l08', 'python-basics-ch01-l12', 'content-delta'],
    ['python-basics-ch01-l09', 'python-basics-ch01-l13', 'identical-move'],
    ...(prior.data.declaration.body.pythonReferenceUpdates
      ? ([
          ['python-basics-ch01-l05', 'python-basics-ch01-l05', 'reference-only'],
          ['python-basics-ch02-l01', 'python-basics-ch02-l01', 'reference-only'],
        ] as const)
      : []),
  ] as const;
  const evidenceRows = qualification.content.movementLearnerAcceptance;
  if (
    evidenceRows.length !== expectedCarries.length ||
    new Set(evidenceRows.map((row) => row.courseId + '/' + row.fromLessonId + '/' + row.toLessonId))
      .size !== expectedCarries.length
  )
    throw Error('Python predecessor fixed learner acceptance coverage differs');
  for (const [fromLessonId, toLessonId, kind] of expectedCarries) {
    const evidence = qualification.content.movementLearnerAcceptance.find(
      (row) =>
        row.courseId === 'python-basics' &&
        row.fromLessonId === fromLessonId &&
        row.toLessonId === toLessonId,
    );
    const oldLesson = captured.baseline.inventory.courses
      .find((course) => course.id === 'python-basics')!
      .lessons.find((lesson) => lesson.id === fromLessonId);
    const lesson = snapshot.inventory.courses
      .find((course) => course.id === 'python-basics')!
      .lessons.find((lesson) => lesson.id === toLessonId);
    if (
      !evidence ||
      evidence.kind !== kind ||
      evidence.movementDeclarationDigest !== checked.declarationDigest ||
      evidence.sourceCommit !== captured.baseline.sourceCommit ||
      evidence.sourceRecordDigest !== prior.data.declaration.body.baseline.sourceRecordDigest ||
      evidence.candidateContentCommit !== prior.data.declaration.body.candidateContentCommit ||
      evidence.fromLearnerDigest !== oldLesson?.learnerDigest ||
      evidence.toLearnerDigest !== lesson?.learnerDigest
    )
      throw Error('Python predecessor qualification did not consume the fixed declaration');
  }
  return MovementPredecessorSummarySchema.parse({
    stage: 'python-first',
    sourceCommit: baseline.sourceCommit,
    sourceRecordDigest: baseline.sourceRecordDigest,
    inventoryDigest: record.inventoryDigest,
    movementDeclarationDigest: checked.declarationDigest,
    qualificationDigest: record.qualificationDigest,
    pythonCourseDigest: hashValue(
      baseline.inventory.courses.find((course) => course.id === 'python-basics'),
    ),
    movedFixtureCount: 28,
    replacementIntentCount: 10,
  });
}

/** 既存metadata/qualification原本をtrusted callerが置く固定private入力。 */
export async function readPythonMovementPredecessor(root: string) {
  const bytes = await readFile(path.join(root, '.release-v2/movement-python-predecessor.json'));
  if (bytes.length > 16 * 1024 * 1024) throw Error('Python predecessor history exceeds limit');
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
}
