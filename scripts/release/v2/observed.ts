import { InventorySchema, PlanSchema } from './schema';
import { createExecutionPlan, ExecutionPlanSchema } from './executionPlan';
import { hashValue } from './identity';
import { verifyTestExecution } from './testManifest';
import { readBrowserCoverage } from './browserCoverage';
import { readPersistenceCoverage } from './persistenceCoverage';
/** Independent declared tests and actual Source/status observations must both match. */
export function observeTestSuite(
  suite: string,
  report: unknown,
  planInput: unknown,
  executionInput: unknown,
  inventoryInput: unknown,
): string[] {
  const plan = PlanSchema.parse(planInput),
    execution = ExecutionPlanSchema.parse(executionInput),
    inventory = InventorySchema.parse(inventoryInput);
  if (
    hashValue(execution) !==
    hashValue(createExecutionPlan(plan, execution.testManifests, execution.publicContentDigest))
  )
    throw new Error('Unbound execution plan');
  const manifest = execution.testManifests.find((item) => item.suite === suite),
    requirement = execution.requirements.find((item) => item.suite === suite);
  if (!manifest || !requirement) throw new Error('Unknown test suite');
  const targets = verifyTestExecution(report, manifest);
  const required = new Set(requirement.targets);
  targets.push(
    ...plan.targets
      .filter(
        (target) =>
          target.kind === 'learning-engine' &&
          required.has(target.key) &&
          target.engine === manifest.project &&
          manifest.tests.some((test) =>
            test.lessonKeys?.includes(target.courseId + '/' + target.lessonId),
          ),
      )
      .map((target) => target.key),
  );
  const fixtures = plan.targets.filter(
    (target) => target.kind === 'fixture' && required.has(target.key),
  );
  if (fixtures.length) targets.push(...readBrowserCoverage(report, fixtures, manifest.project));
  const persistence = plan.targets.filter(
    (target) => target.kind === 'persistence' && required.has(target.key),
  );
  if (persistence.length)
    targets.push(
      ...readPersistenceCoverage(
        report,
        persistence,
        inventory.courses.map(({ id }) => id),
        [
          ...new Set(
            inventory.courses.flatMap((course) =>
              course.lessons.flatMap((lesson) =>
                lesson.exercises.map((exercise) => course.id + ':' + exercise.workspaceId),
              ),
            ),
          ),
        ].sort(),
      ),
    );
  if (
    new Set(targets).size !== targets.length ||
    targets.length !== required.size ||
    targets.some((target) => !required.has(target))
  )
    throw new Error('Incomplete observed suite');
  return targets.sort();
}
