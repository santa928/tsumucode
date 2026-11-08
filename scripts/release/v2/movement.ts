import { lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ExerciseSchema, ExerciseFileSchema } from '../../../src/core/content/schema';
import { assertActiveExerciseRuntime } from '../../../src/core/content/activeExerciseRuntime';
import type { AuthoringExercise, CompiledCourseArtifacts } from '../../content/compileCourse';
import { builtinFixtureDigests, fixtureFiles, fixtureSourceDigest } from './fixtureSource';
import { hashBytes, hashValue, repositoryEnvironment } from './identity';
import { MOVEMENT_ID, MovementStageSchema, stageMoves, stageRechecks } from './movementStage';
import { verifyPythonMovementPredecessor } from './movementPredecessor';
import { MovementBaselineProofsSchema, resolveMovementBaseline } from './movementBaseline';
import {
  PYTHON_REFERENCE_UPDATE,
  PythonReferenceOriginalsSchema,
  verifyPythonReferenceOriginals,
} from './pythonReferenceCarry';
export { MOVEMENT_ID, PURE_MOVES } from './movementStage';
import {
  compareInitialReactCopyContract,
  LearnerMovementOriginalsSchema,
  verifyLearnerMovement,
} from './learnerMovement';
import {
  BaselineSchema,
  CommitSchema,
  DigestSchema,
  IdSchema,
  InventorySchema,
  type ReleaseInventory,
} from './schema';

const status = z.enum(['pass', 'incomplete', 'code-error', 'system-error']);
const AuthoringFixtureSchema = z
  .object({
    id: IdSchema,
    expectedStatus: status,
    expectedLocalStatus: status.optional(),
    inputLines: z.array(z.string()).optional(),
    faultInjection: z.literal('stale-source-evidence').optional(),
    expectedDiagnosticCodes: z.array(z.string()).optional(),
    files: z.array(ExerciseFileSchema),
    expectedFeedbackRuleIds: z.array(z.string()),
  })
  .strict();

function authoringExercise(input: unknown): AuthoringExercise {
  const value = z
    .object({
      solutionFiles: z.array(ExerciseFileSchema),
      fixtures: z.array(AuthoringFixtureSchema),
    })
    .loose()
    .parse(input);
  const { solutionFiles, fixtures, ...runtime } = value;
  return {
    ...ExerciseSchema.parse(runtime),
    solutionFiles,
    fixtures: fixtures.map((fixture) => ({
      id: fixture.id,
      expectedStatus: fixture.expectedStatus,
      files: fixture.files,
      expectedFeedbackRuleIds: fixture.expectedFeedbackRuleIds,
      ...(fixture.expectedLocalStatus === undefined
        ? {}
        : { expectedLocalStatus: fixture.expectedLocalStatus }),
      ...(fixture.inputLines === undefined ? {} : { inputLines: fixture.inputLines }),
      ...(fixture.faultInjection === undefined ? {} : { faultInjection: fixture.faultInjection }),
      ...(fixture.expectedDiagnosticCodes === undefined
        ? {}
        : { expectedDiagnosticCodes: fixture.expectedDiagnosticCodes }),
    })),
  };
}

function activeAuthoringExercise(input: unknown): AuthoringExercise {
  const exercise = authoringExercise(input);
  assertActiveExerciseRuntime(exercise.runtime);
  return exercise;
}

const INTENTS = [
  'solution',
  'direct-return',
  'commuted-and-renamed',
  'stored-results',
  'starter',
  'constant-return',
  'no-return',
  'unused-function',
  'outer-value',
  'reference-error',
] as const;
const BindingSchema = z
  .object({
    deploymentId: z.string().regex(/^[1-9]\d*$/u),
    sourceCommit: CommitSchema,
    sourceRecordDigest: DigestSchema,
    inventoryDigest: DigestSchema,
  })
  .strict();
const WitnessSchema = z
  .object({
    courseId: z.literal('python-basics'),
    lessonId: IdSchema,
    exerciseId: IdSchema,
    caseKind: z.literal('authored'),
    fixtureId: IdSchema,
    fixtureDigest: DigestSchema,
    modes: z
      .array(
        z
          .object({
            mode: z.enum(['pyodide', 'cpython']),
            sourceDigest: DigestSchema,
            expectedStatus: status,
          })
          .strict(),
      )
      .length(2),
  })
  .strict();
export const MovementBodySchema = z
  .object({
    schemaVersion: z.literal(1),
    migrationId: z.literal(MOVEMENT_ID),
    stage: MovementStageSchema.optional(),
    pythonReferenceUpdates: z.literal(PYTHON_REFERENCE_UPDATE).optional(),
    predecessorDigest: DigestSchema.optional(),
    baseline: BindingSchema,
    candidateContentCommit: CommitSchema,
    candidateInventoryDigest: DigestSchema,
    originalsDigest: DigestSchema,
    moves: z
      .array(
        z.object({ courseId: IdSchema, fromLessonId: IdSchema, toLessonId: IdSchema }).strict(),
      )
      .min(2)
      .max(5),
    references: z.record(IdSchema, IdSchema),
    intents: z
      .array(
        z
          .object({
            oldFixtureId: z.enum(INTENTS),
            oldFixtureDigest: DigestSchema,
            oldExpectedStatus: status,
            preservedIntent: z.array(z.string().trim().min(1)).min(1),
            explicitGoalOrInputDeltas: z.array(z.string().trim().min(1)).min(1),
            witnesses: z.array(WitnessSchema).min(1),
          })
          .strict(),
      )
      .max(10),
    recheckLessons: z.array(z.string().min(1)).min(1),
  })
  .strict()
  .superRefine((body, context) => {
    const stage = body.stage ?? 'joint';
    if (body.pythonReferenceUpdates && stage !== 'python-first')
      context.addIssue({
        code: 'custom',
        message: 'Fixed Python reference updates require python-first stage',
      });
    const expected = stageMoves(stage).map(([courseId, fromLessonId, toLessonId]) => ({
      courseId,
      fromLessonId,
      toLessonId,
    }));
    if (
      hashValue([...body.moves].sort((a, b) => a.fromLessonId.localeCompare(b.fromLessonId))) !==
      hashValue([...expected].sort((a, b) => a.fromLessonId.localeCompare(b.fromLessonId)))
    )
      context.addIssue({
        code: 'custom',
        path: ['moves'],
        message: 'Fixed movement stage coverage differs',
      });
    if (body.intents.length !== (stage === 'react-after-python' ? 0 : 10))
      context.addIssue({
        code: 'custom',
        path: ['intents'],
        message: 'Replacement intent coverage differs',
      });
    if ((stage === 'react-after-python') !== (body.predecessorDigest !== undefined))
      context.addIssue({
        code: 'custom',
        path: ['predecessorDigest'],
        message: 'Python predecessor binding differs from stage',
      });
  });
const ApprovalMetadataSchema = z
  .object({
    schemaVersion: z.literal(1),
    migrationId: z.literal(MOVEMENT_ID),
    bodyDigest: DigestSchema,
    oldFixtureId: z.enum(INTENTS),
    scopeDigest: DigestSchema,
    authorId: z.string().trim().min(1),
    reviewerId: z.string().trim().min(1),
    status: z.literal('approved'),
    method: z.literal('source-review'),
  })
  .strict();
export const MovementApprovalSchema = ApprovalMetadataSchema.extend({
  originalDigest: DigestSchema,
  originalsCheckedBy: z.string().trim().min(1),
  receiptDigest: DigestSchema,
}).strict();
export const MovementDeclarationSchema = z
  .object({
    body: MovementBodySchema,
    bodyDigest: DigestSchema,
    approvals: z.array(MovementApprovalSchema).max(10),
    declarationDigest: DigestSchema,
  })
  .strict()
  .superRefine((declaration, context) => {
    if (declaration.approvals.length !== (declaration.body.stage === 'react-after-python' ? 0 : 10))
      context.addIssue({
        code: 'custom',
        path: ['approvals'],
        message: 'Replacement approvals coverage differs',
      });
  });
const OriginalsSchema = z.array(
  z
    .object({
      courseId: IdSchema,
      exercises: z.array(z.unknown().transform(authoringExercise)),
    })
    .strict(),
);
const ActiveOriginalsSchema = z.array(
  z
    .object({
      courseId: IdSchema,
      exercises: z.array(z.unknown().transform(activeAuthoringExercise)),
    })
    .strict(),
);
export const MovementInputsSchema = z
  .object({
    declaration: MovementDeclarationSchema,
    previous: OriginalsSchema,
    current: ActiveOriginalsSchema,
    learnerOriginals: LearnerMovementOriginalsSchema.optional(),
    pythonReferenceOriginals: PythonReferenceOriginalsSchema.optional(),
    predecessor: z.unknown().optional(),
    baselineProofs: MovementBaselineProofsSchema.optional(),
  })
  .strict()
  .superRefine((inputs, context) => {
    const stage = inputs.declaration.body.stage ?? 'joint';
    if (
      (inputs.declaration.body.pythonReferenceUpdates !== undefined) !==
      (inputs.pythonReferenceOriginals !== undefined)
    )
      context.addIssue({
        code: 'custom',
        message: 'Fixed Python reference marker and originals differ',
      });
    if ((stage === 'react-after-python') !== (inputs.predecessor !== undefined))
      context.addIssue({
        code: 'custom',
        path: ['predecessor'],
        message: 'Python predecessor history differs from stage',
      });
    if (stage !== 'joint' && !inputs.learnerOriginals)
      context.addIssue({
        code: 'custom',
        path: ['learnerOriginals'],
        message: 'Staged movement requires learner originals',
      });
  });
export type MovementInputs = z.infer<typeof MovementInputsSchema>;
type MovementBody = z.infer<typeof MovementBodySchema>;

/** 同一Compileの原本を非公開準備データへ固定し、再構築時にhashと保全条件を再検証する。 */
export function movementOriginals(compilations: readonly CompiledCourseArtifacts[]) {
  return ActiveOriginalsSchema.parse(
    compilations
      .filter((item) => ['python-basics', 'react'].includes(item.runtime.id))
      .map((item) => {
        if (!item.authoringExercises) throw Error('Movement requires compiler authoring originals');
        return { courseId: item.runtime.id, exercises: item.authoringExercises };
      }),
  );
}

function referenceFields(exercise: AuthoringExercise) {
  return [
    exercise.id,
    exercise.workspaceId,
    ...exercise.steps.flatMap((step) => [step.id, ...step.validationRuleIds]),
    ...exercise.validationRules.flatMap((rule) => [rule.id, rule.hintId, rule.relatedSlideId]),
    ...exercise.hints.flatMap((hint) => [
      hint.id,
      ...(hint.relatedSlideId ? [hint.relatedSlideId] : []),
    ]),
    ...exercise.relatedSlideIds,
    ...exercise.fixtures.flatMap((fixture) => fixture.expectedFeedbackRuleIds),
  ];
}

/** 不変の旧原本から型付きID参照だけを一度写像し、実行・採点契約を完全比較する。 */
export function compareMovementExercise(
  originalInput: unknown,
  currentInput: unknown,
  referencesInput: unknown,
): void {
  const original = authoringExercise(originalInput),
    current = activeAuthoringExercise(currentInput);
  const references = z.record(IdSchema, IdSchema).parse(referencesInput);
  const mapped = (id: string) => references[id] ?? id;
  const normalized = {
    ...original,
    id: mapped(original.id),
    workspaceId: mapped(original.workspaceId),
    steps: original.steps.map((step) => ({
      ...step,
      id: mapped(step.id),
      validationRuleIds: step.validationRuleIds.map(mapped),
    })),
    validationRules: original.validationRules.map((rule) => ({
      ...rule,
      id: mapped(rule.id),
      hintId: mapped(rule.hintId),
      relatedSlideId: mapped(rule.relatedSlideId),
    })),
    hints: original.hints.map((hint) => ({
      ...hint,
      id: mapped(hint.id),
      ...(hint.relatedSlideId === undefined ? {} : { relatedSlideId: mapped(hint.relatedSlideId) }),
    })),
    relatedSlideIds: original.relatedSlideIds.map(mapped),
    fixtures: original.fixtures.map((fixture) => ({
      ...fixture,
      expectedFeedbackRuleIds: fixture.expectedFeedbackRuleIds.map(mapped),
    })),
  };
  // 説明文の変更はlearnerDigestと新しいcontent/UI審査へ残す。
  const contract = ({ title, instructions, ...rest }: AuthoringExercise) => {
    void title;
    void instructions;
    return rest;
  };
  if (hashValue(contract(normalized)) !== hashValue(contract(current)))
    throw Error('Movement execution or grading contract differs: ' + original.id);
}

const verified = new WeakMap<
  object,
  {
    inputs: MovementInputs;
    candidateInventoryDigest: string;
    resolved: Set<string>;
    rechecks: Set<string>;
    learnerCarries: ReturnType<typeof verifyLearnerMovement>;
    predecessorSummary: ReturnType<typeof verifyPythonMovementPredecessor> | undefined;
  }
>();
export interface VerifiedMovement {
  readonly declarationDigest: string;
}
function unique(values: readonly string[], scope: string) {
  if (new Set(values).size !== values.length) throw Error('Duplicate movement ' + scope);
}
function lookup(inventory: ReleaseInventory, courseId: string, lessonId: string) {
  const lesson = inventory.courses
    .find((course) => course.id === courseId && course.publicationStatus === 'published')
    ?.lessons.find((lesson) => lesson.id === lessonId);
  if (!lesson) throw Error('Unknown movement lesson: ' + courseId + '/' + lessonId);
  return lesson;
}
function validateOriginals(input: z.infer<typeof OriginalsSchema>, inventory: ReleaseInventory) {
  unique(
    input.map((course) => course.courseId),
    'original course',
  );
  if (input.length !== 2) throw Error('Movement originals course coverage differs');
  const result = new Map<string, AuthoringExercise>();
  for (const courseId of ['python-basics', 'react']) {
    const course = inventory.courses.find((row) => row.id === courseId);
    if (!course) throw Error('Movement inventory course missing');
    const originals = input.find((row) => row.courseId === course.id)?.exercises;
    if (!originals) throw Error('Missing movement original course');
    const expected = course.lessons.flatMap((lesson) => lesson.exercises);
    unique(
      originals.map((row) => row.id),
      'original exercise',
    );
    if (originals.length !== expected.length)
      throw Error('Movement originals exercise coverage differs');
    for (const exercise of expected) {
      const full = originals.find((row) => row.id === exercise.id);
      if (!full || hashValue(full) !== exercise.digest)
        throw Error('Movement original exercise hash differs');
      unique(
        full.fixtures.map((row) => row.id),
        'original fixture',
      );
      if (full.fixtures.length !== exercise.fixtures.length)
        throw Error('Movement original fixture coverage differs');
      const builtins = builtinFixtureDigests(full, exercise.runtimeKind === 'python');
      for (const [key, digest] of Object.entries(builtins))
        if (exercise[key as keyof typeof exercise] !== digest)
          throw Error('Movement built-in input differs');
      for (const fixture of exercise.fixtures) {
        const source = full.fixtures.find((row) => row.id === fixture.id);
        if (
          !source ||
          hashValue(source) !== fixture.digest ||
          source.expectedStatus !== fixture.expectedStatus ||
          fixtureSourceDigest(
            fixtureFiles(full, source.files),
            source.faultInjection,
            source.inputLines,
          ) !== fixture.sourceDigest ||
          (exercise.runtimeKind === 'python' &&
            (fixtureSourceDigest(fixtureFiles(full, source.files)) !== fixture.nativeSourceDigest ||
              (source.expectedLocalStatus ?? source.expectedStatus) !==
                fixture.expectedLocalStatus))
        )
          throw Error('Movement original fixture hash/input/expectation differs');
      }
      result.set(course.id + '/' + full.id, full);
    }
  }
  return result;
}
/** 未署名宣言と旧義務・現witness・差分理由を、個別の独立承認scopeへ固定する。 */
export function movementIntentScope(body: MovementBody, oldFixtureId: string) {
  const intent = body.intents.find((row) => row.oldFixtureId === oldFixtureId);
  if (!intent) throw Error('Unknown replacement intent');
  return hashValue({
    bodyDigest: hashValue(body),
    baseline: body.baseline,
    candidateInventoryDigest: body.candidateInventoryDigest,
    intent,
  });
}

// eb2のPython移行原本を保持したまま、#310で承認済みのJavaScript教材を同梱する固定後続。
const javascriptContinuation = {
  declarationDigest: '4ce18d583429e685ee951def56982bb5c5b292b7e4ad78e162d5ebd2703da494',
  sourceCommit: '637021d43f13064abd4eb0830d0d7cdfa7335eff',
  inventoryDigest: '8fd703f3db5754e38639f7efd5959c78267d9f0236c03360b8eba65ab83eac26',
} as const;

function isJavascriptContinuation(
  declaration: MovementInputs['declaration'],
  inventoryDigest?: string,
) {
  return (
    declaration.declarationDigest === javascriptContinuation.declarationDigest &&
    inventoryDigest === javascriptContinuation.inventoryDigest
  );
}

/** 認証済みbaselineを受け取り、原本保全と個別承認が揃った場合だけ内部検証結果を返す。
 * 承認の真正性は実原本を照合した独立検査者と版管理policyの信頼境界に属し、自己hashで代替しない。 */
export function verifyMovementInputs(
  input: unknown,
  inventoryInput: unknown,
  baselineInput: unknown,
): VerifiedMovement {
  const inputs = MovementInputsSchema.parse(input),
    inventory = InventorySchema.parse(inventoryInput);
  const { declaration } = inputs,
    { body } = declaration;
  const baseline = resolveMovementBaseline(
    body.baseline,
    BaselineSchema.parse(baselineInput),
    inputs.baselineProofs,
  );
  const stage = body.stage ?? 'joint';
  const moves = stageMoves(stage);
  const candidateInventoryDigest = hashValue(inventory);
  if (
    hashValue(body.baseline) !==
      hashValue({
        deploymentId: baseline.deploymentId,
        sourceCommit: baseline.sourceCommit,
        sourceRecordDigest: baseline.sourceRecordDigest,
        inventoryDigest: hashValue(baseline.inventory),
      }) ||
    (body.candidateInventoryDigest !== candidateInventoryDigest &&
      !isJavascriptContinuation(declaration, candidateInventoryDigest))
  )
    throw Error('Movement baseline or candidate differs');
  if (body.candidateContentCommit === baseline.sourceCommit)
    throw Error('Movement requires fresh candidate content source');
  if (
    body.originalsDigest !==
    hashValue({
      previous: inputs.previous,
      current: inputs.current,
      ...(inputs.learnerOriginals ? { learnerOriginals: inputs.learnerOriginals } : {}),
      ...(inputs.pythonReferenceOriginals
        ? { pythonReferenceOriginals: inputs.pythonReferenceOriginals }
        : {}),
    })
  )
    throw Error('Movement original payload digest differs');
  if (
    declaration.bodyDigest !== hashValue(body) ||
    declaration.declarationDigest !==
      hashValue({ body, bodyDigest: declaration.bodyDigest, approvals: declaration.approvals })
  )
    throw Error('Movement declaration digest differs');
  if (stage !== 'joint') {
    const untouched = stage === 'python-first' ? 'react' : 'python-basics';
    const old = baseline.inventory.courses.find((course) => course.id === untouched);
    const current = inventory.courses.find((course) => course.id === untouched);
    if (!old || !current || hashValue(old) !== hashValue(current))
      throw Error('Unconsumed movement course differs: ' + untouched);
  }
  const predecessorSummary =
    stage === 'react-after-python'
      ? verifyPythonMovementPredecessor(
          inputs.predecessor,
          baseline,
          body.predecessorDigest!,
          verifyMovementInputs,
        )
      : undefined;
  const oldOriginals = validateOriginals(inputs.previous, baseline.inventory),
    currentOriginals = validateOriginals(inputs.current, inventory);
  const resolved = new Set<string>(),
    consumedDestinations = new Set<string>();
  const expectedReferences: Record<string, string> = {};
  unique(
    body.moves.map((row) => row.courseId + '/' + row.fromLessonId),
    'move',
  );
  for (const [courseId, fromLessonId, toLessonId, fixtureCount] of moves) {
    if (
      !body.moves.some(
        (row) =>
          row.courseId === courseId &&
          row.fromLessonId === fromLessonId &&
          row.toLessonId === toLessonId,
      )
    )
      throw Error('Missing or extra fixed movement');
    const old = lookup(baseline.inventory, courseId, fromLessonId),
      current = lookup(inventory, courseId, toLessonId);
    if (
      old.exercises.flatMap((exercise) => exercise.fixtures).length !== fixtureCount ||
      old.exercises.length !== current.exercises.length
    )
      throw Error('Movement one-to-one obligation coverage differs');
    for (const exercise of old.exercises) {
      if (!exercise.id.startsWith(fromLessonId + '-'))
        throw Error('Unexpected movement exercise identity');
      const targetId = toLessonId + exercise.id.slice(fromLessonId.length);
      const target = current.exercises.find((row) => row.id === targetId);
      const oldFull = oldOriginals.get(courseId + '/' + exercise.id),
        targetFull = currentOriginals.get(courseId + '/' + targetId);
      if (!target || !oldFull || !targetFull || consumedDestinations.has(courseId + '/' + targetId))
        throw Error('Movement target missing or consumed twice');
      consumedDestinations.add(courseId + '/' + targetId);
      for (const id of referenceFields(oldFull)) {
        if (id === fromLessonId || id.startsWith(fromLessonId + '-'))
          expectedReferences[id] = toLessonId + id.slice(fromLessonId.length);
      }
      if (
        exercise.runtimeKind !== target.runtimeKind ||
        exercise.profile !== target.profile ||
        exercise.capability !== target.capability
      )
        throw Error('Movement runtime contract differs');
      resolved.add(courseId + '/' + fromLessonId + '/' + exercise.id);
    }
  }
  if (hashValue(body.references) !== hashValue(expectedReferences))
    throw Error('Movement declared reference mapping differs');
  for (const [courseId, fromLessonId, toLessonId] of moves)
    for (const exercise of lookup(baseline.inventory, courseId, fromLessonId).exercises)
      compareMovementExercise(
        oldOriginals.get(courseId + '/' + exercise.id),
        currentOriginals.get(courseId + '/' + toLessonId + exercise.id.slice(fromLessonId.length)),
        body.references,
      );
  if (stage !== 'react-after-python') {
    const oldLesson = lookup(baseline.inventory, 'python-basics', 'python-basics-ch01-l07');
    if (
      oldLesson.exercises.length !== 1 ||
      oldLesson.exercises[0]?.id !== 'python-basics-ch01-l07-e01'
    )
      throw Error('Unexpected function replacement exercise');
    const oldExercise = oldLesson.exercises[0];
    if (oldExercise.fixtures.length !== INTENTS.length)
      throw Error('Replacement old obligation coverage differs');
    unique(
      body.intents.map((row) => row.oldFixtureId),
      'replacement intent',
    );
    unique(
      declaration.approvals.map((row) => row.oldFixtureId),
      'replacement approval',
    );
    for (const id of INTENTS) {
      const intent = body.intents.find((row) => row.oldFixtureId === id),
        fixture = oldExercise.fixtures.find((row) => row.id === id);
      if (
        !intent ||
        !fixture ||
        intent.oldFixtureDigest !== fixture.digest ||
        intent.oldExpectedStatus !== fixture.expectedStatus
      )
        throw Error('Replacement old intent differs');
      unique(
        intent.witnesses.map(
          (row) =>
            row.courseId +
            '/' +
            row.lessonId +
            '/' +
            row.exerciseId +
            '/' +
            row.caseKind +
            '/' +
            row.fixtureId,
        ),
        'replacement witness',
      );
      for (const witness of intent.witnesses) {
        if (!/^python-basics-ch01-l(?:07|08|09|10|11)$/u.test(witness.lessonId))
          throw Error('Replacement witness outside approved new goals');
        const exercise = lookup(inventory, witness.courseId, witness.lessonId).exercises.find(
            (row) => row.id === witness.exerciseId,
          ),
          current = exercise?.fixtures.find((row) => row.id === witness.fixtureId);
        if (
          !exercise ||
          exercise.runtimeKind !== 'python' ||
          !current ||
          current.digest !== witness.fixtureDigest
        )
          throw Error('Stale replacement authored witness');
        unique(
          witness.modes.map((row) => row.mode),
          'replacement mode',
        );
        for (const mode of witness.modes) {
          const expected =
            mode.mode === 'cpython'
              ? (current.expectedLocalStatus ?? current.expectedStatus)
              : current.expectedStatus;
          const oldExpected =
            mode.mode === 'cpython'
              ? (fixture.expectedLocalStatus ?? fixture.expectedStatus)
              : fixture.expectedStatus;
          const digest =
            mode.mode === 'cpython' ? current.nativeSourceDigest : current.sourceDigest;
          if (
            mode.sourceDigest !== digest ||
            mode.expectedStatus !== expected ||
            (oldExpected !== 'pass' && expected === 'pass')
          )
            throw Error('Replacement witness input/expectation differs or weakens negative intent');
        }
      }
      // 旧正例の正当性を、各modeで少なくとも1つの現正例へ保全する。
      for (const mode of ['pyodide', 'cpython'] as const) {
        const oldExpected =
          mode === 'cpython'
            ? (fixture.expectedLocalStatus ?? fixture.expectedStatus)
            : fixture.expectedStatus;
        if (
          oldExpected === 'pass' &&
          !intent.witnesses.some((witness) =>
            witness.modes.some((row) => row.mode === mode && row.expectedStatus === 'pass'),
          )
        )
          throw Error('Replacement positive intent requires pass witness: ' + id + '/' + mode);
      }
      const approval = declaration.approvals.find((row) => row.oldFixtureId === id);
      if (!approval) throw Error('Missing independent replacement approval');
      const { receiptDigest, ...unsigned } = approval;
      if (
        receiptDigest !== hashValue(unsigned) ||
        approval.bodyDigest !== declaration.bodyDigest ||
        approval.scopeDigest !== movementIntentScope(body, id) ||
        new Set([approval.authorId, approval.reviewerId, approval.originalsCheckedBy]).size !== 3
      )
        throw Error('Independent replacement approval scope or digest differs');
    }
    resolved.add('python-basics/python-basics-ch01-l07/' + oldExercise.id);
  }
  unique(body.recheckLessons, 'new goal');
  if (hashValue([...body.recheckLessons].sort()) !== hashValue(stageRechecks(stage).sort()))
    throw Error('Movement new-goal review coverage differs');
  for (const key of body.recheckLessons) {
    const [courseId, lessonId] = key.split('/');
    lookup(inventory, courseId!, lessonId!);
  }
  const result = Object.freeze({ declarationDigest: declaration.declarationDigest });
  const learnerCarries = verifyLearnerMovement(
    inputs.learnerOriginals,
    inventory,
    baseline,
    body.candidateContentCommit,
    declaration.declarationDigest,
    moves,
  );
  if (inputs.pythonReferenceOriginals) {
    for (const [key, carry] of verifyPythonReferenceOriginals(
      inputs.pythonReferenceOriginals,
      inventory,
      baseline,
      body.candidateContentCommit,
      declaration.declarationDigest,
    ))
      learnerCarries.set(key, carry);
  }
  if (inputs.learnerOriginals && stage !== 'python-first') {
    const oldInitial = oldOriginals.get('react/react-ch01-l01-e01');
    const currentInitial = currentOriginals.get('react/react-ch01-l01-e01');
    if (!oldInitial || !currentInitial) throw Error('Missing initial React learner contract');
    compareInitialReactCopyContract(oldInitial, currentInitial);
  }
  verified.set(result, {
    inputs,
    candidateInventoryDigest,
    resolved,
    rechecks: new Set(body.recheckLessons),
    learnerCarries,
    predecessorSummary,
  });
  return result;
}

/** 任意JSONの承認自己申告を拒否し、呼出側のbaseline/candidateに対する検証を繰り返す。 */
export function consumeVerifiedMovement(
  input: unknown,
  inventory: ReleaseInventory,
  baselineInput: unknown,
) {
  if (input === undefined) return undefined;
  if (typeof input !== 'object' || input === null || !verified.has(input))
    throw Error('Movement requires validated original inputs and independent approvals');
  const saved = verified.get(input)!;
  // 検証済みobjectでも別の親・候補への流用を認めない。
  const result = verifyMovementInputs(saved.inputs, inventory, baselineInput);
  const current = verified.get(result)!;
  if (saved.candidateInventoryDigest !== current.candidateInventoryDigest)
    throw Error('Movement baseline or candidate differs');
  return {
    ...current,
    declarationDigest: result.declarationDigest,
    candidateContentCommit: saved.inputs.declaration.body.candidateContentCommit,
  };
}

/** private-rootの実ファイルと独立性を検査し、宣言の自己申告から承認を生成しない。 */
export async function inspectMovementReplacementOriginal(
  privateRoot: string,
  referenceInput: unknown,
  metadataInput: unknown,
  inspectorInput: string,
) {
  const reference = z
    .object({
      path: z.string().min(1),
      sha256: DigestSchema,
      bytes: z
        .number()
        .int()
        .positive()
        .max(4 * 1024 * 1024),
    })
    .strict()
    .parse(referenceInput);
  const metadata = ApprovalMetadataSchema.parse(metadataInput),
    inspector = z.string().trim().min(1).parse(inspectorInput);
  if (new Set([metadata.authorId, metadata.reviewerId, inspector]).size !== 3)
    throw Error('Independent movement original inspector required');
  const root = await realpath(privateRoot),
    file = path.resolve(root, reference.path);
  if (
    path.isAbsolute(reference.path) ||
    !file.startsWith(root + path.sep) ||
    (await realpath(file)) !== file ||
    !(await lstat(file)).isFile()
  )
    throw Error('Movement original must be an ordinary private-root file');
  const bytes = await readFile(file);
  if (
    bytes.length !== reference.bytes ||
    bytes.length > 4 * 1024 * 1024 ||
    hashBytes(bytes) !== reference.sha256
  )
    throw Error('Movement original bytes or digest differs');
  const original = ApprovalMetadataSchema.extend({
    observationKind: z.literal('independent-movement-replacement-observation'),
    unresolvedCritical: z.literal(0),
    unresolvedImportant: z.literal(0),
    requiredUnconfirmed: z.literal(0),
    privateNotes: z.string().optional(),
  })
    .strict()
    .parse(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown);
  const {
    observationKind,
    unresolvedCritical,
    unresolvedImportant,
    requiredUnconfirmed,
    privateNotes,
    ...actual
  } = original;
  void observationKind;
  void unresolvedCritical;
  void unresolvedImportant;
  void requiredUnconfirmed;
  void privateNotes;
  if (hashValue(actual) !== hashValue(metadata)) throw Error('Movement original scope differs');
  const unsigned = { ...metadata, originalDigest: reference.sha256, originalsCheckedBy: inspector };
  return MovementApprovalSchema.parse({ ...unsigned, receiptDigest: hashValue(unsigned) });
}

/** 固定policyが存在する場合だけ読み、未指定時の既存の厳格な挙動を維持する。 */
export async function readMovementDeclaration(root: string, inventoryDigest?: string) {
  let bytes: string | undefined;
  for (const file of ['docs/quality/movement-eb2-v2.json', 'docs/quality/movement-v2.json']) {
    try {
      bytes = await readFile(path.join(root, file), 'utf8');
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  if (bytes === undefined) return undefined;
  if (Buffer.byteLength(bytes) > 4 * 1024 * 1024) throw Error('Movement declaration exceeds limit');
  const declaration = MovementDeclarationSchema.parse(JSON.parse(bytes) as unknown);
  const continuation = isJavascriptContinuation(declaration, inventoryDigest);
  const sourceCommit = continuation
    ? javascriptContinuation.sourceCommit
    : declaration.body.candidateContentCommit;
  const receiptPath = 'docs/quality/content-v2-receipts.json';
  const sources = continuation ? ['content', receiptPath] : ['content'];
  const git = promisify(execFile);
  const options = { cwd: root, env: await repositoryEnvironment(root), encoding: 'utf8' as const };
  // 審査記録より前の教材原本commitと現HEADのcontent treeを比較する。
  // 固定後続では#310の全教材treeに加え、同梱した8件を含むreceipt台帳も固定する。
  await git('git', ['diff', '--quiet', sourceCommit, 'HEAD', '--', ...sources], options);
  if (continuation) {
    const { stdout } = await git(
      'git',
      ['status', '--porcelain', '--untracked-files=all', '--', ...sources],
      options,
    );
    if (stdout) throw Error('Movement continuation has dirty content or receipts');
    const { stdout: receiptBlob } = await git('git', ['show', `${sourceCommit}:${receiptPath}`], {
      ...options,
      encoding: 'buffer',
    });
    if (!receiptBlob.equals(await readFile(path.join(root, receiptPath))))
      throw Error('Movement continuation receipt bytes differ');
  }
  return declaration;
}
