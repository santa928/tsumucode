import { z } from 'zod';
import { BaselineSchema } from './content';
import { BuildIdentitySchema, CommitSchema, DigestSchema } from './schema';
import { hashValue } from './identity';
const DecimalId = z.string().regex(/^[1-9]\d*$/u);
export const BaselineProofSchema = z
  .object({
    schemaVersion: z.literal(1),
    repository: BuildIdentitySchema.shape.repository,
    deploymentId: DecimalId,
    sourceCommit: CommitSchema,
    workflowHeadCommit: CommitSchema,
    runId: DecimalId,
    tag: z.string().regex(/^refs\/tags\/tsumucode-(?:release|app)-[A-Za-z0-9._-]+$/u),
    tagDigest: DigestSchema,
    artifactDigest: DigestSchema,
    artifactDigestFormat: z.enum(['legacy-canonical-dist', 'canonical-dist-v1']),
    projection: z.enum(['authoring', 'public']),
    inventoryDigest: DigestSchema,
    publicContentDigest: DigestSchema,
    publicFiles: z.number().int().positive(),
    observedAt: z.iso.datetime(),
  })
  .strict();
export const CapturedBaselineSchema = z
  .object({ baseline: BaselineSchema, proof: BaselineProofSchema })
  .strict();
const ActualSchema = z
  .object({
    deploymentId: DecimalId,
    workflowHeadCommit: CommitSchema,
    runId: DecimalId,
    siteUrl: z.url(),
  })
  .strict();
export function validateCapturedBaseline(input: unknown) {
  const value = CapturedBaselineSchema.parse(input),
    { baseline, proof } = value;
  if (
    baseline.deploymentId !== proof.deploymentId ||
    baseline.sourceCommit !== proof.sourceCommit ||
    baseline.artifactDigest !== proof.artifactDigest ||
    baseline.sourceRecordDigest !== hashValue(proof) ||
    proof.inventoryDigest !== hashValue(baseline.inventory)
  )
    throw new Error('Captured baseline identity differs from its proof');
  return value;
}
/** Actual deployment must still be the candidate's parent immediately before admission. */
export function confirmCapturedBaseline(input: unknown, actualInput: unknown, repository: string) {
  const { baseline, proof } = validateCapturedBaseline(input),
    actual = ActualSchema.parse(actualInput);
  if (
    proof.repository !== repository ||
    proof.deploymentId !== actual.deploymentId ||
    proof.workflowHeadCommit !== actual.workflowHeadCommit ||
    proof.runId !== actual.runId
  )
    throw new Error('Current deployment changed after baseline capture');
  return baseline;
}
