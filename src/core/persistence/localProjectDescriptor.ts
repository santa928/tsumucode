/** Catalogに教材を追加せず、Local作業台の記録を既存JSON移行で保持するための識別子。 */
import type { CourseMigrationDescriptor } from './contentProgressMigration';

export const LOCAL_PROJECT = {
  courseId: 'local-vite-workspace',
  chapterId: 'local-vite-ch01',
  lessonId: 'local-vite-l01',
  exerciseId: 'local-vite-e01',
  workspaceId: 'local-vite-heading',
  ruleId: 'local-vite-heading-rule',
  requirementId: 'local-vite-heading-requirement',
  revision: 'local-vite-1',
} as const;

export const localProjectDescriptor: CourseMigrationDescriptor = {
  id: LOCAL_PROJECT.courseId,
  revision: LOCAL_PROJECT.revision,
  progressMigrations: [],
  entityIds: {
    chapter: [LOCAL_PROJECT.chapterId],
    lesson: [LOCAL_PROJECT.lessonId],
    exercise: [LOCAL_PROJECT.exerciseId],
    workspace: [LOCAL_PROJECT.workspaceId],
    rule: [LOCAL_PROJECT.ruleId],
    slide: [],
    hint: [],
    checklist: [],
  },
  phases: [
    {
      chapters: [
        {
          lessons: [{ id: LOCAL_PROJECT.lessonId, exercises: [{ id: LOCAL_PROJECT.exerciseId }] }],
        },
      ],
    },
  ],
};
