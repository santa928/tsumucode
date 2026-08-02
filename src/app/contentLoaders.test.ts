// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fixtureCatalog,
  fixtureCourseIndex,
  fixtureLessonManifest,
} from '../../tests/fixtures/course';
import type { CourseProgress, ExerciseDraft } from '../core/persistence/contracts';
import {
  catalogLoader,
  completionLoader,
  courseLoader,
  exerciseLoader,
  homeLoader,
  learningPathLoader,
  reviewLoader,
  slideLoader,
} from './contentLoaders';

const content = vi.hoisted(() => ({
  loadCourseCatalog: vi.fn(),
  loadCourseIndex: vi.fn(),
  loadLessonManifest: vi.fn(),
  loadWorkspaceLessons: vi.fn(),
}));

const runtime = vi.hoisted(() => ({
  ready: Promise.resolve(),
  ensureCourseIndex: vi.fn(async () => []),
  repository: {
    getCourse: vi.fn<(courseId: string) => Promise<CourseProgress | undefined>>(),
    getDraft:
      vi.fn<(courseId: string, workspaceId: string) => Promise<ExerciseDraft | undefined>>(),
  },
  passFreshness: {
    isDirty: vi.fn<(courseId: string, workspaceId: string, exerciseId: string) => boolean>(),
  },
}));

vi.mock('../core/content/loadCourseCatalog', () => ({
  loadCourseCatalog: content.loadCourseCatalog,
  loadCourseIndex: content.loadCourseIndex,
  loadLessonManifest: content.loadLessonManifest,
}));

vi.mock('../core/content/CourseContentRepository', () => ({
  courseContentRepository: { loadWorkspaceLessons: content.loadWorkspaceLessons },
}));

vi.mock('../features/learning/runtimeServices', () => ({
  learningRuntimeServices: runtime,
}));

/** PromiseがReact Routerの指定statusで失敗したことを確認する。 */
async function expectRouteStatus(promise: Promise<unknown>, status: number): Promise<void> {
  const error = await promise.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(Response);
  expect((error as Response).status).toBe(status);
}

beforeEach(() => {
  content.loadCourseCatalog.mockReset().mockResolvedValue(structuredClone(fixtureCatalog));
  content.loadCourseIndex.mockReset().mockResolvedValue(structuredClone(fixtureCourseIndex));
  content.loadLessonManifest.mockReset().mockResolvedValue(structuredClone(fixtureLessonManifest));
  content.loadWorkspaceLessons
    .mockReset()
    .mockResolvedValue([structuredClone(fixtureLessonManifest)]);
  runtime.ensureCourseIndex.mockClear();
  runtime.repository.getCourse.mockReset().mockResolvedValue(undefined);
  runtime.repository.getDraft.mockReset().mockResolvedValue(undefined);
  runtime.passFreshness.isDirty.mockReset().mockReturnValue(false);
});

describe('Catalog route loaders', () => {
  it('Catalog loaderはCatalog v3をそのまま返す', async () => {
    await expect(catalogLoader()).resolves.toEqual(fixtureCatalog);
  });

  it('Homeは未開始ならCatalogだけで公開CourseとPathを返す', async () => {
    await expect(homeLoader()).resolves.toEqual({
      catalog: fixtureCatalog,
      publishedCourses: fixtureCatalog.courses,
      publishedPaths: fixtureCatalog.learningPaths,
    });
    expect(content.loadCourseIndex).not.toHaveBeenCalled();
  });

  it('LearningPathはStep順の公開Course metadataだけを返す', async () => {
    await expect(learningPathLoader({ params: { pathId: 'frontend' } })).resolves.toEqual({
      path: fixtureCatalog.learningPaths[0],
      courses: fixtureCatalog.courses,
    });
    expect(content.loadCourseIndex).not.toHaveBeenCalled();
  });
});

describe('分割教材 route loaders', () => {
  it('Course mapはCatalogとIndexだけを読みLessonを読まない', async () => {
    await expect(courseLoader({ params: { courseId: 'html-css' } })).resolves.toEqual(
      fixtureCourseIndex,
    );
    expect(content.loadCourseIndex).toHaveBeenCalledOnce();
    expect(content.loadLessonManifest).not.toHaveBeenCalled();
    expect(content.loadWorkspaceLessons).not.toHaveBeenCalled();
    expect(runtime.ensureCourseIndex).toHaveBeenCalledWith(fixtureCourseIndex);
  });

  it('未知CourseはIndex取得前に404にする', async () => {
    await expectRouteStatus(courseLoader({ params: { courseId: 'missing' } }), 404);
    expect(content.loadCourseIndex).not.toHaveBeenCalled();
  });

  it('Slideは所有Lessonだけを読み本文を返す', async () => {
    await expect(
      slideLoader({
        params: {
          courseId: 'html-css',
          lessonId: 'lesson-first-heading',
          slideId: 'slide-html-role',
        },
      }),
    ).resolves.toMatchObject({
      course: { id: 'html-css' },
      lesson: { id: 'lesson-first-heading' },
      slide: { id: 'slide-html-role' },
    });
    expect(content.loadLessonManifest).toHaveBeenCalledOnce();
  });

  it('Exerciseは現在工程までのworkspace所有LessonだけをRepositoryへ要求する', async () => {
    await expect(
      exerciseLoader({
        params: {
          courseId: 'html-css',
          lessonId: 'lesson-first-heading',
          exerciseId: 'exercise-first-heading',
        },
      }),
    ).resolves.toMatchObject({
      course: { id: 'html-css' },
      lesson: { id: 'lesson-first-heading' },
      exercise: { id: 'exercise-first-heading' },
      workspaceLessons: [{ id: 'lesson-first-heading' }],
    });
    expect(content.loadWorkspaceLessons).toHaveBeenCalledWith(
      expect.any(String),
      fixtureCourseIndex,
      'exercise-first-heading',
    );
    expect(content.loadLessonManifest).not.toHaveBeenCalled();
  });

  it('Reviewはworkspace依存を読まず、同じ所有Lessonを1度だけ読む', async () => {
    await expect(
      reviewLoader({
        params: {
          courseId: 'html-css',
          lessonId: 'lesson-first-heading',
          exerciseId: 'exercise-first-heading',
          slideId: 'slide-html-role',
        },
      }),
    ).resolves.toMatchObject({
      exercise: { id: 'exercise-first-heading' },
      slide: { id: 'slide-html-role' },
    });
    expect(content.loadWorkspaceLessons).not.toHaveBeenCalled();
    expect(content.loadLessonManifest).toHaveBeenCalledOnce();
  });

  it('Index上の所有LessonとURLが違う場合はLesson取得前に404にする', async () => {
    await expectRouteStatus(
      slideLoader({
        params: {
          courseId: 'html-css',
          lessonId: 'missing-lesson',
          slideId: 'slide-html-role',
        },
      }),
      404,
    );
    expect(content.loadLessonManifest).not.toHaveBeenCalled();
  });
});

describe('completionLoader', () => {
  it('現在Lessonの完了・合格・fresh snapshotが揃う場合だけ完了画面へ入れる', async () => {
    const lesson = fixtureLessonManifest.lesson;
    const exercise = lesson.exercises[0]!;
    runtime.repository.getCourse.mockResolvedValue({
      courseId: fixtureCourseIndex.id,
      contentRevision: fixtureCourseIndex.revision,
      lessons: {
        [lesson.id]: {
          lessonId: lesson.id,
          viewedSlideIds: lesson.slides.map(({ id }) => id),
          passedExerciseIds: [exercise.id],
          passedChecklistItemIds: [],
          passedRuleIds: exercise.validationRules.map(({ groupId, id }) => groupId ?? id),
          passedViewportIds: exercise.previewViewports.map(({ id }) => id),
          currentComplete: true,
        },
      },
      currentComplete: false,
      updatedAt: '2026-08-02T00:00:00.000Z',
    });
    runtime.repository.getDraft.mockResolvedValue({
      courseId: fixtureCourseIndex.id,
      lessonId: lesson.id,
      exerciseId: exercise.id,
      workspaceId: exercise.workspaceId,
      contentRevision: fixtureCourseIndex.revision,
      editRevision: 1,
      files: { 'index.html': '<h1>done</h1>' },
      selectedFile: 'index.html',
      cursors: {},
      validationHistory: [],
      revealedHintIds: [],
      lastPassingSnapshots: {
        [exercise.id]: {
          editRevision: 1,
          contentRevision: fixtureCourseIndex.revision,
          files: { 'index.html': '<h1>done</h1>' },
          evaluatedAt: '2026-08-02T00:00:00.000Z',
        },
      },
      updatedAt: '2026-08-02T00:00:00.000Z',
    });

    await expect(
      completionLoader({
        params: {
          courseId: 'html-css',
          lessonId: lesson.id,
          exerciseId: exercise.id,
        },
      }),
    ).resolves.toMatchObject({ exercise: { id: exercise.id } });
  });

  it('fresh snapshotがなければ演習へredirectする', async () => {
    await expectRouteStatus(
      completionLoader({
        params: {
          courseId: 'html-css',
          lessonId: 'lesson-first-heading',
          exerciseId: 'exercise-first-heading',
        },
      }),
      302,
    );
  });
});
