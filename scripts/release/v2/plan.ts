import { hashValue } from './identity';
import { BaselineSchema } from './content';
import {
  InventorySchema,
  PlanSchema,
  type ReleaseInventory,
  type ReleasePlan,
  type ReleaseTarget,
} from './schema';

/** All expected targets come from validated compiler inventory, never from test self-reports. */
export function planRelease(input: ReleaseInventory, baselineInput?: unknown): ReleasePlan {
  const inventory = InventorySchema.parse(input);
  const published = inventory.courses.filter((course) => course.publicationStatus === 'published');
  if (published.length === 0) throw new Error('No published course in the release');
  const baseline = baselineInput === undefined ? undefined : BaselineSchema.parse(baselineInput);
  const previous = new Map(
    baseline?.inventory.courses
      .filter((course) => course.publicationStatus === 'published')
      .flatMap((course) =>
        course.lessons.map(
          (lesson) => [course.id + '/' + lesson.id, lesson.learnerDigest] as const,
        ),
      ) ?? [],
  );
  const targets: ReleaseTarget[] = [];
  for (const course of published)
    for (const lesson of course.lessons) {
      const prefix = course.id + '/' + lesson.id;
      if (previous.get(prefix) !== lesson.learnerDigest) {
        targets.push({
          key: prefix + '/content',
          kind: 'content',
          courseId: course.id,
          lessonId: lesson.id,
          inputDigest: lesson.learnerDigest,
        });
        for (const role of ['novice', 'recovery', 'maker'] as const)
          targets.push({
            key: prefix + '/learning/' + role,
            kind: 'learning',
            courseId: course.id,
            lessonId: lesson.id,
            role,
            inputDigest: lesson.learnerDigest,
          });
      }
      if (lesson.kind !== 'standard')
        targets.push({
          key: prefix + '/project',
          kind: 'project',
          courseId: course.id,
          lessonId: lesson.id,
          inputDigest: hashValue([
            lesson.learnerDigest,
            lesson.exerciseDigest,
            lesson.persistenceDigest,
          ]),
        });
      targets.push({
        key: prefix + '/persistence',
        kind: 'persistence',
        courseId: course.id,
        lessonId: lesson.id,
        inputDigest: lesson.persistenceDigest,
      });
      for (const exercise of lesson.exercises) {
        const modes =
          exercise.runtimeKind === 'python'
            ? (['pyodide', 'cpython'] as const)
            : exercise.runtimeKind === 'next'
              ? (['local'] as const)
              : (['browser'] as const);
        for (const mode of modes)
          for (const fixture of [
            {
              id: 'solution',
              caseKind: 'solution' as const,
              sourceDigest: exercise.solutionSourceDigest,
              expectedStatus: 'pass' as const,
            },
            {
              id: 'starter',
              caseKind: 'starter' as const,
              sourceDigest: exercise.starterSourceDigest,
              expectedStatus: 'not-pass' as const,
            },
            ...exercise.fixtures.map((fixture) => ({
              id: fixture.id,
              caseKind: 'authored' as const,
              sourceDigest: fixture.sourceDigest,
              expectedStatus: fixture.expectedStatus,
            })),
          ]) {
            targets.push({
              key:
                prefix + '/' + exercise.id + '/' + fixture.caseKind + '/' + fixture.id + '/' + mode,
              kind: 'fixture',
              courseId: course.id,
              lessonId: lesson.id,
              exerciseId: exercise.id,
              fixtureId: fixture.id,
              caseKind: fixture.caseKind,
              runtimeKind: exercise.runtimeKind,
              mode,
              inputDigest: exercise.digest,
              sourceDigest: fixture.sourceDigest,
              expectedStatus: fixture.expectedStatus,
            });
          }
      }
    }
  if (new Set(targets.map((target) => target.key)).size !== targets.length)
    throw new Error('Duplicate release target keys');
  return PlanSchema.parse({
    schemaVersion: 1,
    inventoryDigest: hashValue(inventory),
    parent: baseline
      ? { deploymentId: baseline.deploymentId, sourceRecordDigest: baseline.sourceRecordDigest }
      : null,
    publishedCourses: published.map((course) => course.id),
    targets,
  });
}
