import { redirect, type LoaderFunctionArgs } from 'react-router-dom';
import { loadCourseCatalog, loadCourseManifest } from '../core/content/loadCourseCatalog';
import { findExercise, findLesson, findSlide, findSlideInCourse } from '../core/content/selectors';
import type { Exercise, Lesson } from '../core/content/types';
import { learningRuntimeServices } from '../features/learning/runtimeServices';

type CourseLoaderArgs = Pick<LoaderFunctionArgs, 'params'>;

/** React Routerへ教材階層の404 statusだけを渡し、内部の検索詳細は公開しない。 */
function throwContentNotFound(): never {
  // eslint-disable-next-line @typescript-eslint/only-throw-error -- React Routerへ404 statusを渡すためResponseを送出する。
  throw new Response('学習ピースが見つかりません。', { status: 404 });
}

/** 公開CatalogをGitHub Pagesの現在Base Pathから読み込む。 */
export async function catalogLoader() {
  return loadCourseCatalog(import.meta.env.BASE_URL);
}

/** Homeで進捗と再開地点を表示できるよう、公開Courseを検証・移行してまとめて返す。 */
export async function homeLoader() {
  const catalog = await loadCourseCatalog(import.meta.env.BASE_URL);
  const publishedCourses = await Promise.all(
    catalog.courses
      .filter(({ publicationStatus }) => publicationStatus === 'published')
      .map(async ({ manifestPath }) => {
        const course = await loadCourseManifest(import.meta.env.BASE_URL, manifestPath);
        await learningRuntimeServices.ensureCourse(course);
        return course;
      }),
  );
  return { catalog, publishedCourses };
}

/** Catalogに登録されたCourseだけを検証済みManifestとして返す。 */
export async function courseLoader({ params }: CourseLoaderArgs) {
  const courseId = params.courseId ?? '';
  const catalog = await loadCourseCatalog(import.meta.env.BASE_URL);
  const entry = catalog.courses.find((course) => course.id === courseId);
  if (entry === undefined) {
    // eslint-disable-next-line @typescript-eslint/only-throw-error -- React Routerへ404 statusを渡すためResponseを送出する。
    throw new Response('教材が見つかりません。', { status: 404 });
  }
  const course = await loadCourseManifest(import.meta.env.BASE_URL, entry.manifestPath);
  await learningRuntimeServices.ensureCourse(course);
  return course;
}

/** Exercise URLの永続IDをCourse階層へ解決し、存在しない参照だけを404へ変換する。 */
export async function exerciseLoader(args: CourseLoaderArgs) {
  const course = await courseLoader(args);
  try {
    const lesson = findLesson(course, args.params.lessonId ?? '');
    const exercise = findExercise(lesson, args.params.exerciseId ?? '');
    return { course, lesson, exercise };
  } catch {
    return throwContentNotFound();
  }
}

/** Exerciseの見直し許可一覧からCourse全体のSlideと所有Lessonを解決する。 */
export async function reviewLoader(args: CourseLoaderArgs) {
  const { course, lesson, exercise } = await exerciseLoader(args);
  const slideId = args.params.slideId ?? '';
  if (!exercise.relatedSlideIds.includes(slideId)) return throwContentNotFound();
  try {
    const reviewTarget = findSlideInCourse(course, slideId);
    return {
      course,
      lesson,
      exercise,
      slide: reviewTarget.slide,
      slideLesson: reviewTarget.lesson,
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
    case 'guided-project': {
      for (const exerciseId of lesson.completion.requiredExerciseIds) {
        if (!addExercise(exerciseById(lesson, exerciseId))) return undefined;
      }
      for (const checklistId of lesson.completion.requiredChecklistItemIds) {
        const checklistItems = lesson.project.checklist.filter(({ id }) => id === checklistId);
        const checklist = checklistItems.length === 1 ? checklistItems[0] : undefined;
        if (checklist === undefined || checklist.ruleIds.length === 0) return undefined;
        for (const requirementId of checklist.ruleIds) {
          if (!addExercise(exerciseByRequirement(lesson, requirementId))) return undefined;
        }
      }
      break;
    }
    case 'capstone':
      for (const requirementId of lesson.completion.requiredRuleIds) {
        if (!addExercise(exerciseByRequirement(lesson, requirementId))) return undefined;
      }
      break;
  }
  return targets.size > 0 ? [...targets.values()] : undefined;
}

/** Lesson完了対象とURL上のExerciseを統合し、canonicalなURL解決結果を優先する。 */
function completionRouteFreshnessExercises(
  lesson: Lesson,
  currentExercise: Exercise,
): readonly Exercise[] | undefined {
  const lessonTargets = completionFreshnessExercises(lesson);
  if (lessonTargets === undefined) return undefined;

  const targets = new Map(lessonTargets.map((exercise) => [exercise.id, exercise] as const));
  targets.set(currentExercise.id, currentExercise);
  return [...targets.values()];
}

/** Lesson完了対象とURL上のExerciseの永続snapshot・合格状態・同期dirtyで直リンクをguardする。 */
export async function completionLoader(args: CourseLoaderArgs) {
  const data = await exerciseLoader(args);
  const targets = completionRouteFreshnessExercises(data.lesson, data.exercise);
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
  const currentExerciseIsPassed =
    lessonProgress?.passedExerciseIds.includes(data.exercise.id) === true;
  const allTargetsAreFresh =
    targets !== undefined &&
    targets
      .map((exercise) => {
        const draft = draftByWorkspace.get(exercise.workspaceId);
        const snapshot = draft?.lastPassingSnapshots[exercise.id];
        const dirtyNow = learningRuntimeServices.passFreshness.isDirty(
          data.course.id,
          exercise.workspaceId,
          exercise.id,
        );
        return (
          !dirtyNow &&
          draft?.courseId === data.course.id &&
          draft.workspaceId === exercise.workspaceId &&
          draft.contentRevision === data.course.revision &&
          snapshot?.contentRevision === data.course.revision &&
          snapshot.editRevision === draft.editRevision
        );
      })
      .every(Boolean);
  if (
    progress?.courseId !== data.course.id ||
    progress.contentRevision !== data.course.revision ||
    lessonProgress?.currentComplete !== true ||
    !currentExerciseIsPassed ||
    !allTargetsAreFresh
  ) {
    // eslint-disable-next-line @typescript-eslint/only-throw-error -- React Routerへredirect Responseを渡すため送出する。
    throw redirect(
      `/courses/${data.course.id}/lessons/${data.lesson.id}/exercises/${data.exercise.id}`,
    );
  }
  return data;
}

/** Slide URLの永続IDを検証済みCourse階層へ解決し、画面に必要な3 entityを返す。 */
export async function slideLoader(args: CourseLoaderArgs) {
  const course = await courseLoader(args);

  try {
    const lesson = findLesson(course, args.params.lessonId ?? '');
    const slide = findSlide(lesson, args.params.slideId ?? '');
    return { course, lesson, slide };
  } catch {
    return throwContentNotFound();
  }
}
