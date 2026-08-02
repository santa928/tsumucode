/** 進捗へ触れないLibrary Viewer用の分割教材Loader。 */
import type { LoaderFunctionArgs } from 'react-router';
import {
  loadCourseCatalog,
  loadCourseIndex,
  loadLessonManifest,
} from '../core/content/loadCourseCatalog';
import { findSlide } from '../core/content/selectors';
import type { CourseIndex, Lesson, Slide } from '../core/content/types';
import {
  resolveCourseSlideOutlineContext,
  type CourseSlideOutlineContext,
} from '../features/library/courseSlideSequence';

type LibraryLoaderArgs = Pick<LoaderFunctionArgs, 'params'>;

export interface LibrarySlideLoaderData {
  readonly course: CourseIndex;
  readonly context: CourseSlideOutlineContext;
  readonly lesson: Lesson;
  readonly slide: Slide;
}

/** Library Routeの不正な教材参照をReact Router用404 Responseへ変換する。 */
function throwLibraryContentNotFound(): never {
  // eslint-disable-next-line @typescript-eslint/only-throw-error -- React Routerへ404 statusを渡すためResponseを送出する。
  throw new Response('閲覧できる教材が見つかりません。', { status: 404 });
}

/** 公開Course Indexだけを進捗処理なしで読み込む。 */
export async function libraryCourseLoader({ params }: LibraryLoaderArgs): Promise<CourseIndex> {
  const courseId = params.courseId ?? '';
  const catalog = await loadCourseCatalog(import.meta.env.BASE_URL);
  const entry = catalog.courses.find(
    (course) => course.id === courseId && course.publicationStatus === 'published',
  );
  if (entry === undefined) return throwLibraryContentNotFound();
  return loadCourseIndex(import.meta.env.BASE_URL, entry);
}

/** 全体移動用outlineと現在Slide本文の所有Lessonだけを返す。 */
export async function librarySlideLoader(args: LibraryLoaderArgs): Promise<LibrarySlideLoaderData> {
  const course = await libraryCourseLoader(args);
  let context: CourseSlideOutlineContext;
  try {
    context = resolveCourseSlideOutlineContext(
      course,
      args.params.lessonId ?? '',
      args.params.slideId ?? '',
    );
  } catch {
    return throwLibraryContentNotFound();
  }
  const manifest = await loadLessonManifest(
    import.meta.env.BASE_URL,
    course,
    context.current.lesson.id,
  );
  try {
    return {
      course,
      context,
      lesson: manifest.lesson,
      slide: findSlide(manifest.lesson, context.current.slide.id),
    };
  } catch {
    return throwLibraryContentNotFound();
  }
}
