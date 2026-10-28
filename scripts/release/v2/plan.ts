import { hashValue } from './identity';
import {
  InventorySchema,
  PlanSchema,
  type ReleaseInventory,
  type ReleasePlan,
  type ReleaseTarget,
} from './schema';

/** All expected targets come from validated compiler inventory, never from test self-reports. */
export function planRelease(input: ReleaseInventory): ReleasePlan {
  const inventory = InventorySchema.parse(input);
  const published = inventory.courses.filter((course) => course.publicationStatus === 'published');
  if (published.length === 0) throw new Error('No published course in the release');
  const targets: ReleaseTarget[] = [];
  for (const course of published)
    for (const lesson of course.lessons) {
      const prefix = course.id + '/' + lesson.id;
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
          for (const fixtureId of [
            'solution',
            'starter',
            ...exercise.fixtures.map((fixture) => fixture.id),
          ]) {
            targets.push({
              key: prefix + '/' + exercise.id + '/' + fixtureId + '/' + mode,
              kind: 'fixture',
              courseId: course.id,
              lessonId: lesson.id,
              exerciseId: exercise.id,
              fixtureId,
              runtimeKind: exercise.runtimeKind,
              mode,
              inputDigest: exercise.digest,
            });
          }
      }
    }
  if (new Set(targets.map((target) => target.key)).size !== targets.length)
    throw new Error('Duplicate release target keys');
  return PlanSchema.parse({
    schemaVersion: 1,
    inventoryDigest: hashValue(inventory),
    publishedCourses: published.map((course) => course.id),
    targets,
  });
}
