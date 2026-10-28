import type { CompiledCourseArtifacts } from '../../content/compileCourse';
import { javascriptLearnerContentSha256 } from '../javascriptLessonEvaluation';
import { hashValue } from './identity';
import { builtinFixtureDigests, fixtureFiles, fixtureSourceDigest } from './fixtureSource';
import { InventorySchema, RuntimeKindSchema, type ReleaseInventory } from './schema';

function unique(values: readonly string[], scope: string): void {
  if (new Set(values).size !== values.length) throw new Error('Duplicate release target: ' + scope);
}

/** Consume the compiler's same-pass metadata, never rediscover or recompile lessons. */
export function buildInventory(compilations: readonly CompiledCourseArtifacts[]): ReleaseInventory {
  unique(
    compilations.map((item) => item.runtime.id),
    'courses',
  );
  const courses = compilations
    .map(({ runtime, assets, authoringExercises }) => {
      const runner = RuntimeKindSchema.parse(runtime.runnerId);
      if (authoringExercises === undefined)
        throw new Error('Compiler authoring metadata is required');
      unique(
        authoringExercises.map((exercise) => exercise.id),
        runtime.id + '/exercises',
      );
      const authoring = new Map(authoringExercises.map((exercise) => [exercise.id, exercise]));
      const sourceLessons = runtime.phases.flatMap((phase) =>
        phase.chapters.flatMap((chapter) => chapter.lessons),
      );
      unique(
        sourceLessons.map((lesson) => lesson.id),
        runtime.id + '/lessons',
      );
      const lessons = sourceLessons.map((lesson) => {
        const exercises = lesson.exercises.map((exercise) => {
          const full = authoring.get(exercise.id);
          if (!full) throw new Error('Authoring exercise missing: ' + exercise.id);
          unique(
            full.fixtures.map((fixture) => fixture.id),
            exercise.id + '/fixtures',
          );
          const runtimeKind = RuntimeKindSchema.parse(exercise.runtime?.kind ?? runner);
          const python = runtimeKind === 'python';
          return {
            id: exercise.id,
            kind: exercise.kind,
            workspaceId: exercise.workspaceId,
            runtimeKind,
            profile:
              exercise.runtime && 'profile' in exercise.runtime
                ? exercise.runtime.profile
                : 'default',
            capability: exercise.runtime?.capabilityProfile ?? 'html-css',
            digest: hashValue(full),
            ...builtinFixtureDigests(full, python),
            fixtures: full.fixtures
              .map((fixture) => ({
                id: fixture.id,
                expectedStatus: fixture.expectedStatus,
                digest: hashValue(fixture),
                ...(python
                  ? {
                      nativeSourceDigest: fixtureSourceDigest(fixtureFiles(full, fixture.files)),
                      expectedLocalStatus: fixture.expectedLocalStatus ?? fixture.expectedStatus,
                    }
                  : {}),
                sourceDigest: fixtureSourceDigest(
                  fixtureFiles(full, fixture.files),
                  fixture.faultInjection,
                  fixture.inputLines,
                ),
              }))
              .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
          };
        });
        return {
          id: lesson.id,
          kind: lesson.kind,
          learnerDigest: javascriptLearnerContentSha256(lesson, runtime.glossary, assets),
          exerciseDigest: hashValue(exercises),
          navigationDigest: hashValue({
            prerequisites: lesson.prerequisiteLessonIds,
            next: lesson.nextLessonId ?? null,
          }),
          persistenceDigest: hashValue({
            completion: lesson.completion,
            workspaces: exercises.map((exercise) => ({
              id: exercise.id,
              workspaceId: exercise.workspaceId,
            })),
            migrations: runtime.progressMigrations,
          }),
          exercises,
        };
      });
      return {
        id: runtime.id,
        revision: runtime.revision,
        publicationStatus: runtime.publicationStatus,
        runner,
        lessons,
      };
    })
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return InventorySchema.parse({ schemaVersion: 1, fingerprintVersion: 1, courses });
}
