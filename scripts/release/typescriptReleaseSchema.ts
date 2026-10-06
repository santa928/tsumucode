import { z } from 'zod';
import {
  PostDeployVerificationSchema,
  PublishedReleaseSchema,
  ReleaseApprovalSchema,
  ReleaseCandidateSchema,
  Sha256Schema,
  CommitShaSchema,
} from './releaseSchema';
import { resolveReleaseCourseContract } from './releaseCourseContracts';

const tsContract = resolveReleaseCourseContract('typescript');
const HashBindingSchema = z.union([Sha256Schema, z.literal('draft')]);
const LearningBindingShape = {
  draftSourceCommit: z.union([CommitShaSchema, z.literal('draft')]),
  draftCanonicalDistSha256: HashBindingSchema,
  normalizedLearningInputSha256: HashBindingSchema,
};

/** TS品質記録は同名の別file/HTML記録へ差し替えられないliteral pathに固定する。 */
function record<const Path extends string>(recordPath: Path) {
  return z.object({ path: z.literal(recordPath), sha256: HashBindingSchema }).strict();
}

export const TypescriptReleaseApprovalSchema = ReleaseApprovalSchema.extend({
  schemaVersion: z.literal(2),
  courseId: z.literal('typescript'),
  records: z
    .object({
      contentReview: record(tsContract.records.contentReview),
      technicalAcceptance: record(tsContract.records.technicalAcceptance),
    })
    .strict(),
}).strict();

export const TypescriptReleaseCandidateSchema = ReleaseCandidateSchema.extend({
  ...LearningBindingShape,
  courseId: z.literal('typescript'),
  syntheticProgressBundlePath: z.literal(tsContract.syntheticProgressBundlePath),
}).strict();

export const TypescriptPublishedReleaseSchema = PublishedReleaseSchema.extend({
  draftSourceCommit: CommitShaSchema,
  draftCanonicalDistSha256: Sha256Schema,
  normalizedLearningInputSha256: Sha256Schema,
  courseId: z.literal('typescript'),
  syntheticProgressBundlePath: z.literal(tsContract.syntheticProgressBundlePath),
  postDeployVerificationPath: z
    .string()
    .regex(/^docs\/quality\/post-deploy\/typescript\/\d{4}-\d{2}-\d{2}\.\d+\.yaml$/u),
}).strict();

export const TypescriptReleaseHistorySchema = z
  .object({
    schemaVersion: z.literal(2),
    courseId: z.literal('typescript'),
    releases: z.array(TypescriptPublishedReleaseSchema),
    candidate: TypescriptReleaseCandidateSchema,
  })
  .strict();

export const TypescriptPostDeployVerificationSchema = PostDeployVerificationSchema.omit({
  environmentApprovalStatus: true,
})
  .extend({
    schemaVersion: z.literal(2),
    courseId: z.literal('typescript'),
    environmentAdmissionStatus: z.enum(['pending', 'passed']),
    independentEnvironmentApproval: z.literal('not-configured'),
    publicSmokeOperations: z.array(
      z
        .object({
          operationId: z.enum([
            'start',
            'resume',
            'grading',
            'persistence',
            'export',
            'fresh-import',
          ]),
          status: z.enum(['pending', 'passed']),
          evidenceSha256: Sha256Schema,
          observedAt: z.iso.datetime({ offset: true }),
        })
        .strict(),
    ),
    requiredUnconfirmed: z.number().int().nonnegative(),
  })
  .strict();

export type TypescriptReleaseApproval = z.infer<typeof TypescriptReleaseApprovalSchema>;
export type TypescriptReleaseHistory = z.infer<typeof TypescriptReleaseHistorySchema>;
export type TypescriptPublishedRelease = z.infer<typeof TypescriptPublishedReleaseSchema>;
