import type {
  ChapterManifest,
  CourseManifest,
  Lesson,
  PhaseManifest,
  Slide,
} from '../../core/content/types';

export interface CourseSlideLocation {
  readonly phase: PhaseManifest;
  readonly chapter: ChapterManifest;
  readonly lesson: Lesson;
  readonly slide: Slide;
  readonly courseSlideIndex: number;
  readonly courseSlideCount: number;
  readonly lessonIndex: number;
  readonly lessonCount: number;
  readonly slideIndex: number;
  readonly slideCount: number;
  readonly path: string;
}

export interface CourseSlideContext {
  readonly previous?: CourseSlideLocation;
  readonly current: CourseSlideLocation;
  readonly next?: CourseSlideLocation;
}

interface CourseLessonLocation {
  readonly phase: PhaseManifest;
  readonly chapter: ChapterManifest;
  readonly lesson: Lesson;
}

/** Library ViewerのSlideへ移動するRouter内部Pathを組み立てる。 */
export function buildLibrarySlidePath(courseId: string, lessonId: string, slideId: string): string {
  return `/library/${courseId}/lessons/${lessonId}/slides/${slideId}`;
}

/** Course階層を配列の著者順で走査し、全Lessonと所有階層を連結する。 */
function collectCourseLessons(course: CourseManifest): readonly CourseLessonLocation[] {
  return course.phases.flatMap((phase) =>
    phase.chapters.flatMap((chapter) =>
      chapter.lessons.map((lesson) => ({ phase, chapter, lesson })),
    ),
  );
}

/** Course内の全Slideを著者順で連結し、境界移動に必要な位置情報を付ける。 */
export function buildCourseSlideSequence(course: CourseManifest): readonly CourseSlideLocation[] {
  const lessons = collectCourseLessons(course);
  const seenSlideIds = new Set<string>();

  for (const { lesson } of lessons) {
    if (lesson.slides.length === 0) {
      throw new Error(`LessonにSlideがありません: ${lesson.id}`);
    }
    for (const slide of lesson.slides) {
      if (seenSlideIds.has(slide.id)) {
        throw new Error(`Slide IDがCourse内で重複しています: ${slide.id}`);
      }
      seenSlideIds.add(slide.id);
    }
  }

  const courseSlideCount = seenSlideIds.size;
  let courseSlideIndex = 0;
  return lessons.flatMap(({ phase, chapter, lesson }, lessonIndex) =>
    lesson.slides.map((slide, slideIndex) => {
      const location: CourseSlideLocation = {
        phase,
        chapter,
        lesson,
        slide,
        courseSlideIndex,
        courseSlideCount,
        lessonIndex,
        lessonCount: lessons.length,
        slideIndex,
        slideCount: lesson.slides.length,
        path: buildLibrarySlidePath(course.id, lesson.id, slide.id),
      };
      courseSlideIndex += 1;
      return location;
    }),
  );
}

/** URL上のLessonとSlideを一意に解決し、Course全体で隣接するSlideを返す。 */
export function resolveCourseSlideContext(
  course: CourseManifest,
  lessonId: string,
  slideId: string,
): CourseSlideContext {
  const sequence = buildCourseSlideSequence(course);
  const currentIndex = sequence.findIndex(
    ({ lesson, slide }) => lesson.id === lessonId && slide.id === slideId,
  );
  if (currentIndex < 0) {
    throw new Error(`LessonとSlideの組み合わせが見つかりません: ${lessonId}/${slideId}`);
  }

  const previous = sequence[currentIndex - 1];
  const next = sequence[currentIndex + 1];
  return {
    ...(previous === undefined ? {} : { previous }),
    current: sequence[currentIndex]!,
    ...(next === undefined ? {} : { next }),
  };
}
