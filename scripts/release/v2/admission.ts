import { z } from 'zod';
import {
  BuildIdentitySchema,
  CommitSchema,
  InventorySchema,
  PlanSchema,
  RecipeSchema,
} from './schema';
import { hashValue } from './identity';
import { validateCapturedBaseline } from './parent';
import { planRelease } from './plan';
import { ExecutionPlanSchema, createExecutionPlan } from './executionPlan';
import { verifyResults } from './verify';
import { verifyContent } from './content';
const ContextSchema = z
  .object({
    repository: BuildIdentitySchema.shape.repository,
    runId: BuildIdentitySchema.shape.runId,
    sourceCommit: CommitSchema,
    currentMainCommit: CommitSchema,
    recipe: RecipeSchema,
    eventName: z.literal('workflow_dispatch'),
    ref: z.literal('refs/heads/main'),
    attempt: z.number().int().positive(),
    now: z.iso.datetime(),
    jobs: z.record(z.string(), z.enum(['success', 'failure', 'cancelled', 'skipped'])),
  })
  .strict();
export interface AdmissionInput {
  readonly inventory: unknown;
  readonly plan: unknown;
  readonly executionPlan: unknown;
  readonly candidate: unknown;
  readonly results: unknown;
  readonly capturedBaseline: unknown;
  readonly currentBaseline: unknown;
  readonly contentReceipts: unknown;
  readonly context: unknown;
}
/** Trusted caller re-reads actual main/recipe/deployment and native needs statuses. No network self-claims qualify. */
export function qualifyRelease(input: AdmissionInput) {
  const inventory = InventorySchema.parse(input.inventory),
    plan = PlanSchema.parse(input.plan),
    executionPlan = ExecutionPlanSchema.parse(input.executionPlan),
    candidate = BuildIdentitySchema.parse(input.candidate),
    context = ContextSchema.parse(input.context);
  const captured = validateCapturedBaseline(input.capturedBaseline),
    current = validateCapturedBaseline(input.currentBaseline);
  if (
    hashValue(captured.baseline) !== hashValue(current.baseline) ||
    captured.proof.repository !== context.repository ||
    current.proof.repository !== context.repository
  )
    throw new Error('Actual published parent changed');
  if (
    context.sourceCommit !== context.currentMainCommit ||
    candidate.buildJobId !== 'build' ||
    hashValue(candidate.recipe) !== hashValue(context.recipe) ||
    candidate.recipe.sourceCommit !== context.sourceCommit
  )
    throw new Error('Stale source, recipe or producer');
  if (
    hashValue(plan) !== hashValue(planRelease(inventory, captured.baseline)) ||
    hashValue(executionPlan) !== hashValue(createExecutionPlan(plan, executionPlan.testManifests))
  )
    throw new Error('Plan is not derived from actual inventory and source tests');
  const planDigest = hashValue({ plan, executionPlan });
  if (candidate.planDigest !== planDigest)
    throw new Error('Candidate lacks frozen test obligations');
  const producerIds = new Set(executionPlan.requirements.map(({ producerJobId }) => producerJobId));
  // Full native isolation remains mandatory even when no native course is published.
  producerIds.add('boundary');
  if ([...producerIds].some((job) => context.jobs[job] !== 'success'))
    throw new Error('Required native workflow job did not pass');
  const technical = verifyResults(candidate, executionPlan.requirements, input.results, {
    repository: context.repository,
    runId: context.runId,
    sourceCommit: context.sourceCommit,
    workflowDigest: context.recipe.workflowDigest,
    planDigest,
    recipeDigest: hashValue(context.recipe),
    eventName: context.eventName,
    ref: context.ref,
    attempt: context.attempt,
    now: context.now,
  });
  const covered = new Set(executionPlan.requirements.flatMap(({ targets }) => targets));
  const projects: string[] = [];
  for (const target of plan.targets.filter(({ kind }) => kind === 'project')) {
    const lesson = inventory.courses
      .find(({ id }) => id === target.courseId)
      ?.lessons.find(({ id }) => id === target.lessonId);
    const fixtures = plan.targets.filter(
      (row) =>
        row.kind === 'fixture' &&
        row.courseId === target.courseId &&
        row.lessonId === target.lessonId,
    );
    if (
      !lesson?.exercises.length ||
      !fixtures.length ||
      fixtures.some(({ key }) => !covered.has(key)) ||
      !covered.has(target.courseId + '/' + target.lessonId + '/persistence')
    )
      throw new Error('Project lacks actual fixture and persistence coverage');
    projects.push(target.key);
  }
  const content = verifyContent(inventory, input.contentReceipts, captured.baseline);
  return {
    schemaVersion: 1,
    status: 'qualified' as const,
    candidateDigest: hashValue(candidate),
    parent: plan.parent,
    technical,
    content,
    projects,
    qualifiedAt: context.now,
  };
}
