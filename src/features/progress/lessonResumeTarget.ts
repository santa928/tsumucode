/** 再開時だけ端末保存値を参照し、通常の開始点と直接URLの契約を分離する。 */
import { lessonStartTarget } from '../../core/content/lessonStart';
import type { CourseIndex, LessonOutline, LessonStartTarget } from '../../core/content/types';
import type { CourseProgress, ExerciseDraft } from '../../core/persistence/contracts';

/**
 * 現行Lesson内の未完了Draftを優先し、閲覧途中・未合格Exercise・開始点の順で解決する。
 * workspace読取キーと所有ID/revisionを照合し、別Lessonの保存値へ飛ばない。保存は行わない。
 */
export function lessonResumeTarget(
  course: CourseIndex,
  lesson: LessonOutline,
  progress: CourseProgress | undefined,
  drafts: ReadonlyMap<string, ExerciseDraft | undefined>,
): LessonStartTarget {
  const savedLesson =
    progress?.courseId === course.id && progress.contentRevision === course.revision
      ? progress.lessons[lesson.id]
      : undefined;
  const lessonProgress = savedLesson?.lessonId === lesson.id ? savedLesson : undefined;
  const passed = new Set(lessonProgress?.passedExerciseIds ?? []);
  let latest: { readonly targetId: string; readonly updatedAt: number } | undefined;
  for (const exercise of lesson.exercises) {
    const draft = drafts.get(exercise.workspaceId);
    if (
      draft === undefined ||
      draft.courseId !== course.id ||
      draft.contentRevision !== course.revision ||
      draft.lessonId !== lesson.id ||
      draft.exerciseId !== exercise.id ||
      draft.workspaceId !== exercise.workspaceId ||
      passed.has(exercise.id)
    )
      continue;
    const updatedAt = Date.parse(draft.updatedAt);
    // 同時刻は先に現れた教材を保ち、Mapの登録順で再開先を変えない。
    if (Number.isFinite(updatedAt) && (latest === undefined || updatedAt > latest.updatedAt)) {
      latest = { targetId: exercise.id, updatedAt };
    }
  }
  if (latest !== undefined) return { kind: 'exercise', targetId: latest.targetId };

  if (lesson.kind === 'standard') {
    const finishedReading =
      lessonProgress?.viewedSlideIds.includes(lesson.completion.finalSlideId) ?? false;
    const currentSlide = lesson.slides.find(({ id }) => id === lessonProgress?.currentSlideId);
    if (!finishedReading) {
      return currentSlide === undefined
        ? lessonStartTarget(lesson)
        : { kind: 'slide', targetId: currentSlide.id };
    }
  }
  const unfinishedExercise = lesson.exercises.find(({ id }) => !passed.has(id));
  if (unfinishedExercise !== undefined) {
    return { kind: 'exercise', targetId: unfinishedExercise.id };
  }
  return lessonStartTarget(lesson);
}
