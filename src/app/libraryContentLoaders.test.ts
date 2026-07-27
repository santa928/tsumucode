// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fixtureCatalog, fixtureCourse } from '../../tests/fixtures/course';
import type { CourseCatalog } from '../core/content/types';
import { libraryCourseLoader, librarySlideLoader } from './libraryContentLoaders';

const content = vi.hoisted(() => ({
  loadCourseCatalog: vi.fn(),
  loadCourseManifest: vi.fn(),
}));

vi.mock('../core/content/loadCourseCatalog', () => ({
  loadCourseCatalog: content.loadCourseCatalog,
  loadCourseManifest: content.loadCourseManifest,
}));

/** PromiseがReact Router用404 Responseで失敗したことを確認する。 */
async function expectNotFound(promise: Promise<unknown>): Promise<void> {
  const error = await promise.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(Response);
  expect((error as Response).status).toBe(404);
}

beforeEach(() => {
  content.loadCourseCatalog.mockReset().mockResolvedValue(structuredClone(fixtureCatalog));
  content.loadCourseManifest.mockReset().mockResolvedValue(structuredClone(fixtureCourse));
});

describe('libraryCourseLoader', () => {
  it('公開Catalogに登録されたCourseだけを進捗処理なしで返す', async () => {
    await expect(libraryCourseLoader({ params: { courseId: fixtureCourse.id } })).resolves.toEqual(
      fixtureCourse,
    );
    expect(content.loadCourseManifest).toHaveBeenCalledOnce();
  });

  it('draft Courseと未知のCourseを404にし、Manifestを取得しない', async () => {
    const draftCatalog: CourseCatalog = structuredClone(fixtureCatalog);
    draftCatalog.courses[0]!.publicationStatus = 'draft';
    content.loadCourseCatalog.mockResolvedValueOnce(draftCatalog);

    await expectNotFound(libraryCourseLoader({ params: { courseId: fixtureCourse.id } }));
    await expectNotFound(libraryCourseLoader({ params: { courseId: 'missing-course' } }));
    expect(content.loadCourseManifest).not.toHaveBeenCalled();
  });

  it('Catalog取得失敗は404へ潰さず教材読込Errorとして伝える', async () => {
    const error = new Error('catalog failed');
    content.loadCourseCatalog.mockRejectedValueOnce(error);

    await expect(libraryCourseLoader({ params: { courseId: fixtureCourse.id } })).rejects.toBe(
      error,
    );
  });
});

describe('librarySlideLoader', () => {
  it('Courseと全体移動用Slide contextを返す', async () => {
    const result = await librarySlideLoader({
      params: {
        courseId: fixtureCourse.id,
        lessonId: 'lesson-first-heading',
        slideId: 'slide-html-role',
      },
    });
    expect(result).toMatchObject({
      course: { id: fixtureCourse.id },
      context: {
        current: {
          lesson: { id: 'lesson-first-heading' },
          slide: { id: 'slide-html-role' },
          courseSlideIndex: 0,
          courseSlideCount: 1,
        },
      },
    });
    expect(result.context).not.toHaveProperty('previous');
    expect(result.context).not.toHaveProperty('next');
  });

  it('Slideの欠落と所有Lesson不一致を404にする', async () => {
    await expectNotFound(
      librarySlideLoader({
        params: {
          courseId: fixtureCourse.id,
          lessonId: 'lesson-first-heading',
          slideId: 'missing-slide',
        },
      }),
    );
    await expectNotFound(
      librarySlideLoader({
        params: {
          courseId: fixtureCourse.id,
          lessonId: 'missing-lesson',
          slideId: 'slide-html-role',
        },
      }),
    );
  });
});
