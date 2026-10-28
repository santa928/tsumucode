import { z } from 'zod';
import { hashValue } from './identity';
import { BuildIdentitySchema, SuiteResultSchema } from './schema';
import { SuiteRequirementSchema, verifyCandidateArtifact } from './verify';

const ExecutionContextSchema = z
  .object({
    runId: z.string().regex(/^[1-9]\d*$/u),
    jobId: z.string().regex(/^[1-9]\d*$/u),
    attempt: z.number().int().positive(),
  })
  .strict();
export interface SuiteObservation {
  readonly targets: readonly string[];
  readonly report: unknown;
}
/** Trusted adapters report observed coverage, not the requested target list. Failure emits no receipt. */
export async function executeSuite(
  candidateInput: unknown,
  requirementInput: unknown,
  contextInput: unknown,
  directory: string,
  driver: () => Promise<SuiteObservation>,
) {
  const candidate = BuildIdentitySchema.parse(candidateInput);
  const requirement = SuiteRequirementSchema.parse(requirementInput);
  const context = ExecutionContextSchema.parse(contextInput);
  if (candidate.runId !== context.runId || candidate.buildAttempt > context.attempt)
    throw new Error('Wrong run or verification attempt');
  if (new Set(requirement.targets).size !== requirement.targets.length)
    throw new Error('Duplicate required targets');
  await verifyCandidateArtifact(candidate, directory);
  const startedAt = new Date().toISOString();
  const observation = await driver();
  const targets = z.array(z.string().min(1)).parse(observation.targets);
  if (
    new Set(targets).size !== targets.length ||
    targets.length !== requirement.targets.length ||
    requirement.targets.some((target) => !targets.includes(target))
  )
    throw new Error('Incomplete or unexpected observed coverage');
  await verifyCandidateArtifact(candidate, directory);
  const finish = new Date();
  return SuiteResultSchema.parse({
    schemaVersion: 1,
    suite: requirement.suite,
    candidateDigest: hashValue(candidate),
    inputDigest: requirement.inputDigest,
    recipeDigest: hashValue(candidate.recipe),
    runId: context.runId,
    jobId: context.jobId,
    verificationAttempt: context.attempt,
    status: 'passed',
    targets,
    startedAt,
    finishedAt: finish.toISOString(),
    expiresAt: new Date(finish.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    reportDigest: hashValue(observation.report),
  });
}
