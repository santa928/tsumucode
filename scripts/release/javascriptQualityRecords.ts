import { z } from 'zod';
import { CommitShaSchema, Sha256Schema } from './releaseSchema';
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

/** 教材評価はLesson単位で蓄積する。全体Source/Artifactやfresh状態を再利用条件にしない。 */
export const JavascriptLessonEvaluationSchema = z
  .object({
    evaluationId: TextSchema,
    lessonId: TextSchema,
    roleId: RoleIdSchema,
    persona: TextSchema,
    sourceCommit: CommitShaSchema,
    sourceLessonHash: Sha256Schema,
    learnerContentSha256: Sha256Schema,
    identity: z
      .object({
        actorId: TextSchema,
        sessionId: TextSchema,
        browserContextId: TextSchema,
        storageNamespace: TextSchema,
        model: z.literal('gpt-6.1-sol'),
        reasoningEffort: z.enum(['high', 'xhigh', 'max', 'ultra']),
        copiedState: z.literal(false),
        solutionImplementationFixturePeekBeforeFirstAttempt: z.literal(false),
        otherActorReportPeekBeforeCompletion: z.literal(false),
        injectedPassingState: z.literal(false),
      })
      .strict(),
    reading: OperationSchema,
    interaction: OperationSchema,
    originalReport: JavascriptOperationEvidenceSchema.extend({
      kind: z.literal('report'),
    }).strict(),
    checkpoint: JavascriptOperationEvidenceSchema.optional(),
    ...FindingsShape,
  })
  .strict();
export type JavascriptLessonEvaluation = z.infer<typeof JavascriptLessonEvaluationSchema>;

/** 現候補への公開bindingと、過去固定点の教材評価原本を分離する。 */
export const JavascriptAgentLearningRecordSchema = z
  .object({
    ...BindingShape,
    schemaVersion: z.literal(3),
    evaluationKind: z.literal('agent-simulated-learning'),
    replacementAcceptance: z.literal('three-independent-personas-once-per-new-lesson'),
    authorizationReference: TextSchema,
    limits: z
      .object({
        realHumanNovice: z.literal('not-demonstrated'),
        naturalMisunderstandingFrequency: z.literal('not-demonstrated'),
        physicalDevice: z.literal('not-demonstrated'),
      })
      .strict(),
    lessonEvaluations: z.array(JavascriptLessonEvaluationSchema),
    finalSmokes: z.array(
      z
        .object({
          smokeId: z.enum(JAVASCRIPT_FINAL_SMOKES),
          performedBy: TextSchema,
          sourceCommit: CommitShaSchema,
          canonicalDistSha256: Sha256Schema,
          pageUrl: JavascriptCandidatePageUrlSchema,
          candidateRunId: TextSchema,
          operation: OperationSchema,
        })
        .strict(),
    ),
    independentOriginalEvidenceReview: z
      .object({
        reviewerId: TextSchema,
        reviewedAt: z.union([TimestampSchema, z.literal('draft')]),
        status: OutcomeSchema,
        originalDigestsVerified: z.boolean(),
        learnerContentVerified: z.boolean(),
        identitiesVerified: z.boolean(),
        intentActualEvidenceVerified: z.boolean(),
        reviewedReportSha256s: z.array(Sha256Schema),
        finalCandidateObservationSha256: DraftHashSchema,
      })
      .strict(),
    ...FindingsShape,
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
  readonly finalCandidate: JavascriptCandidateObservation;
  readonly lessons: readonly {
    readonly lessonId: string;
    readonly learnerContentSha256: string;
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

/** 操作の自己申告だけを完了にせず、画像/DOMと原logを確認する。 */
function observedOperation(operation: z.infer<typeof OperationSchema>): boolean {
  return (
    operation.status === 'passed' &&
    operation.evidence.some(({ kind }) => kind === 'screenshot' || kind === 'dom') &&
    operation.evidence.some(({ kind }) => kind === 'log')
  );
}

/** 選択した実操作の転用と、同じ証拠IDの原digest差し替えを拒否する。 */
function verifyEvaluationOperations(
  evaluations: readonly JavascriptLessonEvaluation[],
  smokes: JavascriptAgentLearningRecord['finalSmokes'],
): void {
  const operationIds = new Set<string>();
  const evidenceDigests = new Map<string, string>();
  const checkEvidence = (evidence: z.infer<typeof JavascriptOperationEvidenceSchema>): void => {
    const previous = evidenceDigests.get(evidence.evidenceId);
    if (previous !== undefined && previous !== evidence.sha256)
      throw new Error('同じ証拠IDの原digestが異なります');
    evidenceDigests.set(evidence.evidenceId, evidence.sha256);
  };
  for (const operation of [
    ...evaluations.flatMap(({ reading, interaction }) => [reading, interaction]),
    ...smokes.map(({ operation }) => operation),
  ]) {
    if (operationIds.has(operation.operationId)) throw new Error('別教材へ実操作を複製できません');
    operationIds.add(operation.operationId);
    operation.evidence.forEach(checkEvidence);
  }
  for (const row of evaluations) {
    checkEvidence(row.originalReport);
    if (row.checkpoint) checkEvidence(row.checkpoint);
  }
}

/** 済/未済を教材単位で返す。別commitの確認済み教材を消さず、未実施を補完しない。 */
export function getJavascriptLessonEvaluationCoverage(
  input: unknown,
  lessons: JavascriptLearningExpectations['lessons'],
): {
  readonly confirmedLessonIds: readonly string[];
  readonly pending: readonly {
    readonly lessonId: string;
    readonly missingRoleIds: readonly string[];
  }[];
  readonly evaluations: readonly JavascriptLessonEvaluation[];
} {
  const record = JavascriptAgentLearningRecordSchema.parse(input);
  const ids = record.lessonEvaluations.map(({ evaluationId }) => evaluationId);
  if (new Set(ids).size !== ids.length) throw new Error('教材評価IDが重複しています');
  const evaluations: JavascriptLessonEvaluation[] = [];
  const confirmedLessonIds: string[] = [];
  const pending: { lessonId: string; missingRoleIds: string[] }[] = [];
  for (const lesson of lessons) {
    const missingRoleIds: string[] = [];
    for (const roleId of ['JS-A', 'JS-B', 'JS-C'] as const) {
      const evaluation = record.lessonEvaluations.find(
        (row) =>
          row.lessonId === lesson.lessonId &&
          row.roleId === roleId &&
          row.learnerContentSha256 === lesson.learnerContentSha256 &&
          observedOperation(row.reading) &&
          observedOperation(row.interaction) &&
          row.unresolvedCritical === 0 &&
          row.unresolvedImportant === 0 &&
          row.requiredUnconfirmed === 0,
      );
      if (evaluation) evaluations.push(evaluation);
      else missingRoleIds.push(roleId);
    }
    if (missingRoleIds.length) pending.push({ lessonId: lesson.lessonId, missingRoleIds });
    else confirmedLessonIds.push(lesson.lessonId);
  }
  verifyEvaluationOperations(evaluations, record.finalSmokes);
  return { confirmedLessonIds, pending, evaluations };
}

/** 3独立personaの教材評価を一度ずつ照合し、最終入口smokeは公開候補へ別に結ぶ。 */
export function validateJavascriptAgentLearning(
  input: unknown,
  expected: JavascriptLearningExpectations,
): JavascriptAgentLearningRecord {
  const record = JavascriptAgentLearningRecordSchema.parse(input);
  const candidate = JavascriptCandidateObservationSchema.parse(expected.finalCandidate);
  if (
    record.releaseStatus !== 'approved' ||
    record.verifiedSourceCommit !== expected.sourceCommit ||
    record.canonicalDistSha256 !== expected.canonicalDistSha256 ||
    candidate.phase !== 'final-candidate' ||
    candidate.sourceCommit !== expected.sourceCommit ||
    candidate.canonicalDistSha256 !== expected.canonicalDistSha256
  )
    throw new Error('JS教材評価台帳の現公開候補bindingが不一致です');
  noBlocking('教材評価', record);
  const coverage = getJavascriptLessonEvaluationCoverage(record, expected.lessons);
  if (coverage.pending.length)
    throw new Error(
      '未確認/新規教材の3persona評価が残っています: ' +
        coverage.pending
          .map(({ lessonId, missingRoleIds }) => lessonId + ':' + missingRoleIds.join(','))
          .join(';'),
    );
  for (const lesson of expected.lessons) {
    const rows = coverage.evaluations.filter(({ lessonId }) => lessonId === lesson.lessonId);
    for (const key of ['actorId', 'sessionId', 'browserContextId', 'storageNamespace'] as const)
      if (new Set(rows.map(({ identity }) => identity[key])).size !== 3)
        throw new Error('教材の3personaが独立していません: ' + lesson.lessonId);
    if (new Set(rows.map(({ originalReport }) => originalReport.sha256)).size !== 3)
      throw new Error('教材の3persona原reportが同じdigestです');
  }
  exactIds(
    '最終入口smoke',
    record.finalSmokes.map(({ smokeId }) => smokeId),
    JAVASCRIPT_FINAL_SMOKES,
  );
  for (const smoke of record.finalSmokes) {
    if (
      smoke.sourceCommit !== candidate.sourceCommit ||
      smoke.canonicalDistSha256 !== candidate.canonicalDistSha256 ||
      smoke.pageUrl !== candidate.pageUrl ||
      smoke.candidateRunId !== candidate.runId ||
      !observedOperation(smoke.operation) ||
      Date.parse(smoke.operation.intentAt) < Date.parse(candidate.observedAt)
    )
      throw new Error('最終入口smokeが現候補/原操作へ結合されていません');
  }
  const review = record.independentOriginalEvidenceReview;
  if (
    review.status !== 'passed' ||
    review.reviewedAt === 'draft' ||
    !review.originalDigestsVerified ||
    !review.learnerContentVerified ||
    !review.identitiesVerified ||
    !review.intentActualEvidenceVerified ||
    review.finalCandidateObservationSha256 !== candidate.rootObservationEvidenceSha256 ||
    coverage.evaluations.some(({ identity }) => identity.actorId === review.reviewerId) ||
    record.finalSmokes.some(({ performedBy }) => performedBy === review.reviewerId)
  )
    throw new Error('教材評価原本の独立reviewが未完了です');
  exactIds('教材評価原report', review.reviewedReportSha256s, [
    ...new Set(coverage.evaluations.map(({ originalReport }) => originalReport.sha256)),
  ]);
  const completedAt = [
    ...coverage.evaluations.flatMap(({ reading, interaction }) => [
      reading.completedAt,
      interaction.completedAt,
    ]),
    ...record.finalSmokes.map(({ operation }) => operation.completedAt),
  ];
  if (completedAt.some((value) => Date.parse(value) > Date.parse(review.reviewedAt)))
    throw new Error('教材評価原本reviewが観測完了より前です');
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
