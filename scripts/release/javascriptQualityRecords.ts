import { z } from 'zod';
import { CommitShaSchema, RevisionSchema, Sha256Schema } from './releaseSchema';
import {
  JavascriptInputManifestSchema,
  compareJavascriptLearningInputs,
} from './javascriptInputHashes';

const TextSchema = z.string().trim().min(1);
const DraftCommitSchema = z.union([CommitShaSchema, z.literal('draft')]);
const DraftHashSchema = z.union([Sha256Schema, z.literal('draft')]);
const RoleIdSchema = z.enum(['JS-A', 'JS-B', 'JS-C']);
const TimestampSchema = z.iso.datetime({ offset: true });
const OutcomeSchema = z.enum(['pending', 'passed']);

/** 公開前の既存Docker候補だけを表す。公開済みHTTPS URLを候補観測へ混ぜない。 */
export const JavascriptCandidatePageUrlSchema = z.string().superRefine((value, context) => {
  try {
    const url = new URL(value);
    if (
      url.protocol !== 'http:' ||
      url.hostname !== '127.0.0.1' ||
      !url.port ||
      Number(url.port) < 1024 ||
      Number(url.port) > 65535 ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !/^\/(?:[A-Za-z0-9_-]+\/)*$/u.test(url.pathname) ||
      url.href !== value
    )
      throw new Error('invalid');
  } catch {
    context.addIssue({
      code: 'custom',
      message: '候補URLは固定loopback HTTPのorigin/basePathだけを指定してください',
    });
  }
});

/** rootの固定候補観測へrun/実URL/source/D/config/helper/原証拠を結合する。実承認の生成ではない。 */
export const JavascriptCandidateObservationSchema = z
  .object({
    observationKind: z.literal('local-static-candidate'),
    phase: z.enum(['draft-learning', 'final-candidate']),
    runId: TextSchema,
    sourceCommit: CommitShaSchema,
    canonicalDistSha256: Sha256Schema,
    pageUrl: JavascriptCandidatePageUrlSchema,
    sourceTreeSha256: Sha256Schema,
    helperDistTreeSha256: Sha256Schema,
    manifestSha256: Sha256Schema,
    configSha256: Sha256Schema,
    helperSha256: Sha256Schema,
    observedBy: TextSchema,
    observedAt: TimestampSchema,
    rootObservationEvidenceSha256: Sha256Schema,
  })
  .strict();
export type JavascriptCandidateObservation = z.infer<typeof JavascriptCandidateObservationSchema>;
const BindingShape = {
  schemaVersion: z.literal(2),
  courseId: z.literal('javascript'),
  releaseStatus: z.enum(['draft', 'approved']),
  verifiedSourceCommit: DraftCommitSchema,
  canonicalDistSha256: DraftHashSchema,
};
const FindingsShape = {
  unresolvedCritical: z.number().int().nonnegative(),
  unresolvedImportant: z.number().int().nonnegative(),
  requiredUnconfirmed: z.number().int().nonnegative(),
};

/** 原本はprivateに保持し、公開記録には解答/path/秘密値を含まない参照IDとdigestだけを記す。 */
export const JavascriptOperationEvidenceSchema = z
  .object({
    evidenceId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/u),
    kind: z.enum(['screenshot', 'dom', 'log', 'download', 'report']),
    sha256: Sha256Schema,
    bytes: z.number().int().positive(),
  })
  .strict();
const OperationSchema = z
  .object({
    operationId: TextSchema,
    intentAt: TimestampSchema,
    completedAt: TimestampSchema,
    expected: TextSchema,
    actual: TextSchema,
    status: OutcomeSchema,
    evidence: z.array(JavascriptOperationEvidenceSchema).min(1),
  })
  .strict()
  .refine(
    ({ intentAt, completedAt }) => Date.parse(intentAt) <= Date.parse(completedAt),
    '期待/操作intentは実際の観測以前に記録してください',
  );

export const JAVASCRIPT_REQUIRED_JOURNEYS = [
  'hint-repair',
  'reload-resume',
  'reset-cancel-confirm-edit',
  'guided-invalidation-history',
  'capstone-separate-workspace',
  'export-fresh-import-resume',
  'keyboard-mobile-reading',
] as const;
export const JAVASCRIPT_FINAL_SMOKES = [
  'home-entry',
  'path-entry',
  'library-entry',
  'direct-start',
  'saved-resume',
] as const;

const ExerciseObservationSchema = z
  .object({
    exerciseId: TextSchema,
    completionRequirement: z.enum(['required', 'optional']),
    gradingResult: z.enum(['pending', 'pass']),
    operation: OperationSchema,
    passedRequirementIds: z.array(TextSchema),
    executedScenarioIds: z.array(TextSchema),
  })
  .strict();
const LessonObservationSchema = z
  .object({
    lessonId: TextSchema,
    sourceHash: Sha256Schema,
    lessonKind: z.enum(['standard', 'guided-project', 'capstone']),
    currentComplete: z.boolean(),
    reading: OperationSchema,
    exercises: z.array(ExerciseObservationSchema),
  })
  .strict();
const ActorIdentitySchema = z
  .object({
    actorId: TextSchema,
    sessionId: TextSchema,
    browserContextId: TextSchema,
    storageNamespace: TextSchema,
    freshImportContextId: TextSchema,
    model: z.literal('gpt-6.1-sol'),
    reasoningEffort: z.enum(['high', 'xhigh', 'max', 'ultra']),
    startedEmpty: z.boolean(),
    copiedState: z.boolean(),
    solutionImplementationFixturePeekBeforeFirstAttempt: z.boolean(),
    otherActorReportPeekBeforeCompletion: z.boolean(),
    injectedPassingState: z.boolean(),
  })
  .strict();
const RoleObservationSchema = z
  .object({
    roleId: RoleIdSchema,
    persona: TextSchema,
    identity: ActorIdentitySchema,
    startedAt: TimestampSchema,
    completedAt: TimestampSchema,
    browser: TextSchema,
    viewport: z
      .object({ width: z.number().int().positive(), height: z.number().int().positive() })
      .strict(),
    pageUrl: JavascriptCandidatePageUrlSchema,
    candidateRunId: TextSchema,
    originalReport: JavascriptOperationEvidenceSchema.extend({
      kind: z.literal('report'),
    }).strict(),
    lessons: z.array(LessonObservationSchema),
    journeys: z.array(
      z
        .object({ journeyId: z.enum(JAVASCRIPT_REQUIRED_JOURNEYS), operation: OperationSchema })
        .strict(),
    ),
    finalSmokes: z.array(
      z
        .object({
          smokeId: z.enum(JAVASCRIPT_FINAL_SMOKES),
          sourceCommit: CommitShaSchema,
          canonicalDistSha256: Sha256Schema,
          pageUrl: JavascriptCandidatePageUrlSchema,
          candidateRunId: TextSchema,
          operation: OperationSchema,
        })
        .strict(),
    ),
    ...FindingsShape,
  })
  .strict()
  .refine(
    ({ startedAt, completedAt }) => Date.parse(startedAt) <= Date.parse(completedAt),
    '役の開始/終了時刻が逆転しています',
  );

export const JavascriptAgentLearningRecordSchema = z
  .object({
    ...BindingShape,
    evaluationKind: z.literal('agent-simulated-learning'),
    previousAcceptance: z.literal('one-real-javascript-beginner-entire-course'),
    replacementAcceptance: z.literal(
      'three-independent-agents-each-entire-52-lessons-all-54-exercises',
    ),
    authorizationReference: TextSchema,
    replacementReason: TextSchema,
    limits: z
      .object({
        realHumanNovice: z.literal('not-demonstrated'),
        naturalMisunderstandingFrequency: z.literal('not-demonstrated'),
        physicalDevice: z.literal('not-demonstrated'),
      })
      .strict(),
    draftSourceCommit: DraftCommitSchema,
    draftCanonicalDistSha256: DraftHashSchema,
    draftCourseRevision: z.union([RevisionSchema, z.literal('draft')]),
    draftNormalizedInputSha256: DraftHashSchema,
    completionRequiredExerciseCount: z.literal(52),
    optionalExerciseCount: z.literal(2),
    evaluatedExerciseCountPerRole: z.literal(54),
    roles: z.array(RoleObservationSchema),
    independentOriginalEvidenceReview: z
      .object({
        reviewerId: TextSchema,
        reviewedAt: z.union([TimestampSchema, z.literal('draft')]),
        status: OutcomeSchema,
        originalDigestsVerified: z.boolean(),
        identitiesAndFreshStatesVerified: z.boolean(),
        intentActualEvidenceVerified: z.boolean(),
        candidateRootObservationDigestsVerified: z.boolean(),
        candidateObservations: z.array(
          z
            .object({
              phase: z.enum(['draft-learning', 'final-candidate']),
              runId: TextSchema,
              sha256: Sha256Schema,
            })
            .strict(),
        ),
        roleReports: z.array(z.object({ roleId: RoleIdSchema, sha256: Sha256Schema }).strict()),
      })
      .strict(),
  })
  .strict();
export type JavascriptAgentLearningRecord = z.infer<typeof JavascriptAgentLearningRecordSchema>;

export const JavascriptInputValidityRecordSchema = z
  .object({
    ...BindingShape,
    status: OutcomeSchema,
    draftCanonicalDistSha256: DraftHashSchema,
    draftInput: JavascriptInputManifestSchema,
    finalInput: JavascriptInputManifestSchema,
    draftCandidate: JavascriptCandidateObservationSchema,
    finalCandidate: JavascriptCandidateObservationSchema,
    metadataChanges: z.array(
      z.enum(['content/javascript/course.yaml', 'content/learning-paths/frontend.yaml']),
    ),
    affectedRevalidation: z.literal('not-needed-identical-normalized-learning-input'),
    artifactIdentity: z.literal('draft-and-final-separately-bound'),
    verifiedBy: TextSchema,
    verifiedAt: z.union([TimestampSchema, z.literal('draft')]),
  })
  .strict();
export type JavascriptInputValidityRecord = z.infer<typeof JavascriptInputValidityRecordSchema>;

export const JavascriptVisualReviewRecordSchema = z
  .object({
    ...BindingShape,
    finalArtifactReviewed: z.boolean(),
    reviewedScreens: z.array(
      z
        .object({
          screenId: TextSchema,
          viewport: z
            .object({ width: z.number().int().positive(), height: z.number().int().positive() })
            .strict(),
          reviewedBy: TextSchema,
          operation: OperationSchema,
        })
        .strict(),
    ),
    requiredScreenIds: z.array(TextSchema),
    ...FindingsShape,
  })
  .strict();
export const JavascriptAccessibilityRecordSchema = z
  .object({
    ...BindingShape,
    voiceOverStatus: z.literal('not-required'),
    journeys: z.array(z.object({ journeyId: TextSchema, operation: OperationSchema }).strict()),
    requiredJourneyIds: z.array(TextSchema),
    unperformedChecks: z.number().int().nonnegative(),
    ...FindingsShape,
  })
  .strict();
export const JavascriptReleaseChecklistSchema = z
  .object({
    ...BindingShape,
    checklistScope: z.literal('pre-deploy'),
    postDeployVerificationPolicy: z.literal('revision-record'),
    automatedGatesStatus: OutcomeSchema,
    manualGatesStatus: OutcomeSchema,
    pendingItems: z.number().int().nonnegative(),
    failedItems: z.number().int().nonnegative(),
    allSiteQualityScope: z.literal('unchanged'),
    thresholds: z.literal('unchanged'),
    htmlHumanAcceptance: z.literal('separate-not-substituted'),
    ...FindingsShape,
  })
  .strict();
export const JavascriptFinalCodeReviewSchema = z
  .object({
    ...BindingShape,
    baseCommit: DraftCommitSchema,
    productTreeSha256: DraftHashSchema,
    implementerIds: z.array(TextSchema).min(1),
    reviewerId: TextSchema,
    reviewedAt: z.union([TimestampSchema, z.literal('draft')]),
    status: OutcomeSchema,
    originalReview: JavascriptOperationEvidenceSchema.extend({
      kind: z.literal('report'),
    }).strict(),
    ...FindingsShape,
  })
  .strict();

export interface JavascriptLearningExpectations {
  readonly sourceCommit: string;
  readonly canonicalDistSha256: string;
  readonly revision: string;
  readonly normalizedInputSha256: string;
  readonly draftCandidate: JavascriptCandidateObservation;
  readonly finalCandidate: JavascriptCandidateObservation;
  readonly lessons: readonly {
    readonly lessonId: string;
    readonly sourceHash: string;
    readonly lessonKind: 'standard' | 'guided-project' | 'capstone';
    readonly exercises: readonly {
      readonly exerciseId: string;
      readonly completionRequirement: 'required' | 'optional';
      readonly requiredRequirementIds: readonly string[];
      readonly scenarioIds: readonly string[];
    }[];
  }[];
}

/** 数だけの承認、重複での数合わせ、分担合算を拒否する。順序付き集合には順序も要求する。 */
function exactIds(
  name: string,
  actual: readonly string[],
  expected: readonly string[],
  ordered = false,
): void {
  if (
    new Set(actual).size !== actual.length ||
    actual.length !== expected.length ||
    actual.some((id, index) => (ordered ? id !== expected[index] : !expected.includes(id)))
  ) {
    throw new Error(`${name}のexact ID集合/順序が一致しません`);
  }
}

/** 必須未確認とblockingをゼロに固定する。Minorの原報告は別原本に保持する。 */
function noBlocking(
  name: string,
  value: {
    readonly unresolvedCritical: number;
    readonly unresolvedImportant: number;
    readonly requiredUnconfirmed: number;
  },
): void {
  if (
    value.unresolvedCritical !== 0 ||
    value.unresolvedImportant !== 0 ||
    value.requiredUnconfirmed !== 0
  ) {
    throw new Error(`${name}にblockingまたは必須未確認が残っています`);
  }
}

/** 自己申告の個数ではなく、各役の52読解/54採点/横断操作と原本照合承認を検査する。 */
export function validateJavascriptAgentLearning(
  input: unknown,
  expected: JavascriptLearningExpectations,
): JavascriptAgentLearningRecord {
  const record = JavascriptAgentLearningRecordSchema.parse(input);
  const draftCandidate = JavascriptCandidateObservationSchema.parse(expected.draftCandidate);
  const finalCandidate = JavascriptCandidateObservationSchema.parse(expected.finalCandidate);
  if (
    record.releaseStatus !== 'approved' ||
    record.verifiedSourceCommit !== expected.sourceCommit ||
    record.canonicalDistSha256 !== expected.canonicalDistSha256 ||
    record.draftSourceCommit === 'draft' ||
    record.draftCanonicalDistSha256 === 'draft' ||
    record.draftCourseRevision !== expected.revision ||
    record.draftNormalizedInputSha256 !== expected.normalizedInputSha256 ||
    draftCandidate.phase !== 'draft-learning' ||
    finalCandidate.phase !== 'final-candidate' ||
    draftCandidate.runId === finalCandidate.runId ||
    draftCandidate.sourceCommit !== record.draftSourceCommit ||
    draftCandidate.canonicalDistSha256 !== record.draftCanonicalDistSha256 ||
    finalCandidate.sourceCommit !== expected.sourceCommit ||
    finalCandidate.canonicalDistSha256 !== expected.canonicalDistSha256
  ) {
    throw new Error('JS模擬学習のsource/draft/final/input bindingが承認値と一致しません');
  }
  exactIds(
    'roles',
    record.roles.map(({ roleId }) => roleId),
    ['JS-A', 'JS-B', 'JS-C'],
  );
  if (new Set(record.roles.map(({ originalReport }) => originalReport.sha256)).size !== 3) {
    throw new Error('3役の別原reportが同じdigestへ集約されています');
  }
  if (expected.lessons.length !== 52) throw new Error('実教材が52 Lessonではありません');
  const allExercises = expected.lessons.flatMap(({ exercises }) => exercises);
  exactIds(
    '実教材Exercise',
    allExercises.map(({ exerciseId }) => exerciseId),
    [...new Set(allExercises.map(({ exerciseId }) => exerciseId))],
  );
  if (
    allExercises.length !== 54 ||
    allExercises.filter(({ completionRequirement }) => completionRequirement === 'required')
      .length !== 52
  )
    throw new Error('実教材の52必須/任意2が不一致です');
  exactIds(
    '任意Exercise',
    allExercises
      .filter(({ completionRequirement }) => completionRequirement === 'optional')
      .map(({ exerciseId }) => exerciseId),
    ['javascript-ch03-l05-e02', 'javascript-ch03-l05-e03'],
  );
  for (const key of [
    'actorId',
    'sessionId',
    'browserContextId',
    'storageNamespace',
    'freshImportContextId',
  ] as const) {
    const identities = record.roles.map(({ identity }) => identity[key]);
    if (new Set(identities).size !== 3) throw new Error(`独立役の${key}が重複しています`);
  }
  const contexts = record.roles.flatMap(({ identity }) => [
    identity.browserContextId,
    identity.freshImportContextId,
  ]);
  if (
    Date.parse(finalCandidate.observedAt) <
    Math.max(...record.roles.map(({ completedAt }) => Date.parse(completedAt)))
  )
    throw new Error('最終候補P観測が3役のS学習完了より前です');
  if (new Set(contexts).size !== 6)
    throw new Error('paired fresh import contextが独立していません');
  const globalOperationIds = new Set<string>();
  const globalEvidence = new Map<string, string>();
  const checkOperation = (operation: z.infer<typeof OperationSchema>): void => {
    if (operation.status !== 'passed' || globalOperationIds.has(operation.operationId)) {
      throw new Error('未観測/重複operationを完了へ数えられません');
    }
    globalOperationIds.add(operation.operationId);
    for (const evidence of operation.evidence) {
      const previous = globalEvidence.get(evidence.evidenceId);
      if (previous !== undefined && previous !== evidence.sha256)
        throw new Error('同じevidence IDのdigestが異なります');
      globalEvidence.set(evidence.evidenceId, evidence.sha256);
    }
    if (
      !operation.evidence.some(({ kind }) => kind === 'screenshot' || kind === 'dom') ||
      !operation.evidence.some(({ kind }) => kind === 'log')
    )
      throw new Error('操作には画像/DOMと原logが必要です');
  };
  for (const role of record.roles) {
    if (
      role.pageUrl !== draftCandidate.pageUrl ||
      role.candidateRunId !== draftCandidate.runId ||
      Date.parse(role.startedAt) < Date.parse(draftCandidate.observedAt)
    )
      throw new Error('draft学習がroot観測S/Ddraft/local URL/runと一致しません');
    noBlocking(role.roleId, role);
    const identity = role.identity;
    if (
      !identity.startedEmpty ||
      identity.copiedState ||
      identity.injectedPassingState ||
      identity.solutionImplementationFixturePeekBeforeFirstAttempt ||
      identity.otherActorReportPeekBeforeCompletion
    )
      throw new Error(`${role.roleId}の独立/先読み禁止条件が未達です`);
    exactIds(
      `${role.roleId}.lessons`,
      role.lessons.map(({ lessonId }) => lessonId),
      expected.lessons.map(({ lessonId }) => lessonId),
      true,
    );
    for (const [index, lesson] of role.lessons.entries()) {
      const current = expected.lessons[index];
      if (
        current === undefined ||
        !lesson.currentComplete ||
        lesson.sourceHash !== current.sourceHash ||
        lesson.lessonKind !== current.lessonKind
      ) {
        throw new Error(`${role.roleId}.${lesson.lessonId}のLesson hash/種別がstaleです`);
      }
      checkOperation(lesson.reading);
      if (
        Date.parse(lesson.reading.intentAt) < Date.parse(role.startedAt) ||
        Date.parse(lesson.reading.completedAt) > Date.parse(role.completedAt)
      )
        throw new Error('Lesson読解の時刻が役の実施範囲外です');
      exactIds(
        `${role.roleId}.${lesson.lessonId}.exercises`,
        lesson.exercises.map(({ exerciseId }) => exerciseId),
        current.exercises.map(({ exerciseId }) => exerciseId),
      );
      for (const observation of lesson.exercises) {
        const exercise = current.exercises.find(
          ({ exerciseId }) => exerciseId === observation.exerciseId,
        );
        if (
          observation.gradingResult !== 'pass' ||
          observation.completionRequirement !== exercise?.completionRequirement
        ) {
          throw new Error('Exercise採点/必須任意が実教材と一致しません');
        }
        exactIds(
          '採点必須requirement',
          observation.passedRequirementIds,
          exercise.requiredRequirementIds,
        );
        exactIds('実Scenario', observation.executedScenarioIds, exercise.scenarioIds);
        checkOperation(observation.operation);
        if (
          Date.parse(observation.operation.intentAt) < Date.parse(role.startedAt) ||
          Date.parse(observation.operation.completedAt) > Date.parse(role.completedAt)
        )
          throw new Error('Exercise操作の時刻が役の実施範囲外です');
      }
    }
    exactIds(
      `${role.roleId}.journeys`,
      role.journeys.map(({ journeyId }) => journeyId),
      JAVASCRIPT_REQUIRED_JOURNEYS,
    );
    for (const journey of role.journeys) {
      checkOperation(journey.operation);
      if (
        Date.parse(journey.operation.intentAt) < Date.parse(role.startedAt) ||
        Date.parse(journey.operation.completedAt) > Date.parse(role.completedAt)
      )
        throw new Error('横断操作の時刻が役の実施範囲外です');
      if (
        journey.journeyId === 'export-fresh-import-resume' &&
        !journey.operation.evidence.some(({ kind }) => kind === 'download')
      )
        throw new Error('Export原download証拠がありません');
    }
    exactIds(
      `${role.roleId}.finalSmokes`,
      role.finalSmokes.map(({ smokeId }) => smokeId),
      JAVASCRIPT_FINAL_SMOKES,
    );
    for (const smoke of role.finalSmokes) {
      if (
        smoke.sourceCommit !== expected.sourceCommit ||
        smoke.canonicalDistSha256 !== expected.canonicalDistSha256 ||
        smoke.pageUrl !== finalCandidate.pageUrl ||
        smoke.candidateRunId !== finalCandidate.runId
      )
        throw new Error('final入口/再開smokeがP/Dfinal/URLと一致しません');
      checkOperation(smoke.operation);
      if (Date.parse(smoke.operation.intentAt) < Date.parse(finalCandidate.observedAt))
        throw new Error('final smokeがroot候補P観測より前です');
      if (Date.parse(smoke.operation.intentAt) < Date.parse(role.completedAt))
        throw new Error('final smokeが元draft学習完了より前です');
    }
  }
  const review = record.independentOriginalEvidenceReview;
  if (
    review.status !== 'passed' ||
    review.reviewedAt === 'draft' ||
    !review.originalDigestsVerified ||
    !review.identitiesAndFreshStatesVerified ||
    !review.intentActualEvidenceVerified ||
    !review.candidateRootObservationDigestsVerified ||
    record.roles.some(({ identity }) => identity.actorId === review.reviewerId)
  ) {
    throw new Error('3役原本の独立review/操作/hash照合が未完了です');
  }
  exactIds(
    'root候補観測phase',
    review.candidateObservations.map(({ phase }) => phase),
    ['draft-learning', 'final-candidate'],
  );
  for (const candidate of [draftCandidate, finalCandidate]) {
    const observation = review.candidateObservations.find(({ phase }) => phase === candidate.phase);
    if (
      observation?.runId !== candidate.runId ||
      observation.sha256 !== candidate.rootObservationEvidenceSha256
    )
      throw new Error('root候補観測原本の独立照合がrun/digestと一致しません');
  }
  exactIds(
    '原本review roles',
    review.roleReports.map(({ roleId }) => roleId),
    ['JS-A', 'JS-B', 'JS-C'],
  );
  for (const role of record.roles) {
    if (
      Date.parse(review.reviewedAt) <
      Math.max(
        Date.parse(role.completedAt),
        ...role.finalSmokes.map(({ operation }) => Date.parse(operation.completedAt)),
      )
    )
      throw new Error('原本reviewが観測完了以前です');
    if (
      review.roleReports.find(({ roleId }) => roleId === role.roleId)?.sha256 !==
      role.originalReport.sha256
    ) {
      throw new Error('役の原report hashが独立reviewと一致しません');
    }
  }
  return record;
}

/** 原draftとfinalのmanifestを比較する。最終Artifactbindingの代用にはしない。 */
export function validateJavascriptInputValidity(input: unknown): JavascriptInputValidityRecord {
  const record = JavascriptInputValidityRecordSchema.parse(input);
  if (
    record.releaseStatus !== 'approved' ||
    record.status !== 'passed' ||
    record.verifiedAt === 'draft' ||
    record.verifiedSourceCommit !== record.finalInput.sourceCommit ||
    record.canonicalDistSha256 === 'draft' ||
    record.draftCanonicalDistSha256 === 'draft' ||
    record.draftCandidate.phase !== 'draft-learning' ||
    record.finalCandidate.phase !== 'final-candidate' ||
    record.draftCandidate.runId === record.finalCandidate.runId ||
    record.draftCandidate.sourceCommit !== record.draftInput.sourceCommit ||
    record.finalCandidate.sourceCommit !== record.finalInput.sourceCommit ||
    record.draftCandidate.canonicalDistSha256 !== record.draftCanonicalDistSha256 ||
    record.finalCandidate.canonicalDistSha256 !== record.canonicalDistSha256 ||
    Date.parse(record.draftCandidate.observedAt) > Date.parse(record.finalCandidate.observedAt) ||
    Date.parse(record.verifiedAt) < Date.parse(record.finalCandidate.observedAt)
  )
    throw new Error('input validityの承認/bindingが未完了です');
  exactIds(
    'metadataChanges',
    record.metadataChanges,
    compareJavascriptLearningInputs(record.draftInput, record.finalInput),
  );
  return record;
}

/** JS専用の残り4品質記録をstrict schema/未達0で検査する。必須集合はコード側から渡す。 */
export function validateJavascriptManualRecord(
  name: 'visualReview' | 'accessibilityManual' | 'releaseChecklist' | 'finalCodeReview',
  input: unknown,
  requiredIds: readonly string[] = [],
): void {
  const record =
    name === 'visualReview'
      ? JavascriptVisualReviewRecordSchema.parse(input)
      : name === 'accessibilityManual'
        ? JavascriptAccessibilityRecordSchema.parse(input)
        : name === 'releaseChecklist'
          ? JavascriptReleaseChecklistSchema.parse(input)
          : JavascriptFinalCodeReviewSchema.parse(input);
  if (
    record.releaseStatus !== 'approved' ||
    record.verifiedSourceCommit === 'draft' ||
    record.canonicalDistSha256 === 'draft'
  ) {
    throw new Error(`${name}の承認/bindingが未完了です`);
  }
  noBlocking(name, record);
  if ('reviewedScreens' in record) {
    if (requiredIds.length === 0 || !record.finalArtifactReviewed)
      throw new Error('visualの固定画面/最終Artifact確認がありません');
    exactIds('visual.requiredScreenIds', record.requiredScreenIds, requiredIds);
    exactIds(
      'visual.reviewedScreens',
      record.reviewedScreens.map(({ screenId }) => screenId),
      requiredIds,
    );
    if (
      record.reviewedScreens.some(
        ({ operation }) =>
          operation.status !== 'passed' ||
          !operation.evidence.some(({ kind }) => kind === 'screenshot'),
      )
    )
      throw new Error('visual画像実確認が未達です');
    if (
      record.reviewedScreens.some(
        ({ screenId, viewport }) =>
          !screenId.endsWith(`@${String(viewport.width)}x${String(viewport.height)}`),
      )
    ) {
      throw new Error('visual画面IDと実viewportが一致しません');
    }
  } else if ('journeys' in record) {
    if (requiredIds.length === 0 || record.unperformedChecks !== 0)
      throw new Error('a11yの必須未確認があります');
    exactIds('a11y.requiredJourneyIds', record.requiredJourneyIds, requiredIds);
    exactIds(
      'a11y.journeys',
      record.journeys.map(({ journeyId }) => journeyId),
      requiredIds,
    );
    if (record.journeys.some(({ operation }) => operation.status !== 'passed'))
      throw new Error('a11y実操作が未達です');
  } else if ('pendingItems' in record) {
    if (
      record.pendingItems !== 0 ||
      record.failedItems !== 0 ||
      record.automatedGatesStatus !== 'passed' ||
      record.manualGatesStatus !== 'passed'
    )
      throw new Error('release checklistに未達があります');
  } else if (
    record.status !== 'passed' ||
    record.reviewedAt === 'draft' ||
    record.baseCommit === 'draft' ||
    record.productTreeSha256 === 'draft' ||
    record.implementerIds.includes(record.reviewerId)
  ) {
    throw new Error('最終コードreviewが未達/実装者と同一です');
  }
}
