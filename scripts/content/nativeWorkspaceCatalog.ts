import type { CompiledCourseArtifacts } from './compileCourse';
import {
  createNextWorkspaceRegistry,
  nextContractForExercise,
  type CompiledNativeCatalog,
} from '../local/next-project-protocol.mjs';

/** Only compiler-validated declarations may select an existing finite execution contract. */
export function buildNativeWorkspaceCatalog(
  compilations: readonly CompiledCourseArtifacts[],
): CompiledNativeCatalog {
  const declarations = new Map<string, CompiledNativeCatalog['workspaces'][number]>();
  for (const { runtime } of compilations) {
    for (const phase of runtime.phases) {
      for (const chapter of phase.chapters) {
        for (const lesson of chapter.lessons) {
          for (const exercise of lesson.exercises) {
            if (exercise.runtime?.kind !== 'next') continue;
            const contract = nextContractForExercise(
              exercise.workspaceId,
              exercise.runtime.contract,
            );
            if (!contract) throw new Error('Unknown Native execution contract');
            const row = { id: exercise.workspaceId, courseId: runtime.id, template: contract.goal };
            const existing = declarations.get(row.id);
            if (
              existing &&
              (existing.courseId !== row.courseId || existing.template !== row.template)
            )
              throw new Error('Conflicting Native workspace declaration');
            declarations.set(row.id, row);
          }
        }
      }
    }
  }
  const catalog: CompiledNativeCatalog = {
    schemaVersion: 1,
    mode: 'compiled',
    workspaces: [...declarations.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
  };
  createNextWorkspaceRegistry(catalog);
  return catalog;
}
