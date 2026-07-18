import { z } from 'zod';
import { ContentProgressMigrationSchema } from '../../src/core/content/schema';

export const RevisionSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}\.\d+$/u, 'revisionはYYYY-MM-DD.N形式で指定してください');
export const CommitShaSchema = z.string().regex(/^[a-f0-9]{40}$/u);
export const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
export const ArtifactDigestSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/u);
export const PageUrlSchema = z
  .url()
  .refine((value) => new URL(value).protocol === 'https:', '公開URLはHTTPSである必要があります');
const CommitBindingSchema = z.union([CommitShaSchema, z.literal('draft')]);
const HashBindingSchema = z.union([Sha256Schema, z.literal('draft')]);
const SafeTagSchema = z.string().regex(/^tsumucode-release-\d{4}-\d{2}-\d{2}\.\d+$/u);
const PositiveIntegerTextSchema = z.string().regex(/^[1-9]\d*$/u);
const SafeRelativePathSchema = z
  .string()
  .min(1)
  .refine(
    (value) =>
      !value.startsWith('/') &&
      !value.split('/').some((segment) => segment === '' || segment === '.' || segment === '..'),
    'Repository内の安全な相対Pathを指定してください',
  );

const ReleaseCoreShape = {
  revision: RevisionSchema,
  canonicalDistSha256: Sha256Schema,
  courseManifestSha256: Sha256Schema,
  publicProvenanceSha256: Sha256Schema,
  persistentIdsSha256: Sha256Schema,
  persistentIds: z.array(z.string().min(1)).refine((ids) => new Set(ids).size === ids.length),
  previousReleaseTag: SafeTagSchema.nullable(),
  tombstonedIds: z.array(z.string().min(1)).refine((ids) => new Set(ids).size === ids.length),
  migrations: z.array(ContentProgressMigrationSchema),
  syntheticProgressBundlePath: SafeRelativePathSchema,
};

export const PublishedReleaseSchema = z
  .object({
    ...ReleaseCoreShape,
    tag: SafeTagSchema,
    sourceCommit: CommitShaSchema,
    workflowHeadCommit: CommitShaSchema,
    qualityArtifactId: z.string().regex(/^[1-9]\d*$/u),
    qualityArtifactDigest: ArtifactDigestSchema,
    reportArtifactId: z.string().regex(/^[1-9]\d*$/u),
    reportArtifactDigest: ArtifactDigestSchema,
    workflowRunId: z.string().regex(/^[1-9]\d*$/u),
    workflowRunAttempt: z.number().int().positive(),
    pageUrl: PageUrlSchema,
    postDeployVerificationPath: SafeRelativePathSchema,
    postDeployVerificationSha256: Sha256Schema,
  })
  .strict();

export const ReleaseCandidateSchema = z
  .object({
    revision: RevisionSchema,
    status: z.enum(['draft', 'approved']),
    verifiedSourceCommit: CommitBindingSchema,
    canonicalDistSha256: HashBindingSchema,
    courseManifestSha256: HashBindingSchema,
    publicProvenanceSha256: HashBindingSchema,
    persistentIdsSha256: HashBindingSchema,
    persistentIds: z.array(z.string().min(1)).refine((ids) => new Set(ids).size === ids.length),
    previousReleaseTag: SafeTagSchema.nullable(),
    tombstonedIds: z.array(z.string().min(1)).refine((ids) => new Set(ids).size === ids.length),
    migrations: z.array(ContentProgressMigrationSchema),
    syntheticProgressBundlePath: SafeRelativePathSchema,
  })
  .strict();

export const ReleaseHistorySchema = z
  .object({
    schemaVersion: z.literal(1),
    releases: z.array(PublishedReleaseSchema),
    candidate: ReleaseCandidateSchema,
  })
  .strict();

export type ReleaseHistory = z.infer<typeof ReleaseHistorySchema>;
export type PublishedRelease = z.infer<typeof PublishedReleaseSchema>;
export type ReleaseCandidate = z.infer<typeof ReleaseCandidateSchema>;

/** 承認対象の品質記録を固定pathへ限定し、同名の偽Recordへの差し替えを防ぐ。 */
function qualityRecordSchema<const Path extends string>(recordPath: Path) {
  return z.object({ path: z.literal(recordPath), sha256: HashBindingSchema }).strict();
}

export const ReleaseApprovalSchema = z
  .object({
    schemaVersion: z.literal(1),
    status: z.enum(['draft', 'approved']),
    verifiedSourceCommit: CommitBindingSchema,
    candidateTreeSha256: HashBindingSchema,
    canonicalDistSha256: HashBindingSchema,
    courseManifestSha256: HashBindingSchema,
    publicProvenanceSha256: HashBindingSchema,
    visualBaselineSha256: HashBindingSchema,
    records: z
      .object({
        contentReview: qualityRecordSchema('docs/quality/content-review.yaml'),
        visualReview: qualityRecordSchema('docs/quality/visual-review.md'),
        accessibilityManual: qualityRecordSchema('docs/quality/a11y-manual.md'),
        noviceObservation: qualityRecordSchema('docs/quality/novice-observation.md'),
        releaseChecklist: qualityRecordSchema('docs/quality/release-checklist.md'),
      })
      .strict(),
    approvedBy: z.string().min(1),
    approvedAt: z.union([z.iso.datetime({ offset: true }), z.literal('draft')]),
  })
  .strict();

export type ReleaseApproval = z.infer<typeof ReleaseApprovalSchema>;

export const PostDeployVerificationSchema = z
  .object({
    schemaVersion: z.literal(1),
    status: z.enum(['draft', 'approved']),
    revision: z.union([RevisionSchema, z.literal('draft')]),
    tag: z.union([SafeTagSchema, z.literal('draft')]),
    sourceCommit: CommitBindingSchema,
    workflowHeadCommit: CommitBindingSchema,
    workflowRunId: z.union([PositiveIntegerTextSchema, z.literal('draft')]),
    workflowRunAttempt: z.union([z.number().int().positive(), z.literal('draft')]),
    reportArtifactId: z.union([PositiveIntegerTextSchema, z.literal('draft')]),
    reportArtifactDigest: z.union([ArtifactDigestSchema, z.literal('draft')]),
    pageUrl: z.union([PageUrlSchema, z.literal('draft')]),
    environmentApprovalStatus: z.enum(['pending', 'passed']),
    pageVerificationStatus: z.enum(['pending', 'passed']),
    reportVerificationStatus: z.enum(['pending', 'passed']),
    tagVerificationStatus: z.enum(['pending', 'passed']),
    verifiedBy: z.string().min(1),
    verifiedAt: z.union([z.iso.datetime({ offset: true }), z.literal('draft')]),
  })
  .strict();

export type PostDeployVerification = z.infer<typeof PostDeployVerificationSchema>;
