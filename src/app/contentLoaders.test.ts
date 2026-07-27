// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fixtureCatalog, fixtureCourse } from '../../tests/fixtures/course';
import type { CourseManifest, Exercise, Lesson } from '../core/content/types';
import type { CourseProgress, ExerciseDraft } from '../core/persistence/contracts';
import {
  catalogLoader,
  completionLoader,
  courseLoader,
  exerciseLoader,
  homeLoader,
  reviewLoader,
  slideLoader,
} from './contentLoaders';

const runtime = vi.hoisted(() => ({
  ensureCourse: vi.fn(async () => undefined),
  repository: {
    getCourse: vi.fn<(courseId: string) => Promise<CourseProgress | undefined>>(),
    getDraft:
      vi.fn<(courseId: string, workspaceId: string) => Promise<ExerciseDraft | undefined>>(),
  },
  passFreshness: {
    isDirty: vi.fn<(courseId: string, workspaceId: string, exerciseId: string) => boolean>(),
  },
}));

vi.mock('../features/learning/runtimeServices', () => ({
  learningRuntimeServices: {
    ensureCourse: runtime.ensureCourse,
    repository: runtime.repository,
    passFreshness: runtime.passFreshness,
  },
}));

/** Fixture Exerciseを別ID・workspace・requirementへ複製する。 */
function createSiblingExercise(
  source: Exercise,
  id: string,
  workspaceId: string,
  requirementId: string,
): Exercise {
  const rule = source.validationRules[0]!;
  return {
    ...structuredClone(source),
    id,
    workspaceId,
    title: `${source.title} ${id}`,
    validationRules: [
      {
        ...rule,
        id: requirementId,
        label: `${rule.label} ${id}`,
        hintId: `${id}-hint-1`,
      },
    ],
    hints: source.hints.map((hint, index) => ({
      ...hint,
      id: `${id}-hint-${String(index + 1)}`,
    })),
  };
}

/** Completion guard用にLessonとExercise構成だけを差し替えた検証済みCourseを作る。 */
function createCompletionCourse(kind: Lesson['kind']): {
  readonly course: CourseManifest;
  readonly lesson: Lesson;
  readonly exercises: readonly Exercise[];
} {
  const course = structuredClone(fixtureCourse);
  const chapter = course.phases[0]!.chapters[0]!;
  const sourceLesson = chapter.lessons[0]!;
  if (sourceLesson.kind !== 'standard') throw new Error('Fixture Lessonがstandardではありません');
  const current = structuredClone(sourceLesson.exercises[0]!);
  const sibling = createSiblingExercise(
    current,
    `exercise-${kind}-sibling`,
    `workspace-${kind}-sibling`,
    `rule-${kind}-sibling`,
  );

  if (kind === 'standard') {
    const lesson: Lesson = {
      ...sourceLesson,
      exercises: [current, sibling],
      completion: {
        kind: 'standard',
        finalSlideId: sourceLesson.slides.at(-1)!.id,
        requiredExerciseIds: [current.id, sibling.id],
      },
    };
    chapter.lessons = [lesson];
    course.expectedTotals.standardExercises = 2;
    return { course, lesson, exercises: lesson.exercises };
  }

  const projectId = `project-${kind}`;
  const projectExercises = [current, sibling].map((exercise) => ({
    ...exercise,
    kind,
    projectId,
    workspaceId: current.workspaceId,
    countsTowardStandardExerciseTotal: false,
  })) as Exercise[];
  const siblingRequirementId = sibling.validationRules[0]!.id;
  const project = {
    id: projectId,
    brief: sourceLesson.slides[0]!.blocks,
    guide: [],
    checklist: [
      {
        id: `checklist-${kind}`,
        label: `${kind} checklist`,
        required: true,
        ruleIds: [siblingRequirementId],
      },
    ],
  };
  const lesson: Lesson =
    kind === 'guided-project'
      ? {
          ...sourceLesson,
          kind,
          exercises: projectExercises,
          project,
          completion: {
            kind,
            requiredChecklistItemIds: [`checklist-${kind}`],
            requiredExerciseIds: [projectExercises[0]!.id],
          },
        }
      : {
          ...sourceLesson,
          kind,
          exercises: projectExercises,
          project,
          completion: {
            kind,
            requiredRuleIds: [siblingRequirementId],
            requiredViewportIds: [sibling.previewViewports[0]!.id],
          },
        };
  chapter.kind = kind;
  chapter.lessons = [lesson];
  course.expectedTotals.standardExercises = 0;
  course.expectedTotals.guidedProjectLessons = kind === 'guided-project' ? 1 : 0;
  course.expectedTotals.capstoneLessons = kind === 'capstone' ? 1 : 0;
  return { course, lesson, exercises: projectExercises };
}

/** 必須Exercise完了だけでLesson completeになるstandard Courseへ別workspaceのoptional演習を加える。 */
function createStandardCourseWithOptionalExercise(): {
  readonly course: CourseManifest;
  readonly lesson: Lesson;
  readonly requiredExercise: Exercise;
  readonly optionalExercise: Exercise;
} {
  const course = structuredClone(fixtureCourse);
  const chapter = course.phases[0]!.chapters[0]!;
  const sourceLesson = chapter.lessons[0]!;
  if (sourceLesson.kind !== 'standard') throw new Error('Fixture Lessonがstandardではありません');
  const requiredExercise = structuredClone(sourceLesson.exercises[0]!);
  const optionalExercise = createSiblingExercise(
    requiredExercise,
    'exercise-standard-optional',
    'workspace-standard-optional',
    'rule-standard-optional',
  );
  const lesson: Lesson = {
    ...sourceLesson,
    exercises: [requiredExercise, optionalExercise],
    completion: {
      kind: 'standard',
      finalSlideId: sourceLesson.slides.at(-1)!.id,
      requiredExerciseIds: [requiredExercise.id],
    },
  };
  chapter.lessons = [lesson];
  course.expectedTotals.standardExercises = 2;
  return { course, lesson, requiredExercise, optionalExercise };
}

/** 指定Exerciseを同一revisionでpass済みにしたworkspace Draftを作る。 */
function passingDraft(
  course: CourseManifest,
  lesson: Lesson,
  exercise: Exercise,
  workspaceExercises: readonly Exercise[] = [exercise],
): ExerciseDraft {
  return {
    courseId: course.id,
    lessonId: lesson.id,
    exerciseId: exercise.id,
    workspaceId: exercise.workspaceId,
    contentRevision: course.revision,
    editRevision: 3,
    files: { 'index.html': '<h1>done</h1>' },
    selectedFile: 'index.html',
    cursors: {},
    validationHistory: [],
    revealedHintIds: [],
    lastPassingSnapshots: Object.fromEntries(
      workspaceExercises.map((item) => [
        item.id,
        {
          editRevision: 3,
          contentRevision: course.revision,
          files: { 'index.html': '<h1>done</h1>' },
          evaluatedAt: '2026-07-10T00:01:00.000Z',
        },
      ]),
    ),
    updatedAt: '2026-07-10T00:01:00.000Z',
  };
}

/** Lesson完了済みとしてCompletion guardの永続側条件を満たす。 */
function completedProgress(course: CourseManifest, lesson: Lesson): CourseProgress {
  return {
    courseId: course.id,
    contentRevision: course.revision,
    lessons: {
      [lesson.id]: {
        lessonId: lesson.id,
        viewedSlideIds: lesson.slides.map(({ id }) => id),
        passedExerciseIds: lesson.exercises.map(({ id }) => id),
        passedChecklistItemIds:
          lesson.kind === 'guided-project' ? [...lesson.completion.requiredChecklistItemIds] : [],
        passedRuleIds: lesson.exercises.flatMap(({ validationRules }) =>
          validationRules.map(({ groupId, id }) => groupId ?? id),
        ),
        passedViewportIds: lesson.exercises.flatMap(({ previewViewports }) =>
          previewViewports.map(({ id }) => id),
        ),
        currentComplete: true,
        firstCompletedAt: '2026-07-10T00:01:00.000Z',
      },
    },
    currentLessonId: lesson.id,
    currentChapterId: course.phases[0]!.chapters[0]!.id,
    currentComplete: true,
    firstCompletedAt: '2026-07-10T00:01:00.000Z',
    updatedAt: '2026-07-10T00:01:00.000Z',
  };
}

/** 指定Exerciseだけを未合格に戻し、Lesson complete自体は維持した進捗を作る。 */
function withoutPassedExercise(
  progress: CourseProgress,
  lesson: Lesson,
  exerciseId: string,
): CourseProgress {
  const lessonProgress = progress.lessons[lesson.id]!;
  return {
    ...progress,
    lessons: {
      ...progress.lessons,
      [lesson.id]: {
        ...lessonProgress,
        passedExerciseIds: lessonProgress.passedExerciseIds.filter((id) => id !== exerciseId),
      },
    },
  };
}

/** Exerciseごとのworkspaceへcurrent Draftを返し、指定対象だけpassing snapshotを欠落させる。 */
function stubCompletionDrafts(
  course: CourseManifest,
  lesson: Lesson,
  exercises: readonly Exercise[],
  withoutSnapshotExerciseId?: string,
): void {
  runtime.repository.getDraft.mockImplementation(async (_courseId, workspaceId) => {
    const exercise = exercises.find((item) => item.workspaceId === workspaceId);
    if (exercise === undefined) return undefined;
    const draft = passingDraft(course, lesson, exercise);
    return exercise.id === withoutSnapshotExerciseId
      ? { ...draft, lastPassingSnapshots: {} }
      : draft;
  });
}

/** 指定CourseをCatalogとManifest fetchへ順に返す。 */
async function stubCourseFetch(course: CourseManifest): Promise<void> {
  const source = JSON.stringify(course);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source));
  const catalog = structuredClone(fixtureCatalog);
  catalog.courses[0]!.manifestSha256 = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce(Response.json(catalog))
      .mockResolvedValueOnce(new Response(source, { status: 200 })),
  );
}

afterEach(() => {
  runtime.ensureCourse.mockClear();
  runtime.repository.getCourse.mockReset();
  runtime.repository.getDraft.mockReset();
  runtime.passFreshness.isDirty.mockReset();
  vi.unstubAllGlobals();
});

describe('content route loaders', () => {
  it('Catalog entryに対応する検証済みCourseを返す', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json(fixtureCatalog))
      .mockResolvedValueOnce(Response.json(fixtureCourse));
    vi.stubGlobal('fetch', fetchMock);

    await expect(courseLoader({ params: { courseId: 'html-css' } })).resolves.toEqual(
      fixtureCourse,
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(runtime.ensureCourse).toHaveBeenCalledOnce();
    expect(runtime.ensureCourse).toHaveBeenCalledWith(fixtureCourse);
  });

  it('CatalogにないCourse IDを404 Responseへ変換する', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(fixtureCatalog)));

    await expect(courseLoader({ params: { courseId: 'missing' } })).rejects.toMatchObject({
      status: 404,
    });
  });

  it('Catalog loaderは公開Catalogを返す', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(fixtureCatalog)));
    await expect(catalogLoader()).resolves.toEqual(fixtureCatalog);
  });

  it('Home loaderは公開CourseだけをManifestまで検証して返す', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json(fixtureCatalog))
      .mockResolvedValueOnce(Response.json(fixtureCourse));
    vi.stubGlobal('fetch', fetchMock);

    await expect(homeLoader()).resolves.toEqual({
      catalog: fixtureCatalog,
      publishedCourses: [fixtureCourse],
    });
    expect(runtime.ensureCourse).toHaveBeenCalledWith(fixtureCourse);
  });

  it('Slide URLの永続IDからCourse、Lesson、Slideをまとめて返す', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(Response.json(fixtureCatalog))
        .mockResolvedValueOnce(Response.json(fixtureCourse)),
    );

    const lesson = fixtureCourse.phases[0]!.chapters[0]!.lessons[0]!;
    await expect(
      slideLoader({
        params: {
          courseId: 'html-css',
          lessonId: 'lesson-first-heading',
          slideId: 'slide-html-role',
        },
      }),
    ).resolves.toEqual({ course: fixtureCourse, lesson, slide: lesson.slides[0] });
  });

  it.each([
    {
      label: 'Lesson',
      params: { courseId: 'html-css', lessonId: 'missing-lesson', slideId: 'slide-html-role' },
    },
    {
      label: 'Slide',
      params: {
        courseId: 'html-css',
        lessonId: 'lesson-first-heading',
        slideId: 'missing-slide',
      },
    },
  ])('存在しない$label IDを404 Responseへ変換する', async ({ params }) => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(Response.json(fixtureCatalog))
        .mockResolvedValueOnce(Response.json(fixtureCourse)),
    );

    await expect(slideLoader({ params })).rejects.toMatchObject({ status: 404 });
  });

  it('Exercise URLの永続IDからCourse、Lesson、Exerciseをまとめて返す', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(Response.json(fixtureCatalog))
        .mockResolvedValueOnce(Response.json(fixtureCourse)),
    );
    const lesson = fixtureCourse.phases[0]!.chapters[0]!.lessons[0]!;

    await expect(
      exerciseLoader({
        params: {
          courseId: fixtureCourse.id,
          lessonId: lesson.id,
          exerciseId: lesson.exercises[0]!.id,
        },
      }),
    ).resolves.toEqual({ course: fixtureCourse, lesson, exercise: lesson.exercises[0] });
  });

  it('Review先SlideをCourse全体から解決して所有Lessonも返す', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(Response.json(fixtureCatalog))
        .mockResolvedValueOnce(Response.json(fixtureCourse)),
    );
    const lesson = fixtureCourse.phases[0]!.chapters[0]!.lessons[0]!;

    await expect(
      reviewLoader({
        params: {
          courseId: fixtureCourse.id,
          lessonId: lesson.id,
          exerciseId: lesson.exercises[0]!.id,
          slideId: lesson.slides[0]!.id,
        },
      }),
    ).resolves.toEqual({
      course: fixtureCourse,
      lesson,
      exercise: lesson.exercises[0],
      slide: lesson.slides[0],
      slideLesson: lesson,
    });
  });

  it.each([
    { label: 'Exercise', exerciseId: 'missing-exercise', slideId: 'slide-html-role' },
    { label: 'Review Slide', exerciseId: 'exercise-first-heading', slideId: 'missing-slide' },
  ])('存在しない$label IDを404 Responseへ変換する', async ({ exerciseId, slideId }) => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(Response.json(fixtureCatalog))
        .mockResolvedValueOnce(Response.json(fixtureCourse)),
    );
    const params = {
      courseId: fixtureCourse.id,
      lessonId: 'lesson-first-heading',
      exerciseId,
      slideId,
    };

    const loader = exerciseId === 'missing-exercise' ? exerciseLoader : reviewLoader;
    await expect(loader({ params })).rejects.toMatchObject({ status: 404 });
  });

  it('standardは複数workspaceの全必須Exerciseがfreshな場合だけCompletionを許可する', async () => {
    const { course, lesson, exercises } = createCompletionCourse('standard');
    await stubCourseFetch(course);
    runtime.repository.getCourse.mockResolvedValue(completedProgress(course, lesson));
    runtime.repository.getDraft.mockImplementation(async (_courseId, workspaceId) => {
      const exercise = exercises.find((item) => item.workspaceId === workspaceId);
      return exercise === undefined
        ? undefined
        : passingDraft(
            course,
            lesson,
            exercise,
            exercises.filter((item) => item.workspaceId === workspaceId),
          );
    });
    runtime.passFreshness.isDirty.mockReturnValue(false);

    await expect(
      completionLoader({
        params: { courseId: course.id, lessonId: lesson.id, exerciseId: exercises[0]!.id },
      }),
    ).resolves.toMatchObject({ course: { id: course.id }, lesson: { id: lesson.id } });
    expect(runtime.repository.getDraft).toHaveBeenCalledTimes(2);
    expect(runtime.passFreshness.isDirty).toHaveBeenCalledWith(
      course.id,
      exercises[1]!.workspaceId,
      exercises[1]!.id,
    );
  });

  it('standard optional Exerciseはorphan passing snapshotだけではCompletionへ入れない', async () => {
    const { course, lesson, requiredExercise, optionalExercise } =
      createStandardCourseWithOptionalExercise();
    await stubCourseFetch(course);
    runtime.repository.getCourse.mockResolvedValue(
      withoutPassedExercise(completedProgress(course, lesson), lesson, optionalExercise.id),
    );
    stubCompletionDrafts(course, lesson, [requiredExercise, optionalExercise]);
    runtime.passFreshness.isDirty.mockReturnValue(false);

    await expect(
      completionLoader({
        params: { courseId: course.id, lessonId: lesson.id, exerciseId: optionalExercise.id },
      }),
    ).rejects.toMatchObject({ status: 302 });
  });

  it('standard optional Exerciseは永続pass済みでも同期dirtyならCompletionへ入れない', async () => {
    const { course, lesson, requiredExercise, optionalExercise } =
      createStandardCourseWithOptionalExercise();
    await stubCourseFetch(course);
    runtime.repository.getCourse.mockResolvedValue(completedProgress(course, lesson));
    stubCompletionDrafts(course, lesson, [requiredExercise, optionalExercise]);
    runtime.passFreshness.isDirty.mockImplementation(
      (_courseId, _workspaceId, exerciseId) => exerciseId === optionalExercise.id,
    );

    await expect(
      completionLoader({
        params: { courseId: course.id, lessonId: lesson.id, exerciseId: optionalExercise.id },
      }),
    ).rejects.toMatchObject({ status: 302 });
  });

  it('standard optional Exerciseは永続pass済みでもcurrent snapshot欠落ならCompletionへ入れない', async () => {
    const { course, lesson, requiredExercise, optionalExercise } =
      createStandardCourseWithOptionalExercise();
    await stubCourseFetch(course);
    runtime.repository.getCourse.mockResolvedValue(completedProgress(course, lesson));
    stubCompletionDrafts(course, lesson, [requiredExercise, optionalExercise], optionalExercise.id);
    runtime.passFreshness.isDirty.mockReturnValue(false);

    await expect(
      completionLoader({
        params: { courseId: course.id, lessonId: lesson.id, exerciseId: optionalExercise.id },
      }),
    ).rejects.toMatchObject({ status: 302 });
  });

  it('standard optional Exerciseは永続passとcurrent snapshotが揃えばCompletionを許可する', async () => {
    const { course, lesson, requiredExercise, optionalExercise } =
      createStandardCourseWithOptionalExercise();
    await stubCourseFetch(course);
    runtime.repository.getCourse.mockResolvedValue(completedProgress(course, lesson));
    stubCompletionDrafts(course, lesson, [requiredExercise, optionalExercise]);
    runtime.passFreshness.isDirty.mockReturnValue(false);

    await expect(
      completionLoader({
        params: { courseId: course.id, lessonId: lesson.id, exerciseId: optionalExercise.id },
      }),
    ).resolves.toMatchObject({ exercise: { id: optionalExercise.id } });
    expect(runtime.repository.getDraft).toHaveBeenCalledTimes(2);
  });

  it('guided-projectは必須Checklist ruleを担う別Exerciseの同期dirtyをfail closedにする', async () => {
    const { course, lesson, exercises } = createCompletionCourse('guided-project');
    await stubCourseFetch(course);
    runtime.repository.getCourse.mockResolvedValue(completedProgress(course, lesson));
    runtime.repository.getDraft.mockImplementation(async (_courseId, workspaceId) => {
      const exercise = exercises.find((item) => item.workspaceId === workspaceId);
      return exercise === undefined
        ? undefined
        : passingDraft(
            course,
            lesson,
            exercise,
            exercises.filter((item) => item.workspaceId === workspaceId),
          );
    });
    runtime.passFreshness.isDirty.mockImplementation(
      (_courseId, _workspaceId, exerciseId) => exerciseId === exercises[1]!.id,
    );

    await expect(
      completionLoader({
        params: { courseId: course.id, lessonId: lesson.id, exerciseId: exercises[0]!.id },
      }),
    ).rejects.toMatchObject({ status: 302 });
    expect(runtime.repository.getDraft).toHaveBeenCalledOnce();
  });

  it('capstoneは必須Ruleを担う別Exerciseのpassing snapshot欠落をfail closedにする', async () => {
    const { course, lesson, exercises } = createCompletionCourse('capstone');
    await stubCourseFetch(course);
    runtime.repository.getCourse.mockResolvedValue(completedProgress(course, lesson));
    runtime.repository.getDraft.mockImplementation(async (_courseId, workspaceId) => {
      const exercise = exercises.find((item) => item.workspaceId === workspaceId);
      if (exercise === undefined || exercise.id === exercises[1]!.id) return undefined;
      return passingDraft(course, lesson, exercise);
    });
    runtime.passFreshness.isDirty.mockReturnValue(false);

    await expect(
      completionLoader({
        params: { courseId: course.id, lessonId: lesson.id, exerciseId: exercises[0]!.id },
      }),
    ).rejects.toMatchObject({ status: 302 });
    expect(runtime.repository.getDraft).toHaveBeenCalledOnce();
  });
});
