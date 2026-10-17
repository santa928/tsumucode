/** Indexだけで共有コードのGuided工程を識別し、通常Lessonや単独制作と区別する。 */
import type { CourseIndex, LessonOutline } from '../../core/content/types';

interface SharedGuidedProjectStages {
  readonly workspaceId: string;
  readonly lessons: readonly LessonOutline[];
}

/** 同一workspaceを複数Lessonで使うGuided制作を、著者の教材順で返す。 */
export function sharedGuidedProjectStages(
  course: CourseIndex,
): readonly SharedGuidedProjectStages[] {
  const groups = new Map<string, Map<string, LessonOutline>>();
  for (const phase of course.phases) {
    for (const chapter of phase.chapters) {
      for (const lesson of chapter.lessons) {
        if (lesson.kind !== 'guided-project') continue;
        for (const exercise of lesson.exercises) {
          let stages = groups.get(exercise.workspaceId);
          if (stages === undefined) {
            stages = new Map();
            groups.set(exercise.workspaceId, stages);
          }
          stages.set(lesson.id, lesson);
        }
      }
    }
  }
  return [...groups]
    .filter(([, lessons]) => lessons.size > 1)
    .map(([workspaceId, lessons]) => ({ workspaceId, lessons: [...lessons.values()] }));
}
