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

const reactContract = resolveReleaseCourseContract('react');
const HashBindingSchema = z.union([Sha256Schema, z.literal('draft')]);
const LearningBindingShape = {
  draftSourceCommit: z.union([CommitShaSchema, z.literal('draft')]),
  draftCanonicalDistSha256: HashBindingSchema,
  normalizedLearningInputSha256: HashBindingSchema,
};

/** React品質記録は同名の別file/HTML記録へ差し替えられないliteral pathに固定する。 */
function record<const Path extends string>(recordPath: Path) {
  return z.object({ path: z.literal(recordPath), sha256: HashBindingSchema }).strict();
}

export const ReactReleaseApprovalSchema = ReleaseApprovalSchema.extend({
  schemaVersion: z.literal(2),
  courseId: z.literal('react'),
  records: z
    .object({
      contentReview: record(reactContract.records.contentReview),
      technicalAcceptance: record(reactContract.records.technicalAcceptance),
    })
    .strict(),
}).strict();

export const ReactReleaseCandidateSchema = ReleaseCandidateSchema.extend({
  ...LearningBindingShape,
  courseId: z.literal('react'),
  syntheticProgressBundlePath: z.literal(reactContract.syntheticProgressBundlePath),
}).strict();

export const ReactPublishedReleaseSchema = PublishedReleaseSchema.extend({
  draftSourceCommit: CommitShaSchema,
  draftCanonicalDistSha256: Sha256Schema,
  normalizedLearningInputSha256: Sha256Schema,
  courseId: z.literal('react'),
  syntheticProgressBundlePath: z.literal(reactContract.syntheticProgressBundlePath),
  postDeployVerificationPath: z
    .string()
    .regex(/^docs\/quality\/post-deploy\/react\/\d{4}-\d{2}-\d{2}\.\d+\.yaml$/u),
}).strict();

export const ReactReleaseHistorySchema = z
  .object({
    schemaVersion: z.literal(2),
    courseId: z.literal('react'),
    releases: z.array(ReactPublishedReleaseSchema),
    candidate: ReactReleaseCandidateSchema,
  })
  .strict();

export const ReactPostDeployVerificationSchema = PostDeployVerificationSchema.omit({
  environmentApprovalStatus: true,
})
  .extend({
    schemaVersion: z.literal(2),
    courseId: z.literal('react'),
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

export type ReactReleaseApproval = z.infer<typeof ReactReleaseApprovalSchema>;
export type ReactReleaseHistory = z.infer<typeof ReactReleaseHistorySchema>;
export type ReactPublishedRelease = z.infer<typeof ReactPublishedReleaseSchema>;
