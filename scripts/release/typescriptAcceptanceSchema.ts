import { z } from 'zod';

export const Hash = z.string().regex(/^[a-f0-9]{64}$/u);
const Commit = z.string().regex(/^[a-f0-9]{40}$/u);
export const Reference = z.object({ path: z.string().min(1), sha256: Hash }).strict();
export const MetricKind = z.enum(['cold', 'warm', 'simple', 'dom', 'async', 'busy', 'stop']);

const BaselineEnvironment = z
  .object({
    browserMajor: z.literal(149),
    os: z.literal('linux'),
    arch: z.literal('arm64'),
    logicalCpu: z.literal(10),
    cpuModel: z.literal('unknown'),
    localStaticSubpath: z.literal(true),
    networkThrottle: z.literal(false),
    cpuThrottle: z.literal(false),
  })
  .strict();

/** capture時の値と実行条件を同じraw記録へ固定する。任意pointerや後付け標本を扱わない。 */
export const TypescriptPerformanceEvidenceSchema = z
  .object({
    schemaVersion: z.literal(1),
    courseId: z.literal('typescript'),
    kind: MetricKind,
    sourceCommit: Commit,
    manifestSha256: Hash,
    environment: BaselineEnvironment,
    exerciseId: z.string().regex(/^typescript-ch\d{2}-l\d{2}-e01$/u),
    applicationSourceSha256: Hash,
    dependencyLockSha256: Hash,
    workloadSourceSha256: Hash,
    harness: Reference,
    samplesMs: z.array(z.number().positive()).min(2),
    warmup: z.number().int().nonnegative(),
    reportedValueMs: z.number().positive(),
    timingScope: z.enum([
      'controller-preview',
      'controller-validation',
      'trusted-click-next-frame',
    ]),
    includesQueueAndFrame: z.boolean(),
    lateResultsRejected: z.boolean(),
  })
  .strict();
export type TypescriptPerformanceEvidence = z.infer<typeof TypescriptPerformanceEvidenceSchema>;

export const EvaluationReceiptSchema = z
  .object({
    schemaVersion: z.literal(1),
    role: z.enum(['A', 'B', 'C']),
    actor: z.string().min(1),
    session: z.string().min(1),
    publicInputOnly: z.literal(true),
    explainsFinalProject: z.boolean(),
    report: Reference,
    lessons: z
      .array(
        z.object({ lessonId: z.string(), learnerContentSha256: Hash, sourceSha256: Hash }).strict(),
      )
      .min(1),
  })
  .strict();

export type EvaluationReceipt = z.infer<typeof EvaluationReceiptSchema>;

/** TS専用の模擬受入記録。正式公開の許可や既存JSの公開契約には変換しない。 */
export const TypescriptAcceptanceSchema = z
  .object({
    schemaVersion: z.literal(1),
    courseId: z.literal('typescript'),
    methodsApprovalReference: z.string().min(1),
    publicationApproval: z.literal('pending'),
    realHumanTrial: z.literal('unverified'),
    lowEndPhysicalDevice: z.literal('unverified'),
    sourceCommit: Commit,
    manifestSha256: Hash,
    artifactSha256: Hash,
    environment: BaselineEnvironment,
    independenceReview: Reference,
    personas: z
      .array(
        z
          .object({
            role: z.enum(['A', 'B', 'C']),
            actors: z.array(z.string().min(1)).min(1),
            sessions: z.array(z.string().min(1)).min(1),
            browserContexts: z.array(z.string().min(1)).min(1),
            publicInputOnly: z.literal(true),
            explainsFinalProject: z.literal(true),
            evaluations: z.array(Reference).min(1),
            results: z
              .array(
                z
                  .object({
                    lessonId: z.string().regex(/^typescript-ch\d{2}-l\d{2}$/u),
                    learnerContentSha256: Hash,
                    actor: z.string().min(1),
                    session: z.string().min(1),
                    source: Reference,
                    uiEvidence: Reference,
                    uiRow: z.number().int().nonnegative(),
                  })
                  .strict(),
              )
              .length(15),
          })
          .strict(),
      )
      .length(3),
    performance: z
      .array(
        z
          .object({
            kind: MetricKind,
            rawEvidence: Reference,
            reuseReason: z.string().min(1).optional(),
          })
          .strict(),
      )
      .length(7),
  })
  .strict();
export type TypescriptAcceptance = z.infer<typeof TypescriptAcceptanceSchema>;
