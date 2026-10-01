import type { CourseIndex, LessonOutline } from '../../core/content/types';
import type { ReadingPosition } from './readingState';
import { buildLibrarySlidePath } from './courseSlideSequence';

/** 改訂済みLessonだけを試す入口。公開Courseの条件とは別に、有限のIDで定義する。 */
export const READING_PILOT_LESSONS = [
  { courseId: 'html-css', lessonId: 'html-css-ch00-l01' },
  { courseId: 'javascript', lessonId: 'javascript-ch00-l01' },
  { courseId: 'javascript', lessonId: 'javascript-ch03-l05' },
  { courseId: 'javascript', lessonId: 'javascript-ch07-l01' },
  { courseId: 'javascript', lessonId: 'javascript-ch07-l02' },
  { courseId: 'javascript', lessonId: 'javascript-ch07-l03' },
  { courseId: 'javascript', lessonId: 'javascript-ch07-l04' },
  { courseId: 'javascript', lessonId: 'javascript-ch08-l01' },
  { courseId: 'javascript', lessonId: 'javascript-ch08-l02' },
  { courseId: 'javascript', lessonId: 'javascript-ch08-l03' },
  { courseId: 'javascript', lessonId: 'javascript-ch08-l04' },
  { courseId: 'javascript', lessonId: 'javascript-ch09-l01' },
] as const;

/** Courseの集計や公開状態を変更せず、読書用の著者順outlineを返す。 */
export function readingLessons(course: CourseIndex, pilot: boolean): readonly LessonOutline[] {
  return course.phases
    .flatMap((phase) => phase.chapters.flatMap((chapter) => chapter.lessons))
    .filter(
      (lesson) =>
        !pilot ||
        READING_PILOT_LESSONS.some(
          (target) => target.courseId === course.id && target.lessonId === lesson.id,
        ),
    );
}

/** 試用中は、未改訂Course目次へ誘導しない。 */
export function readingIndexPath(courseId: string, pilot: boolean): string {
  return pilot ? '/library/pilot' : `/library/${courseId}`;
}

/** 同じLessonの本文から通読routeを組み立てる。 */
export function readingLessonPath(courseId: string, lessonId: string, pilot: boolean): string {
  return `${pilot ? '/library/pilot' : '/library'}/${courseId}/lessons/${lessonId}/read`;
}

/** 同じ教材の1枚表示を残し、試用の有限routeからは離れない。 */
export function readingSlidePath(
  courseId: string,
  lessonId: string,
  slideId: string,
  pilot: boolean,
): string {
  const path = buildLibrarySlidePath(courseId, lessonId, slideId);
  return pilot ? path.replace('/library/', '/library/pilot/') : path;
}

/** 保存IDを現行outlineの所属と照合し、消えたIDは近い目次へ戻す。 */
export function resolveReadingResume(
  course: CourseIndex,
  position: ReadingPosition,
  pilot: boolean,
): { readonly path: string; readonly stale: boolean } {
  const lesson =
    position.scope === (pilot ? 'pilot' : 'library') && position.courseId === course.id
      ? readingLessons(course, pilot).find((item) => item.id === position.lessonId)
      : undefined;
  if (lesson === undefined) return { path: readingIndexPath(course.id, pilot), stale: true };
  const slide = lesson.slides.find((item) => item.id === position.slideId);
  if (slide === undefined)
    return { path: readingLessonPath(course.id, lesson.id, pilot), stale: true };
  return {
    path:
      position.mode === 'slides'
        ? readingSlidePath(course.id, lesson.id, slide.id, pilot)
        : `${readingLessonPath(course.id, lesson.id, pilot)}?slide=${encodeURIComponent(slide.id)}`,
    stale: false,
  };
}
