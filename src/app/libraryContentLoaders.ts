import type { LoaderFunctionArgs } from 'react-router-dom';
import { loadCourseCatalog, loadCourseManifest } from '../core/content/loadCourseCatalog';
import type { CourseManifest } from '../core/content/types';
import {
  resolveCourseSlideContext,
  type CourseSlideContext,
} from '../features/library/courseSlideSequence';

type LibraryLoaderArgs = Pick<LoaderFunctionArgs, 'params'>;

export interface LibrarySlideLoaderData {
  readonly course: CourseManifest;
  readonly context: CourseSlideContext;
}

/** Library Routeの不正な教材参照をReact Router用404 Responseへ変換する。 */
function throwLibraryContentNotFound(): never {
  // eslint-disable-next-line @typescript-eslint/only-throw-error -- React Routerへ404 statusを渡すためResponseを送出する。
  throw new Response('閲覧できる教材が見つかりません。', { status: 404 });
}

/** 公開Catalogに登録されたCourseだけを、進捗Runtimeへ触れずに読み込む。 */
export async function libraryCourseLoader({ params }: LibraryLoaderArgs): Promise<CourseManifest> {
  const courseId = params.courseId ?? '';
  const catalog = await loadCourseCatalog(import.meta.env.BASE_URL);
  const entry = catalog.courses.find(
    (course) => course.id === courseId && course.publicationStatus === 'published',
  );
  if (entry === undefined) return throwLibraryContentNotFound();
  return loadCourseManifest(import.meta.env.BASE_URL, entry);
}

/** Library Viewer用にCourseと前後移動可能なSlide contextを純粋解決する。 */
export async function librarySlideLoader(args: LibraryLoaderArgs): Promise<LibrarySlideLoaderData> {
  const course = await libraryCourseLoader(args);
  try {
    return {
      course,
      context: resolveCourseSlideContext(
        course,
        args.params.lessonId ?? '',
        args.params.slideId ?? '',
      ),
    };
  } catch {
    return throwLibraryContentNotFound();
  }
}
