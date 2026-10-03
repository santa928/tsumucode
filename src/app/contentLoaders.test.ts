// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import catalogSource from '../../public/generated/content/catalog-v3.json?raw';
import indexSource from '../../public/generated/content/courses/javascript/index.json?raw';
import guidedSource from '../../public/generated/content/courses/javascript/lessons/javascript-ch12-l01.json?raw';
import capstoneSource from '../../public/generated/content/courses/javascript/lessons/javascript-ch13-l01.json?raw';
import {
  CourseCatalogV3Schema,
  CourseIndexSchema,
  LessonManifestSchema,
} from '../core/content/deliverySchema';
import { exerciseRequirementIds } from '../core/content/exerciseRequirementIds';
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

/** 実制作教材のcheckpoint参照とfresh snapshotで完了loaderの最小入力を準備する。 */
async function checkpointCompletionFixture(kind: 'guided-project' | 'capstone') {
  const lessonId = kind === 'guided-project' ? 'javascript-ch12-l01' : 'javascript-ch13-l01';
  const manifest = LessonManifestSchema.parse(
    JSON.parse(kind === 'guided-project' ? guidedSource : capstoneSource),
  );
  const index = CourseIndexSchema.parse(JSON.parse(indexSource));
  const catalog = CourseCatalogV3Schema.parse(JSON.parse(catalogSource));
  const lesson = manifest.lesson;
  const exercise = lesson.exercises[0]!;
  const now = '2026-10-02T00:00:00.000Z';
  const files = Object.fromEntries(exercise.files.map(({ path, content }) => [path, content]));
  const draft: ExerciseDraft = {
    courseId: index.id,
    lessonId,
    exerciseId: exercise.id,
    workspaceId: exercise.workspaceId,
    contentRevision: index.revision,
    editRevision: 1,
    files,
    selectedFile: 'main.js',
    cursors: {},
    validationHistory: [],
    revealedHintIds: [],
    lastPassingSnapshots: {
      [exercise.id]: { editRevision: 1, contentRevision: index.revision, files, evaluatedAt: now },
    },
    updatedAt: now,
  };
  const progress: CourseProgress = {
    courseId: index.id,
    contentRevision: index.revision,
    lessons: {
      [lessonId]: {
        lessonId,
        viewedSlideIds: [],
        passedExerciseIds: [exercise.id],
        passedChecklistItemIds:
          lesson.kind === 'guided-project' ? lesson.completion.requiredChecklistItemIds : [],
        passedRuleIds: exerciseRequirementIds(exercise),
        passedViewportIds: exercise.previewViewports.map(({ id }) => id),
        currentComplete: true,
      },
    },
    currentComplete: false,
    updatedAt: now,
  };
  content.loadCourseCatalog.mockResolvedValue(catalog);
  content.loadCourseIndex.mockResolvedValue(index);
  content.loadWorkspaceLessons.mockResolvedValue([manifest]);
  runtime.repository.getCourse.mockResolvedValue(progress);
  runtime.repository.getDraft.mockResolvedValue(draft);
  return {
    lesson,
    exercise,
    draft,
    params: { courseId: index.id, lessonId, exerciseId: exercise.id },
  };
}

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
  it.each(['guided-project', 'capstone'] as const)(
    '実%sの宣言済みcheckpoint所有者をfresh snapshotへ解決する',
    async (kind) => {
      const { exercise, params } = await checkpointCompletionFixture(kind);
      await expect(completionLoader({ params })).resolves.toMatchObject({
        exercise: { id: exercise.id },
      });
    },
  );

  it.each([
    'unknown',
    'expectation',
    'duplicate-owner',
    'stale-snapshot',
    'dirty-draft',
    'revision-mismatch',
  ] as const)('制作checkpointでも%sを完了画面へ通さない', async (failure) => {
    const { lesson, exercise, draft, params } = await checkpointCompletionFixture('guided-project');
    if (lesson.kind !== 'guided-project') throw new Error('Guided fixtureがありません');
    if (failure === 'unknown')
      lesson.project.checklist[1]!.ruleIds = ['interaction:missing:checkpoint'];
    if (failure === 'expectation')
      lesson.project.checklist[1]!.ruleIds = ['interaction:g1-show:loaded:question'];
    if (failure === 'duplicate-owner')
      lesson.exercises.push({ ...structuredClone(exercise), id: 'javascript-ch12-l01-e02' });
    if (failure === 'stale-snapshot')
      runtime.repository.getDraft.mockResolvedValue({ ...draft, editRevision: 2 });
    if (failure === 'dirty-draft') runtime.passFreshness.isDirty.mockReturnValue(true);
    if (failure === 'revision-mismatch')
      runtime.repository.getDraft.mockResolvedValue({
        ...draft,
        contentRevision: 'different-revision',
      });
    await expectRouteStatus(completionLoader({ params }), 302);
  });

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
