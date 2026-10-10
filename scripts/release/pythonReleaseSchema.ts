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

const pythonContract = resolveReleaseCourseContract('python-basics');
const HashBindingSchema = z.union([Sha256Schema, z.literal('draft')]);
const LearningBindingShape = {
  draftSourceCommit: z.union([CommitShaSchema, z.literal('draft')]),
  draftCanonicalDistSha256: HashBindingSchema,
  normalizedLearningInputSha256: HashBindingSchema,
};

/** Python品質記録は同名の別file/HTML記録へ差し替えられないliteral pathに固定する。 */
function record<const Path extends string>(recordPath: Path) {
  return z.object({ path: z.literal(recordPath), sha256: HashBindingSchema }).strict();
}

export const PythonReleaseApprovalSchema = ReleaseApprovalSchema.extend({
  schemaVersion: z.literal(2),
  courseId: z.literal('python-basics'),
  records: z
    .object({
      contentReview: record(pythonContract.records.contentReview),
      technicalAcceptance: record(pythonContract.records.technicalAcceptance),
    })
    .strict(),
}).strict();

export const PythonReleaseCandidateSchema = ReleaseCandidateSchema.extend({
  ...LearningBindingShape,
  courseId: z.literal('python-basics'),
  syntheticProgressBundlePath: z.literal(pythonContract.syntheticProgressBundlePath),
}).strict();

export const PythonPublishedReleaseSchema = PublishedReleaseSchema.extend({
  draftSourceCommit: CommitShaSchema,
  draftCanonicalDistSha256: Sha256Schema,
  normalizedLearningInputSha256: Sha256Schema,
  courseId: z.literal('python-basics'),
  syntheticProgressBundlePath: z.literal(pythonContract.syntheticProgressBundlePath),
  postDeployVerificationPath: z
    .string()
    .regex(/^docs\/quality\/post-deploy\/python-basics\/\d{4}-\d{2}-\d{2}\.\d+\.yaml$/u),
}).strict();

export const PythonReleaseHistorySchema = z
  .object({
    schemaVersion: z.literal(2),
    courseId: z.literal('python-basics'),
    releases: z.array(PythonPublishedReleaseSchema),
    candidate: PythonReleaseCandidateSchema,
  })
  .strict();

export const PythonPostDeployVerificationSchema = PostDeployVerificationSchema.omit({
  environmentApprovalStatus: true,
})
  .extend({
    schemaVersion: z.literal(2),
    courseId: z.literal('python-basics'),
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

export type PythonReleaseApproval = z.infer<typeof PythonReleaseApprovalSchema>;
export type PythonReleaseHistory = z.infer<typeof PythonReleaseHistorySchema>;
export type PythonPublishedRelease = z.infer<typeof PythonPublishedReleaseSchema>;
