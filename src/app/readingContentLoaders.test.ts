// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import {
  fixtureCatalog,
  fixtureCourseIndex,
  fixtureLessonManifest,
} from '../../tests/fixtures/course';
import { readingLessonLoader, readingPilotLessonLoader } from './readingContentLoaders';
const content = vi.hoisted(() => ({
  loadCourseCatalog: vi.fn(),
  loadCourseIndex: vi.fn(),
  loadLessonManifest: vi.fn(),
}));
vi.mock('../core/content/loadCourseCatalog', () => content);
beforeEach(() => {
  content.loadCourseCatalog.mockReset().mockResolvedValue(structuredClone(fixtureCatalog));
  content.loadCourseIndex.mockReset().mockResolvedValue(structuredClone(fixtureCourseIndex));
  content.loadLessonManifest.mockReset().mockResolvedValue(structuredClone(fixtureLessonManifest));
});
it('試用対象外は本文やCourseを取得せず試用目次へ戻る', async () => {
  const result = await readingPilotLessonLoader({
    params: { courseId: 'javascript', lessonId: 'javascript-ch07-l01' },
  });
  expect(result).toBeInstanceOf(Response);
  expect((result as Response).headers.get('Location')).toBe('/library/pilot');
  expect(content.loadCourseIndex).not.toHaveBeenCalled();
  expect(content.loadLessonManifest).not.toHaveBeenCalled();
});
it('公開Lessonの通読で消えたLessonを他Lesson本文として返さない', async () => {
  const result = await readingLessonLoader({
    params: { courseId: fixtureCourseIndex.id, lessonId: 'removed' },
  });
  expect((result as Response).headers.get('Location')).toBe('/library/html-css');
  expect(content.loadLessonManifest).not.toHaveBeenCalled();
});
it('試用のdraft許可を通常読書へ広げない', async () => {
  const catalog = structuredClone(fixtureCatalog);
  catalog.courses[0]!.publicationStatus = 'draft';
  content.loadCourseCatalog.mockResolvedValue(catalog);
  await expect(
    readingLessonLoader({
      params: { courseId: fixtureCourseIndex.id, lessonId: 'lesson-first-heading' },
    }),
  ).rejects.toBeInstanceOf(Response);
  expect(content.loadLessonManifest).not.toHaveBeenCalled();
});
it('通信失敗を教材削除と取り違えて目次へ転送しない', async () => {
  content.loadCourseIndex.mockRejectedValue(new Error('offline'));
  await expect(
    readingPilotLessonLoader({ params: { courseId: 'html-css', lessonId: 'html-css-ch00-l01' } }),
  ).rejects.toThrow('offline');
});
it('有限指定したdraftのClosure本文だけを同じmanifest loaderから取得する', async () => {
  const catalog = structuredClone(fixtureCatalog);
  catalog.courses[0]!.id = 'javascript';
  catalog.courses[0]!.publicationStatus = 'draft';
  const course = structuredClone(fixtureCourseIndex);
  course.id = 'javascript';
  course.publicationStatus = 'draft';
  course.phases[0]!.chapters[0]!.lessons[0]!.id = 'javascript-ch03-l05';
  const manifest = structuredClone(fixtureLessonManifest);
  manifest.courseId = 'javascript';
  manifest.lesson.id = 'javascript-ch03-l05';
  content.loadCourseCatalog.mockResolvedValue(catalog);
  content.loadCourseIndex.mockResolvedValue(course);
  content.loadLessonManifest.mockResolvedValue(manifest);
  const result = await readingPilotLessonLoader({
    params: { courseId: 'javascript', lessonId: 'javascript-ch03-l05' },
  });
  expect(result).toEqual({ course, lesson: manifest.lesson, pilot: true });
  expect(content.loadLessonManifest).toHaveBeenCalledExactlyOnceWith(
    import.meta.env.BASE_URL,
    course,
    'javascript-ch03-l05',
  );
});
