import { z } from 'zod';
import {
  PostDeployVerificationSchema,
  PublishedReleaseSchema,
  ReleaseApprovalSchema,
  ReleaseCandidateSchema,
  ReleaseHistorySchema,
  Sha256Schema,
  CommitShaSchema,
} from './releaseSchema';
import { resolveReleaseCourseContract, type ReleaseCourseId } from './releaseCourseContracts';

import {
  TypescriptReleaseApprovalSchema,
  TypescriptReleaseHistorySchema,
  type TypescriptReleaseApproval,
  type TypescriptReleaseHistory,
  type TypescriptPublishedRelease,
} from './typescriptReleaseSchema';

const jsContract = resolveReleaseCourseContract('javascript');
const HashBindingSchema = z.union([Sha256Schema, z.literal('draft')]);
const LearningBindingShape = {
  draftSourceCommit: z.union([CommitShaSchema, z.literal('draft')]),
  draftCanonicalDistSha256: HashBindingSchema,
  normalizedLearningInputSha256: HashBindingSchema,
};

/** JS品質記録は同名の別file/HTML記録へ差し替えられないliteral pathに固定する。 */
function record<const Path extends string>(recordPath: Path) {
  return z.object({ path: z.literal(recordPath), sha256: HashBindingSchema }).strict();
}

export const JavascriptReleaseApprovalSchema = ReleaseApprovalSchema.extend({
  schemaVersion: z.literal(2),
  courseId: z.literal('javascript'),
  records: z
    .object({
      contentReview: record(jsContract.records.contentReview),
      visualReview: record(jsContract.records.visualReview),
      accessibilityManual: record(jsContract.records.accessibilityManual),
      agentLearning: record(jsContract.records.agentLearning),
      inputValidity: record(jsContract.records.inputValidity),
      releaseChecklist: record(jsContract.records.releaseChecklist),
      finalCodeReview: record(jsContract.records.finalCodeReview),
    })
    .strict(),
}).strict();

export const JavascriptReleaseCandidateSchema = ReleaseCandidateSchema.extend({
  ...LearningBindingShape,
  courseId: z.literal('javascript'),
  syntheticProgressBundlePath: z.literal(jsContract.syntheticProgressBundlePath),
}).strict();

export const JavascriptPublishedReleaseSchema = PublishedReleaseSchema.extend({
  draftSourceCommit: CommitShaSchema,
  draftCanonicalDistSha256: Sha256Schema,
  normalizedLearningInputSha256: Sha256Schema,
  courseId: z.literal('javascript'),
  syntheticProgressBundlePath: z.literal(jsContract.syntheticProgressBundlePath),
  postDeployVerificationPath: z
    .string()
    .regex(/^docs\/quality\/post-deploy\/javascript\/\d{4}-\d{2}-\d{2}\.\d+\.yaml$/u),
}).strict();

export const JavascriptReleaseHistorySchema = z
  .object({
    schemaVersion: z.literal(2),
    courseId: z.literal('javascript'),
    releases: z.array(JavascriptPublishedReleaseSchema),
    candidate: JavascriptReleaseCandidateSchema,
  })
  .strict();

export const JavascriptPostDeployVerificationSchema = PostDeployVerificationSchema.omit({
  environmentApprovalStatus: true,
})
  .extend({
    schemaVersion: z.literal(2),
    courseId: z.literal('javascript'),
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

export type JavascriptReleaseApproval = z.infer<typeof JavascriptReleaseApprovalSchema>;
export type JavascriptReleaseHistory = z.infer<typeof JavascriptReleaseHistorySchema>;
export type JavascriptPublishedRelease = z.infer<typeof JavascriptPublishedReleaseSchema>;
export type CourseReleaseApproval =
  z.infer<typeof ReleaseApprovalSchema> | JavascriptReleaseApproval | TypescriptReleaseApproval;
export type CourseReleaseHistory =
  z.infer<typeof ReleaseHistorySchema> | JavascriptReleaseHistory | TypescriptReleaseHistory;
export type CoursePublishedRelease =
  z.infer<typeof PublishedReleaseSchema> | JavascriptPublishedRelease | TypescriptPublishedRelease;

/** selected Courseのstrict schemaだけで承認を読む。混在/legacy JSを拒否する。 */
export function parseCourseReleaseApproval(
  courseId: 'javascript',
  input: unknown,
): JavascriptReleaseApproval;
export function parseCourseReleaseApproval(
  courseId: ReleaseCourseId,
  input: unknown,
): CourseReleaseApproval;
export function parseCourseReleaseApproval(
  courseId: ReleaseCourseId,
  input: unknown,
): CourseReleaseApproval {
  const contract = resolveReleaseCourseContract(courseId);
  if (contract.courseId === 'typescript') return TypescriptReleaseApprovalSchema.parse(input);
  return contract.courseId === 'javascript'
    ? JavascriptReleaseApprovalSchema.parse(input)
    : ReleaseApprovalSchema.parse(input);
}

/** selected Courseの履歴を一意なschemaで読み、他Courseのhistoryを受け入れない。 */
export function parseCourseReleaseHistory(
  courseId: 'javascript',
  input: unknown,
): JavascriptReleaseHistory;
export function parseCourseReleaseHistory(
  courseId: ReleaseCourseId,
  input: unknown,
): CourseReleaseHistory;
export function parseCourseReleaseHistory(
  courseId: ReleaseCourseId,
  input: unknown,
): CourseReleaseHistory {
  const contract = resolveReleaseCourseContract(courseId);
  if (contract.courseId === 'typescript') return TypescriptReleaseHistorySchema.parse(input);
  return contract.courseId === 'javascript'
    ? JavascriptReleaseHistorySchema.parse(input)
    : ReleaseHistorySchema.parse(input);
}
