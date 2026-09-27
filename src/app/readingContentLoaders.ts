import { buildCourseSlideOutlineSequence } from '../features/library/courseSlideSequence';
/** 読書と有限パイロットの本文だけを取得し、通常学習Runtimeを起動しない。 */
import { redirect, type LoaderFunctionArgs } from 'react-router';
import {
  loadCourseCatalog,
  loadCourseIndex,
  loadLessonManifest,
} from '../core/content/loadCourseCatalog';
import type { CourseIndex, Lesson } from '../core/content/types';
import {
  READING_PILOT_LESSONS,
  readingIndexPath,
  readingLessonPath,
  readingSlidePath,
  readingLessons,
} from '../features/library/readingTargets';
import { libraryCourseLoader } from './libraryContentLoaders';

type ReadingLoaderArgs = Pick<LoaderFunctionArgs, 'params'>;
export interface ReadingLessonData {
  readonly course: CourseIndex;
  readonly lesson: Lesson;
  readonly pilot: boolean;
}

/** 3Lessonを含むCourse indexだけを取得し、本文は各読書routeで遅延取得する。 */
export async function readingPilotIndexLoader(): Promise<readonly CourseIndex[]> {
  const catalog = await loadCourseCatalog(import.meta.env.BASE_URL);
  const ids = [...new Set(READING_PILOT_LESSONS.map((item) => item.courseId))];
  return Promise.all(
    ids.map(async (id) => {
      const entry = catalog.courses.find((item) => item.id === id);
      if (entry === undefined) throw new Error('試用教材の目次が見つかりません。');
      return loadCourseIndex(import.meta.env.BASE_URL, entry);
    }),
  );
}

/** draftの許可は有限Course+Lesson IDに限定し、通常Libraryの条件を緩めない。 */
export async function readingPilotLessonLoader({
  params,
}: ReadingLoaderArgs): Promise<ReadingLessonData | Response> {
  if (
    !READING_PILOT_LESSONS.some(
      (item) => item.courseId === params.courseId && item.lessonId === params.lessonId,
    )
  )
    return redirect('/library/pilot');
  const catalog = await loadCourseCatalog(import.meta.env.BASE_URL);
  const entry = catalog.courses.find((item) => item.id === params.courseId);
  if (entry === undefined) return redirect('/library/pilot');
  const course = await loadCourseIndex(import.meta.env.BASE_URL, entry);
  if (!readingLessons(course, true).some((item) => item.id === params.lessonId))
    return redirect('/library/pilot');
  const manifest = await loadLessonManifest(import.meta.env.BASE_URL, course, params.lessonId!);
  return { course, lesson: manifest.lesson, pilot: true };
}

/** 公開CourseのLessonだけを通読へ渡し、消えたLessonはそのCourse目次へ戻す。 */
export async function readingLessonLoader(
  args: ReadingLoaderArgs,
): Promise<ReadingLessonData | Response> {
  const course = await libraryCourseLoader(args);
  if (!readingLessons(course, false).some((item) => item.id === args.params.lessonId))
    return redirect(readingIndexPath(course.id, false));
  const manifest = await loadLessonManifest(
    import.meta.env.BASE_URL,
    course,
    args.params.lessonId!,
  );
  return { course, lesson: manifest.lesson, pilot: false };
}

/** 試用のSlide移動・目次も許可したLesson集合だけから導出する。 */
export async function readingPilotSlideLoader(args: ReadingLoaderArgs) {
  const data = await readingPilotLessonLoader(args);
  if (data instanceof Response) return data;
  const lessons = readingLessons(data.course, true);
  const all = buildCourseSlideOutlineSequence(data.course).filter((item) =>
    lessons.some((lesson) => lesson.id === item.lesson.id),
  );
  const sequence = all.map((item, index) => ({
    ...item,
    path: readingSlidePath(data.course.id, item.lesson.id, item.slide.id, true),
    courseSlideIndex: index,
    courseSlideCount: all.length,
    lessonIndex: lessons.findIndex((lesson) => lesson.id === item.lesson.id),
    lessonCount: lessons.length,
  }));
  const index = sequence.findIndex(
    (item) => item.lesson.id === data.lesson.id && item.slide.id === args.params.slideId,
  );
  const current = sequence[index];
  const slide = data.lesson.slides.find((item) => item.id === args.params.slideId);
  if (current === undefined || slide === undefined)
    return redirect(readingLessonPath(data.course.id, data.lesson.id, true));
  return {
    ...data,
    slide,
    context: {
      current,
      ...(sequence[index - 1] ? { previous: sequence[index - 1] } : {}),
      ...(sequence[index + 1] ? { next: sequence[index + 1] } : {}),
    },
  };
}
