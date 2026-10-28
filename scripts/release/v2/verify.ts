import { z } from 'zod';
import { hashArtifact, hashValue } from './identity';
import {
  BuildIdentitySchema,
  CommitSchema,
  DigestSchema,
  IdSchema,
  SuiteResultSchema,
} from './schema';

export const SuiteRequirementSchema = z
  .object({
    suite: IdSchema,
    inputDigest: DigestSchema,
    targets: z.array(z.string().min(1)).min(1),
  })
  .strict();
export type SuiteRequirement = z.infer<typeof SuiteRequirementSchema>;
const ContextSchema = z
  .object({
    repository: z.string().min(1),
    runId: z.string().regex(/^[1-9]\d*$/u),
    sourceCommit: CommitSchema,
    workflowDigest: DigestSchema,
    planDigest: DigestSchema,
    recipeDigest: DigestSchema,
    eventName: z.literal('workflow_dispatch'),
    ref: z.literal('refs/heads/main'),
    attempt: z.number().int().positive(),
    now: z.iso.datetime(),
  })
  .strict();

function assertSetEqual(
  actual: readonly string[],
  expected: readonly string[],
  label: string,
): void {
  const values = new Set(actual);
  if (
    values.size !== actual.length ||
    expected.length !== new Set(expected).size ||
    values.size !== expected.length ||
    expected.some((value) => !values.has(value))
  )
    throw new Error('Incomplete, duplicate or unexpected release evidence: ' + label);
}

/** Verify trusted same-run producers; success here is technical qualification, never owner approval. */
export function verifyResults(
  candidateInput: unknown,
  requirementInput: unknown,
  resultInput: unknown,
  contextInput: unknown,
) {
  const candidate = BuildIdentitySchema.parse(candidateInput);
  const requirements = z.array(SuiteRequirementSchema).min(1).parse(requirementInput);
  const results = z.array(SuiteResultSchema).parse(resultInput);
  const context = ContextSchema.parse(contextInput);
  if (
    candidate.repository !== context.repository ||
    candidate.runId !== context.runId ||
    candidate.recipe.sourceCommit !== context.sourceCommit ||
    candidate.recipe.workflowDigest !== context.workflowDigest ||
    candidate.planDigest !== context.planDigest ||
    hashValue(candidate.recipe) !== context.recipeDigest ||
    candidate.buildAttempt > context.attempt
  )
    throw new Error('Candidate does not belong to the trusted release context');
  assertSetEqual(
    results.map((result) => result.suite),
    requirements.map((item) => item.suite),
    'suites',
  );
  const candidateDigest = hashValue(candidate);
  const recipeDigest = hashValue(candidate.recipe);
  const now = Date.parse(context.now);
  for (const requirement of requirements) {
    const result = results.find((result) => result.suite === requirement.suite)!;
    if (
      result.status !== 'passed' ||
      result.candidateDigest !== candidateDigest ||
      result.recipeDigest !== recipeDigest ||
      result.inputDigest !== requirement.inputDigest ||
      result.runId !== context.runId ||
      result.verificationAttempt < candidate.buildAttempt ||
      result.verificationAttempt > context.attempt
    )
      throw new Error('Failed, pending or mismatched evidence: ' + requirement.suite);
    const start = Date.parse(result.startedAt),
      finish = Date.parse(result.finishedAt),
      expiry = Date.parse(result.expiresAt);
    if (finish < start || finish > now || expiry <= now || expiry <= finish)
      throw new Error('Expired or invalid evidence clock: ' + requirement.suite);
    assertSetEqual(result.targets, requirement.targets, requirement.suite + '/targets');
  }
  return {
    status: 'technical-passed' as const,
    candidateDigest,
    buildAttempt: candidate.buildAttempt,
    verificationAttempts: [...new Set(results.map((result) => result.verificationAttempt))].sort(
      (a, b) => a - b,
    ),
    suites: requirements.map((item) => item.suite),
  };
}

/** A successful test cannot qualify different bytes or replace the original build identity. */
export async function verifyCandidateArtifact(
  candidateInput: unknown,
  directory: string,
): Promise<void> {
  const candidate = BuildIdentitySchema.parse(candidateInput);
  if ((await hashArtifact(directory)).digest !== candidate.artifactDigest)
    throw new Error('Artifact bytes changed after build');
}
