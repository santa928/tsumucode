/** 再開時だけ端末保存値を参照し、通常の開始点と直接URLの契約を分離する。 */
import { lessonStartTarget } from '../../core/content/lessonStart';
import type { CourseIndex, LessonOutline, LessonStartTarget } from '../../core/content/types';
import type { CourseProgress, ExerciseDraft } from '../../core/persistence/contracts';

/** 読書端末では最終Slide閲覧後も解説を開き、旧revisionや別Lessonの保存値は使わない。 */
export function lessonReadingTarget(
  course: CourseIndex,
  lesson: LessonOutline,
  progress: CourseProgress | undefined,
): LessonStartTarget | undefined {
  const savedLesson =
    progress?.courseId === course.id && progress.contentRevision === course.revision
      ? progress.lessons[lesson.id]
      : undefined;
  const savedSlideId = savedLesson?.lessonId === lesson.id ? savedLesson.currentSlideId : undefined;
  const slide = lesson.slides.find(({ id }) => id === savedSlideId) ?? lesson.slides[0];
  return slide === undefined ? undefined : { kind: 'slide', targetId: slide.id };
}

/** 所有ID/revisionと読取キーが一致する、現行Lessonの最新未完了Draftだけを返す。 */
export function findLessonResumeDraft(
  course: CourseIndex,
  lesson: LessonOutline,
  progress: CourseProgress | undefined,
  drafts: ReadonlyMap<string, ExerciseDraft | undefined>,
): ExerciseDraft | undefined {
  const savedLesson =
    progress?.courseId === course.id && progress.contentRevision === course.revision
      ? progress.lessons[lesson.id]
      : undefined;
  const lessonProgress = savedLesson?.lessonId === lesson.id ? savedLesson : undefined;
  const passed = new Set(lessonProgress?.passedExerciseIds ?? []);
  let latest: { readonly draft: ExerciseDraft; readonly updatedAt: number } | undefined;
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
      latest = { draft, updatedAt };
    }
  }
  return latest?.draft;
}

/** 有効な未完了Draft、閲覧途中、未合格Exercise、開始点の順で再開先を解決する。 */
export function lessonResumeTarget(
  course: CourseIndex,
  lesson: LessonOutline,
  progress: CourseProgress | undefined,
  drafts: ReadonlyMap<string, ExerciseDraft | undefined>,
): LessonStartTarget {
  const draft = findLessonResumeDraft(course, lesson, progress, drafts);
  if (draft !== undefined) return { kind: 'exercise', targetId: draft.exerciseId };
  const savedLesson =
    progress?.courseId === course.id && progress.contentRevision === course.revision
      ? progress.lessons[lesson.id]
      : undefined;
  const lessonProgress = savedLesson?.lessonId === lesson.id ? savedLesson : undefined;
  const passed = new Set(lessonProgress?.passedExerciseIds ?? []);

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
