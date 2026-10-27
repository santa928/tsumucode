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

const tailwindContract = resolveReleaseCourseContract('tailwind');
const HashBindingSchema = z.union([Sha256Schema, z.literal('draft')]);
const LearningBindingShape = {
  draftSourceCommit: z.union([CommitShaSchema, z.literal('draft')]),
  draftCanonicalDistSha256: HashBindingSchema,
  normalizedLearningInputSha256: HashBindingSchema,
};

/** Tailwind品質記録は同名の別file/HTML記録へ差し替えられないliteral pathに固定する。 */
function record<const Path extends string>(recordPath: Path) {
  return z.object({ path: z.literal(recordPath), sha256: HashBindingSchema }).strict();
}

export const TailwindReleaseApprovalSchema = ReleaseApprovalSchema.extend({
  schemaVersion: z.literal(2),
  courseId: z.literal('tailwind'),
  records: z
    .object({
      contentReview: record(tailwindContract.records.contentReview),
      technicalAcceptance: record(tailwindContract.records.technicalAcceptance),
    })
    .strict(),
}).strict();

export const TailwindReleaseCandidateSchema = ReleaseCandidateSchema.extend({
  ...LearningBindingShape,
  courseId: z.literal('tailwind'),
  syntheticProgressBundlePath: z.literal(tailwindContract.syntheticProgressBundlePath),
}).strict();

export const TailwindPublishedReleaseSchema = PublishedReleaseSchema.extend({
  draftSourceCommit: CommitShaSchema,
  draftCanonicalDistSha256: Sha256Schema,
  normalizedLearningInputSha256: Sha256Schema,
  courseId: z.literal('tailwind'),
  syntheticProgressBundlePath: z.literal(tailwindContract.syntheticProgressBundlePath),
  postDeployVerificationPath: z
    .string()
    .regex(/^docs\/quality\/post-deploy\/tailwind\/\d{4}-\d{2}-\d{2}\.\d+\.yaml$/u),
}).strict();

export const TailwindReleaseHistorySchema = z
  .object({
    schemaVersion: z.literal(2),
    courseId: z.literal('tailwind'),
    releases: z.array(TailwindPublishedReleaseSchema),
    candidate: TailwindReleaseCandidateSchema,
  })
  .strict();

export const TailwindPostDeployVerificationSchema = PostDeployVerificationSchema.omit({
  environmentApprovalStatus: true,
})
  .extend({
    schemaVersion: z.literal(2),
    courseId: z.literal('tailwind'),
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
            'recommended-path',
            'portable-production-build',
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

export type TailwindReleaseApproval = z.infer<typeof TailwindReleaseApprovalSchema>;
export type TailwindReleaseHistory = z.infer<typeof TailwindReleaseHistorySchema>;
export type TailwindPublishedRelease = z.infer<typeof TailwindPublishedReleaseSchema>;
