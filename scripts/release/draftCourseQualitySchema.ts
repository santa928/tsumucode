import { z } from 'zod';
import { CommitShaSchema, Sha256Schema } from './releaseSchema';
import {
  DraftEvidenceTargetSchema,
  DraftReleaseCourseIdSchema,
} from './draftReleaseCourseContracts';

const PrivatePathSchema = z
  .string()
  .min(1)
  .refine(
    (value) =>
      !value.startsWith('/') &&
      !value.includes('\\') &&
      !value.split('/').some((part) => part === '' || part === '.' || part === '..'),
    '原本には証拠root内の相対pathが必要です',
  );
const ActorSchema = z.string().trim().min(1);

export const DraftQualityReferenceSchema = z
  .object({ path: PrivatePathSchema, sha256: Sha256Schema })
  .strict();
export type DraftQualityReference = z.infer<typeof DraftQualityReferenceSchema>;

export const DraftQualityScopeSchema = z.enum([
  'runtime',
  'usability',
  'accessibility',
  'persistence',
  'delivery',
]);
export type DraftQualityScope = z.infer<typeof DraftQualityScopeSchema>;

export const DraftCandidateBindingSchema = z
  .object({
    sourceCommit: CommitShaSchema,
    sourceTree: CommitShaSchema,
    productTreeSha256: Sha256Schema,
    canonicalDistSha256: Sha256Schema,
    runtimeSha256: Sha256Schema,
    publicProvenanceSha256: Sha256Schema,
    contentReviewSha256: Sha256Schema,
  })
  .strict();
export type DraftCandidateBinding = z.infer<typeof DraftCandidateBindingSchema>;

/** 元操作の値を保持する。現候補への再利用可否は別途Git入力指紋で比較する。 */
export const DraftObservationReceiptSchema = z
  .object({
    schemaVersion: z.literal(1),
    courseId: DraftReleaseCourseIdSchema,
    actor: ActorSchema,
    method: z.enum(['computer-use', 'automated-test']),
    executionTarget: DraftEvidenceTargetSchema,
    contextSharing: z.enum(['none', 'not-applicable']),
    sourceCommit: CommitShaSchema,
    sourceTree: CommitShaSchema,
    canonicalDistSha256: z.union([Sha256Schema, z.literal('not-applicable')]),
    portableArtifacts: z
      .object({
        sourceArchive: DraftQualityReferenceSchema,
        buildManifest: DraftQualityReferenceSchema,
      })
      .strict()
      .nullable(),
    scopes: z.array(DraftQualityScopeSchema).min(1),
    lessonIds: z.array(z.string().min(1)).min(1),
    inputSha256ByScope: z.partialRecord(DraftQualityScopeSchema, Sha256Schema),
    rawReports: z.array(DraftQualityReferenceSchema).min(1),
    mandatoryFindings: z.literal(0),
  })
  .strict();
export type DraftObservationReceipt = z.infer<typeof DraftObservationReceiptSchema>;

export const DraftCodeReviewReceiptSchema = z
  .object({
    schemaVersion: z.literal(1),
    courseId: DraftReleaseCourseIdSchema,
    actor: ActorSchema,
    role: z.enum(['requirements-logic', 'security', 'structure']),
    sourceCommit: CommitShaSchema,
    productTreeSha256: Sha256Schema,
    decision: z.literal('approved'),
    mandatoryFindings: z.literal(0),
    rawReport: DraftQualityReferenceSchema,
  })
  .strict();

/** 原本照合のreceipt自身を除いた品質記録と、実際に照合した全file集合を固定する。 */
export const DraftOriginalsReviewSchema = z
  .object({
    schemaVersion: z.literal(1),
    courseId: DraftReleaseCourseIdSchema,
    reviewer: ActorSchema,
    decision: z.literal('approved'),
    candidate: DraftCandidateBindingSchema,
    qualityRecordSha256: Sha256Schema,
    checkedReferences: z.array(DraftQualityReferenceSchema).min(1),
  })
  .strict();

/** draftは記入途中として保持し、準備完了や公開承認とは解釈しない。 */
export const DraftCourseQualityRecordSchema = z
  .object({
    schemaVersion: z.literal(1),
    courseId: DraftReleaseCourseIdSchema,
    status: z.enum(['draft', 'ready-for-technical-verification']),
    publicationAuthorized: z.literal(false),
    author: ActorSchema,
    candidate: DraftCandidateBindingSchema.nullable(),
    observations: z.array(DraftQualityReferenceSchema),
    codeReviews: z.array(DraftQualityReferenceSchema),
    originalsReview: DraftQualityReferenceSchema.nullable(),
  })
  .strict();
export type DraftCourseQualityRecord = z.infer<typeof DraftCourseQualityRecordSchema>;
