import { z } from 'zod';
import { BuildIdentitySchema, CommitSchema, DigestSchema } from './schema';
const DecimalId = z.string().regex(/^[1-9]\d*$/u);
/** One compact automatically generated record, separate from app bytes and historical reviews. */
export const AppRecordSchema = z
  .object({
    schemaVersion: z.literal(2),
    repository: BuildIdentitySchema.shape.repository,
    workflowHeadCommit: CommitSchema,
    candidate: BuildIdentitySchema,
    deploymentId: DecimalId,
    siteUrl: z.url(),
    publicContentDigest: DigestSchema,
    inventoryDigest: DigestSchema,
    state: z.enum(['deployed-unverified', 'deployed-verification-failed', 'verified']),
    qualificationDigest: DigestSchema,
    smokeDigest: DigestSchema.nullable(),
    observedAt: z.iso.datetime(),
  })
  .strict()
  .superRefine((record, context) => {
    if (
      record.repository !== record.candidate.repository ||
      (record.state === 'verified' && record.smokeDigest === null)
    )
      context.addIssue({ code: 'custom', message: 'Unbound or unverified app record' });
  });
export type AppRecord = z.infer<typeof AppRecordSchema>;
export interface AppDeploymentContext {
  readonly repository: string;
  readonly deploymentId: string;
  readonly workflowHeadCommit: string;
  readonly runId: string;
  readonly siteUrl: string;
}
/** A lagging, failed-smoke or unrelated tag cannot become the next content baseline. */
export function parseAppBinding(
  message: string,
  targetCommit: string,
  actual: AppDeploymentContext,
) {
  const record = AppRecordSchema.parse(JSON.parse(message) as unknown);
  if (
    record.state !== 'verified' ||
    record.candidate.recipe.sourceCommit !== CommitSchema.parse(targetCommit) ||
    record.repository !== actual.repository ||
    record.deploymentId !== actual.deploymentId ||
    record.workflowHeadCommit !== actual.workflowHeadCommit ||
    record.candidate.runId !== actual.runId ||
    new URL(record.siteUrl).href !== new URL(actual.siteUrl).href
  )
    throw new Error('App record does not belong to the verified actual deployment');
  return {
    sourceCommit: record.candidate.recipe.sourceCommit,
    workflowHeadCommit: record.workflowHeadCommit,
    runId: record.candidate.runId,
    artifactDigest: record.candidate.artifactDigest,
    artifactDigestFormat: 'canonical-dist-v1' as const,
    pageUrl: record.siteUrl,
    // Historical field: the single sanitized tree includes draft indexes, like the original site.
    projection: 'authoring' as const,
    inventoryDigest: record.inventoryDigest,
    publicContentDigest: record.publicContentDigest,
  };
}
