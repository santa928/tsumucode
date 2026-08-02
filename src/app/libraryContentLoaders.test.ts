// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fixtureCatalog,
  fixtureCourseIndex,
  fixtureLessonManifest,
} from '../../tests/fixtures/course';
import type { CourseCatalog } from '../core/content/types';
import { libraryCourseLoader, librarySlideLoader } from './libraryContentLoaders';

const content = vi.hoisted(() => ({
  loadCourseCatalog: vi.fn(),
  loadCourseIndex: vi.fn(),
  loadLessonManifest: vi.fn(),
}));

vi.mock('../core/content/loadCourseCatalog', () => ({
  loadCourseCatalog: content.loadCourseCatalog,
  loadCourseIndex: content.loadCourseIndex,
  loadLessonManifest: content.loadLessonManifest,
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
  content.loadCourseIndex.mockReset().mockResolvedValue(structuredClone(fixtureCourseIndex));
  content.loadLessonManifest.mockReset().mockResolvedValue(structuredClone(fixtureLessonManifest));
});

describe('libraryCourseLoader', () => {
  it('公開Course Indexだけを進捗処理なしで返す', async () => {
    await expect(
      libraryCourseLoader({ params: { courseId: fixtureCourseIndex.id } }),
    ).resolves.toEqual(fixtureCourseIndex);
    expect(content.loadCourseIndex).toHaveBeenCalledOnce();
    expect(content.loadLessonManifest).not.toHaveBeenCalled();
  });

  it('draft Courseと未知Courseを404にし、Indexを取得しない', async () => {
    const draftCatalog: CourseCatalog = structuredClone(fixtureCatalog);
    draftCatalog.courses[0]!.publicationStatus = 'draft';
    content.loadCourseCatalog.mockResolvedValue(draftCatalog);

    await expectNotFound(libraryCourseLoader({ params: { courseId: fixtureCourseIndex.id } }));
    await expectNotFound(libraryCourseLoader({ params: { courseId: 'missing-course' } }));
    expect(content.loadCourseIndex).not.toHaveBeenCalled();
  });

  it('Catalog取得失敗は404へ潰さず教材読込Errorとして伝える', async () => {
    const error = new Error('catalog failed');
    content.loadCourseCatalog.mockRejectedValueOnce(error);

    await expect(libraryCourseLoader({ params: { courseId: fixtureCourseIndex.id } })).rejects.toBe(
      error,
    );
  });
});

describe('librarySlideLoader', () => {
  it('Indexの全体移動contextと現在Slide本文だけを返す', async () => {
    const result = await librarySlideLoader({
      params: {
        courseId: fixtureCourseIndex.id,
        lessonId: 'lesson-first-heading',
        slideId: 'slide-html-role',
      },
    });

    expect(result).toMatchObject({
      course: { id: fixtureCourseIndex.id },
      context: { current: { lesson: { id: 'lesson-first-heading' } } },
      lesson: { id: 'lesson-first-heading' },
      slide: { id: 'slide-html-role' },
    });
    expect(content.loadLessonManifest).toHaveBeenCalledOnce();
  });

  it('Slide欠落と所有Lesson不一致をLesson取得前に404にする', async () => {
    await expectNotFound(
      librarySlideLoader({
        params: {
          courseId: fixtureCourseIndex.id,
          lessonId: 'lesson-first-heading',
          slideId: 'missing-slide',
        },
      }),
    );
    await expectNotFound(
      librarySlideLoader({
        params: {
          courseId: fixtureCourseIndex.id,
          lessonId: 'missing-lesson',
          slideId: 'slide-html-role',
        },
      }),
    );
    expect(content.loadLessonManifest).not.toHaveBeenCalled();
  });
});
