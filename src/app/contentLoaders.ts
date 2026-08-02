/** Routeごとに必要最小限の分割教材だけを取得して画面契約へ変換する。 */
import { redirect, type LoaderFunctionArgs } from 'react-router';
import { courseContentRepository } from '../core/content/CourseContentRepository';
import {
  loadCourseCatalog,
  loadCourseIndex,
  loadLessonManifest,
} from '../core/content/loadCourseCatalog';
import {
  findExercise,
  findExerciseOwner,
  findSlide,
  findSlideOwner,
} from '../core/content/selectors';
import type {
  CourseCatalogEntry,
  CourseIndex,
  Exercise,
  LearningPathDefinition,
  Lesson,
  LessonManifest,
  Slide,
} from '../core/content/types';
import { learningRuntimeServices } from '../features/learning/runtimeServices';
import {
  createCatalogProgressMigrationPort,
  ensureCatalogCourseRevisions,
} from './catalogProgressMigrations';

type CourseLoaderArgs = Pick<LoaderFunctionArgs, 'params'>;

export interface LearningPathLoaderData {
  readonly path: LearningPathDefinition;
  readonly courses: readonly CourseCatalogEntry[];
}

export interface SlideLoaderData {
  readonly course: CourseIndex;
  readonly lesson: Lesson;
  readonly slide: Slide;
}

export interface ExerciseLoaderData {
  readonly course: CourseIndex;
  readonly lesson: Lesson;
  readonly exercise: Exercise;
  readonly workspaceLessons: readonly Lesson[];
}

export interface ReviewLoaderData extends Omit<ExerciseLoaderData, 'workspaceLessons'> {
  readonly slide: Slide;
  readonly slideLesson: Lesson;
}

/** React Routerへ教材階層の404 statusだけを渡し、内部の検索詳細は公開しない。 */
function throwContentNotFound(): never {
  // eslint-disable-next-line @typescript-eslint/only-throw-error -- React Routerへ404 statusを渡すためResponseを送出する。
  throw new Response('学習ピースが見つかりません。', { status: 404 });
}

/** 公開CatalogをGitHub Pagesの現在Base Pathから読み込む。 */
export async function catalogLoader() {
  return loadCourseCatalog(import.meta.env.BASE_URL);
}

/** Home用の公開metadataをCatalogだけで返し、古い保存revisionだけIndexで移行する。 */
export async function homeLoader() {
  const catalog = await loadCourseCatalog(import.meta.env.BASE_URL);
  const publishedCourses = catalog.courses.filter(
    ({ publicationStatus }) => publicationStatus === 'published',
  );
  const publishedPaths = catalog.learningPaths.filter(
    ({ publicationStatus }) => publicationStatus === 'published',
  );
  await ensureCatalogCourseRevisions(
    publishedCourses,
    createCatalogProgressMigrationPort(import.meta.env.BASE_URL),
  );
  return { catalog, publishedCourses, publishedPaths };
}

/** 公開LearningPathとStep順の公開Course metadataをCatalogだけから解決する。 */
export async function learningPathLoader({
  params,
}: CourseLoaderArgs): Promise<LearningPathLoaderData> {
  const pathId = params.pathId ?? '';
  const catalog = await loadCourseCatalog(import.meta.env.BASE_URL);
  const learningPath = catalog.learningPaths.find(
    (candidate) => candidate.id === pathId && candidate.publicationStatus === 'published',
  );
  if (learningPath === undefined) return throwContentNotFound();

  const publishedCourses: CourseCatalogEntry[] = [];
  for (const step of learningPath.steps) {
    const course = catalog.courses.find(
      (candidate) => candidate.id === step.courseId && candidate.publicationStatus === 'published',
    );
    if (course === undefined) return throwContentNotFound();
    publishedCourses.push(course);
  }
  await ensureCatalogCourseRevisions(
    publishedCourses,
    createCatalogProgressMigrationPort(import.meta.env.BASE_URL),
  );
  return { path: learningPath, courses: publishedCourses };
}

/** Catalogに登録されたCourse Indexを取得し、進捗migrationへ登録する。 */
export async function courseLoader({ params }: CourseLoaderArgs): Promise<CourseIndex> {
  const courseId = params.courseId ?? '';
  const catalog = await loadCourseCatalog(import.meta.env.BASE_URL);
  const entry = catalog.courses.find((course) => course.id === courseId);
  if (entry === undefined) {
    // eslint-disable-next-line @typescript-eslint/only-throw-error -- React Routerへ404 statusを渡すためResponseを送出する。
    throw new Response('教材が見つかりません。', { status: 404 });
  }
  const course = await loadCourseIndex(import.meta.env.BASE_URL, entry);
  await learningRuntimeServices.ensureCourseIndex(course);
  return course;
}

/** URLのLesson IDとIndex上の所有関係を確認する。 */
function assertOwnerLesson(ownerLessonId: string, routeLessonId: string): void {
  if (ownerLessonId !== routeLessonId) throwContentNotFound();
}

/** Slide URLの所有Lessonだけを読み、画面に必要な3 entityを返す。 */
export async function slideLoader(args: CourseLoaderArgs): Promise<SlideLoaderData> {
  const course = await courseLoader(args);
  let owner: ReturnType<typeof findSlideOwner>;
  try {
    owner = findSlideOwner(course, args.params.slideId ?? '');
    assertOwnerLesson(owner.lesson.id, args.params.lessonId ?? '');
  } catch {
    return throwContentNotFound();
  }
  const manifest = await loadLessonManifest(import.meta.env.BASE_URL, course, owner.lesson.id);
  try {
    return { course, lesson: manifest.lesson, slide: findSlide(manifest.lesson, owner.slide.id) };
  } catch {
    return throwContentNotFound();
  }
}

/** Exercise URLを解決し、現在工程までの共有workspace所有Lessonだけを読む。 */
export async function exerciseLoader(args: CourseLoaderArgs): Promise<ExerciseLoaderData> {
  const course = await courseLoader(args);
  const exerciseId = args.params.exerciseId ?? '';
  let owner: ReturnType<typeof findExerciseOwner>;
  try {
    owner = findExerciseOwner(course, exerciseId);
    assertOwnerLesson(owner.lesson.id, args.params.lessonId ?? '');
  } catch {
    return throwContentNotFound();
  }
  let manifests: readonly LessonManifest[];
  try {
    manifests = await courseContentRepository.loadWorkspaceLessons(
      import.meta.env.BASE_URL,
      course,
      exerciseId,
    );
  } catch (error) {
    if (error instanceof Error && error.message.includes('Courseにありません')) {
      return throwContentNotFound();
    }
    throw error;
  }
  const workspaceLessons = manifests.map(({ lesson }) => lesson);
  const lesson = workspaceLessons.find(({ id }) => id === owner.lesson.id);
  if (lesson === undefined) return throwContentNotFound();
  try {
    return { course, lesson, exercise: findExercise(lesson, exerciseId), workspaceLessons };
  } catch {
    return throwContentNotFound();
  }
}

/** Reviewはworkspace依存を読まず、Exerciseと関連Slideの所有Lessonだけを読む。 */
export async function reviewLoader(args: CourseLoaderArgs): Promise<ReviewLoaderData> {
  const course = await courseLoader(args);
  const exerciseId = args.params.exerciseId ?? '';
  const slideId = args.params.slideId ?? '';
  let exerciseOwner: ReturnType<typeof findExerciseOwner>;
  let slideOwner: ReturnType<typeof findSlideOwner>;
  try {
    exerciseOwner = findExerciseOwner(course, exerciseId);
    slideOwner = findSlideOwner(course, slideId);
    assertOwnerLesson(exerciseOwner.lesson.id, args.params.lessonId ?? '');
  } catch {
    return throwContentNotFound();
  }
  const ownerIds = [...new Set([exerciseOwner.lesson.id, slideOwner.lesson.id])];
  const manifests = await Promise.all(
    ownerIds.map((lessonId) => loadLessonManifest(import.meta.env.BASE_URL, course, lessonId)),
  );
  const lessonById = new Map(manifests.map(({ lesson }) => [lesson.id, lesson]));
  const lesson = lessonById.get(exerciseOwner.lesson.id);
  const slideLesson = lessonById.get(slideOwner.lesson.id);
  if (lesson === undefined || slideLesson === undefined) return throwContentNotFound();
  try {
    const exercise = findExercise(lesson, exerciseId);
    if (!exercise.relatedSlideIds.includes(slideId)) return throwContentNotFound();
    return {
      course,
      lesson,
      exercise,
      slide: findSlide(slideLesson, slideId),
      slideLesson,
    };
  } catch {
    return throwContentNotFound();
  }
}

/** Exercise IDをLesson内の一意な対象へ解決し、不整合参照はfail closedにする。 */
function exerciseById(lesson: Lesson, exerciseId: string): Exercise | undefined {
  const matches = lesson.exercises.filter(({ id }) => id === exerciseId);
  return matches.length === 1 ? matches[0] : undefined;
}

/** requirement IDを所有する一意なExerciseへ解決し、欠落・複数所有を拒否する。 */
function exerciseByRequirement(lesson: Lesson, requirementId: string): Exercise | undefined {
  const matches = lesson.exercises.filter((exercise) =>
    exercise.validationRules.some(({ groupId, id }) => (groupId ?? id) === requirementId),
  );
  return matches.length === 1 ? matches[0] : undefined;
}

/** Lesson完了へ寄与する全Exerciseをkind別要件から重複なしで解決する。 */
function completionFreshnessExercises(lesson: Lesson): readonly Exercise[] | undefined {
  const targets = new Map<string, Exercise>();
  const addExercise = (exercise: Exercise | undefined): boolean => {
    if (exercise === undefined) return false;
    targets.set(exercise.id, exercise);
    return true;
  };
  switch (lesson.kind) {
    case 'standard':
      for (const exerciseId of lesson.completion.requiredExerciseIds) {
        if (!addExercise(exerciseById(lesson, exerciseId))) return undefined;
      }
      break;
    case 'guided-project':
      for (const exerciseId of lesson.completion.requiredExerciseIds) {
        if (!addExercise(exerciseById(lesson, exerciseId))) return undefined;
      }
      for (const checklistId of lesson.completion.requiredChecklistItemIds) {
        const checklist = lesson.project.checklist.filter(({ id }) => id === checklistId);
        if (checklist.length !== 1 || checklist[0]!.ruleIds.length === 0) return undefined;
        for (const requirementId of checklist[0]!.ruleIds) {
          if (!addExercise(exerciseByRequirement(lesson, requirementId))) return undefined;
        }
      }
      break;
    case 'capstone':
      for (const requirementId of lesson.completion.requiredRuleIds) {
        if (!addExercise(exerciseByRequirement(lesson, requirementId))) return undefined;
      }
      break;
  }
  return targets.size > 0 ? [...targets.values()] : undefined;
}

/** 完了要件と現在Exerciseを統合し、保存済み合格snapshotの鮮度をguardする。 */
export async function completionLoader(args: CourseLoaderArgs): Promise<ExerciseLoaderData> {
  const data = await exerciseLoader(args);
  const lessonTargets = completionFreshnessExercises(data.lesson);
  const targets =
    lessonTargets === undefined
      ? undefined
      : [...new Map([...lessonTargets, data.exercise].map((item) => [item.id, item])).values()];
  const workspaceIds = [...new Set(targets?.map(({ workspaceId }) => workspaceId) ?? [])];
  const [progress, drafts] = await Promise.all([
    learningRuntimeServices.repository.getCourse(data.course.id),
    Promise.all(
      workspaceIds.map(
        async (workspaceId) =>
          [
            workspaceId,
            await learningRuntimeServices.repository.getDraft(data.course.id, workspaceId),
          ] as const,
      ),
    ),
  ]);
  const draftByWorkspace = new Map(drafts);
  const lessonProgress = progress?.lessons[data.lesson.id];
  const allTargetsAreFresh =
    targets !== undefined &&
    targets.every((exercise) => {
      const draft = draftByWorkspace.get(exercise.workspaceId);
      const snapshot = draft?.lastPassingSnapshots[exercise.id];
      return (
        !learningRuntimeServices.passFreshness.isDirty(
          data.course.id,
          exercise.workspaceId,
          exercise.id,
        ) &&
        draft?.contentRevision === data.course.revision &&
        snapshot?.contentRevision === data.course.revision &&
        snapshot.editRevision === draft.editRevision &&
        lessonProgress?.passedExerciseIds.includes(exercise.id) === true
      );
    });
  if (
    progress?.courseId !== data.course.id ||
    progress.contentRevision !== data.course.revision ||
    lessonProgress?.currentComplete !== true ||
    !allTargetsAreFresh
  ) {
    // eslint-disable-next-line @typescript-eslint/only-throw-error -- React Routerへredirect Responseを渡すため送出する。
    throw redirect(
      `/courses/${data.course.id}/lessons/${data.lesson.id}/exercises/${data.exercise.id}`,
    );
  }
  return data;
}
