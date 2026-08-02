/** Lessonの開始対象をCatalogと通常学習Routeで共有する純粋境界。 */
import type { LessonOutline, LessonStartTarget } from './types';

export type { LessonStartTarget } from './types';

export interface LessonStartSource {
  readonly id: string;
  readonly kind: LessonOutline['kind'];
  readonly slides: readonly { readonly id: string }[];
  readonly exercises: readonly { readonly id: string }[];
}

/** Lesson種別から最初に開くSlideまたはExerciseを一意に選ぶ。 */
export function lessonStartTarget(lesson: LessonStartSource): LessonStartTarget {
  const firstExercise = lesson.exercises[0];
  if (lesson.kind !== 'standard' && firstExercise !== undefined) {
    return { kind: 'exercise', targetId: firstExercise.id };
  }

  const firstSlide = lesson.slides[0];
  if (firstSlide !== undefined) return { kind: 'slide', targetId: firstSlide.id };
  if (firstExercise !== undefined) return { kind: 'exercise', targetId: firstExercise.id };

  throw new Error(`Lessonに開始できる教材がありません: ${lesson.id}`);
}

/** 型付き開始targetを既存の通常学習Routeへ変換する。 */
export function lessonStartTargetPath(
  courseId: string,
  lessonId: string,
  target: LessonStartTarget,
): string {
  const segment = target.kind === 'slide' ? 'slides' : 'exercises';
  return `/courses/${courseId}/lessons/${lessonId}/${segment}/${target.targetId}`;
}
