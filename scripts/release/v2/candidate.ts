import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import {
  BuildIdentitySchema,
  CommitSchema,
  JobKeySchema,
  PlanSchema,
  RecipeSchema,
} from './schema';
import { hashArtifact, hashBytes, hashValue, repositoryEnvironment } from './identity';
import { createExecutionPlan, ExecutionPlanSchema } from './executionPlan';

const exec = promisify(execFile);
const BuildContextSchema = z
  .object({
    repository: z.string().min(1),
    runId: z.string().regex(/^[1-9]\d*$/u),
    jobId: JobKeySchema,
    attempt: z.number().int().positive(),
    sourceCommit: CommitSchema,
    eventName: z.literal('workflow_dispatch'),
    ref: z.literal('refs/heads/main'),
  })
  .strict();

/** Read the actual immutable checkout; never accept a caller-written recipe or dirty source. */
export async function readRecipe(root: string, sourceCommit: string, basePath: string) {
  const gitEnvironment = await repositoryEnvironment(root);
  const git = async (...args: string[]) =>
    (await exec('git', args, { cwd: root, encoding: 'utf8', env: gitEnvironment })).stdout.trim();
  if ((await git('rev-parse', 'HEAD')) !== CommitSchema.parse(sourceCommit))
    throw new Error('Release checkout differs from authorized source');
  if (await git('status', '--porcelain', '--untracked-files=all'))
    throw new Error('Release checkout has dirty or untracked input');
  if (process.version !== 'v24.18.0') throw new Error('Release requires fixed Node24.18.0');
  const sourceTree = await git('rev-parse', 'HEAD^{tree}');
  const lockDigest = hashBytes(await readFile(path.join(root, 'package-lock.json')));
  const workflowDigest = hashBytes(await readFile(path.join(root, '.github/workflows/pages.yml')));
  return RecipeSchema.parse({
    sourceCommit,
    sourceTree,
    lockDigest,
    workflowDigest,
    policyDigest: hashValue({ version: 1, protocol: 'single-run-v2', sourceTree }),
    toolchain: process.version + ':' + hashBytes(await readFile(path.join(root, 'Dockerfile'))),
    basePath,
  });
}

export async function createCandidate(
  root: string,
  directory: string,
  planInput: unknown,
  artifactId: string,
  contextInput: unknown,
  basePath = '/',
  executionPlanInput?: unknown,
) {
  const context = BuildContextSchema.parse(contextInput);
  const plan = PlanSchema.parse(planInput);
  const executionPlan =
    executionPlanInput === undefined ? undefined : ExecutionPlanSchema.parse(executionPlanInput);
  if (
    executionPlan &&
    hashValue(executionPlan) !==
      hashValue(
        createExecutionPlan(plan, executionPlan.testManifests, executionPlan.publicContentDigest),
      )
  )
    throw new Error('Unbound execution plan');
  const recipe = await readRecipe(root, context.sourceCommit, basePath);
  const artifact = await hashArtifact(directory);
  return BuildIdentitySchema.parse({
    schemaVersion: 1,
    repository: context.repository,
    runId: context.runId,
    buildJobId: context.jobId,
    buildAttempt: context.attempt,
    artifactDigest: artifact.digest,
    artifactId,
    planDigest: executionPlan ? hashValue({ plan, executionPlan }) : hashValue(plan),
    recipe,
  });
}
