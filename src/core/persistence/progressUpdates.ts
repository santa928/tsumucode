/** CourseProgressへSlide閲覧・判定・共有workspace編集を純粋に反映する。 */
import { findLessonOutline, resolveWorkspaceExerciseLocations } from '../content/selectors';
import type {
  CourseIndex,
  CourseManifest,
  Exercise,
  Lesson,
  LessonOutline,
} from '../content/types';
import { evaluateCompletionRequirement, preserveFirstCompletion } from '../learning/completion';
import type { ValidationResult } from '../validation/contracts';
import type { CourseProgress, ExerciseDraft, LessonProgress } from './contracts';

const unique = (items: readonly string[]): readonly string[] => [...new Set(items)];

/** Course内の全Lessonを教材順で返す。 */
function courseLessons(course: CourseManifest): readonly Lesson[] {
  return course.phases.flatMap(({ chapters }) => chapters.flatMap(({ lessons }) => lessons));
}

/** Courseと既存Progressのidentityが一致することを確認する。 */
function assertProgressIdentity(
  progress: CourseProgress | undefined,
  course: Pick<CourseManifest, 'id' | 'revision'>,
): void {
  if (
    progress !== undefined &&
    (progress.courseId !== course.id || progress.contentRevision !== course.revision)
  ) {
    throw new Error('CourseProgressのCourseまたはcontent revisionが一致しません');
  }
}

/** LessonとExerciseがCourse内のcanonicalな親子関係を持つことを確認する。 */
function assertTargetBelongsToCourse(
  course: CourseManifest,
  lesson: Lesson,
  exercise?: Exercise,
): void {
  const canonicalLesson = courseLessons(course).find(({ id }) => id === lesson.id);
  if (canonicalLesson === undefined) {
    throw new Error(`LessonがCourseにありません: ${lesson.id}`);
  }
  if (exercise !== undefined) {
    const canonicalExercise = canonicalLesson.exercises.find(({ id }) => id === exercise.id);
    if (canonicalExercise === undefined || canonicalExercise.workspaceId !== exercise.workspaceId) {
      throw new Error(`ExerciseがLessonまたはworkspaceに一致しません: ${exercise.id}`);
    }
  }
}

/** 未作成CourseProgressを現教材revisionで初期化する。 */
function initial(course: Pick<CourseManifest, 'id' | 'revision'>, now: string): CourseProgress {
  return {
    courseId: course.id,
    contentRevision: course.revision,
    lessons: {},
    currentComplete: false,
    updatedAt: now,
  };
}

/** Index outlineと読込済みLesson／Exerciseのcanonical対応を確認する。 */
function assertIndexTargetBelongsToCourse(
  course: CourseIndex,
  lesson: Lesson,
  exercise?: Exercise,
): LessonOutline {
  const outline = findLessonOutline(course, lesson.id);
  if (outline.kind !== lesson.kind) {
    throw new Error(`Lesson kindがCourse Indexと一致しません: ${lesson.id}`);
  }
  if (exercise !== undefined) {
    const canonicalExercise = outline.exercises.find(({ id }) => id === exercise.id);
    if (
      canonicalExercise === undefined ||
      canonicalExercise.kind !== exercise.kind ||
      canonicalExercise.workspaceId !== exercise.workspaceId
    ) {
      throw new Error(`ExerciseがLessonまたはworkspaceに一致しません: ${exercise.id}`);
    }
  }
  return outline;
}

/** Course IndexのoutlineだけでLessonとCourseの完了状態を再計算する。 */
function recalculateFromIndex(
  progress: CourseProgress,
  course: CourseIndex,
  lesson: LessonOutline,
  next: LessonProgress,
  now: string,
): CourseProgress {
  const completion = preserveFirstCompletion(
    next.firstCompletedAt,
    evaluateCompletionRequirement(lesson.completion, next),
    now,
  );
  const lessons = { ...progress.lessons, [lesson.id]: { ...next, ...completion } };
  const lessonIds = course.phases.flatMap(({ chapters }) =>
    chapters.flatMap(({ lessons: items }) => items.map(({ id }) => id)),
  );
  const currentChapterId = course.phases
    .flatMap(({ chapters }) => chapters)
    .find(({ lessons: items }) => items.some(({ id }) => id === lesson.id))?.id;
  if (currentChapterId === undefined) {
    throw new Error(`LessonのChapterがCourse Indexにありません: ${lesson.id}`);
  }
  const courseComplete =
    lessonIds.length > 0 && lessonIds.every((id) => lessons[id]?.currentComplete === true);
  return {
    ...progress,
    lessons,
    currentLessonId: lesson.id,
    currentChapterId,
    currentComplete: courseComplete,
    ...(progress.firstCompletedAt !== undefined || courseComplete
      ? { firstCompletedAt: progress.firstCompletedAt ?? now }
      : {}),
    updatedAt: now,
  };
}

/** 未作成LessonProgressを空のevidenceで初期化する。 */
function lessonState(lessonId: string, current?: LessonProgress): LessonProgress {
  if (current !== undefined && current.lessonId !== lessonId) {
    throw new Error(`LessonProgress keyとlessonIdが一致しません: ${lessonId}`);
  }
  return (
    current ?? {
      lessonId,
      viewedSlideIds: [],
      passedExerciseIds: [],
      passedChecklistItemIds: [],
      passedRuleIds: [],
      passedViewportIds: [],
      currentComplete: false,
    }
  );
}

/** Lesson完了を再計算し、Courseの現在地と初回完了日時を不変更新する。 */
function recalculate(
  progress: CourseProgress,
  course: CourseManifest,
  lesson: Lesson,
  next: LessonProgress,
  now: string,
): CourseProgress {
  const completion = preserveFirstCompletion(
    next.firstCompletedAt,
    evaluateCompletionRequirement(lesson.completion, next),
    now,
  );
  const lessons = { ...progress.lessons, [lesson.id]: { ...next, ...completion } };
  const lessonIds = courseLessons(course).map(({ id }) => id);
  const currentChapterId = course.phases
    .flatMap(({ chapters }) => chapters)
    .find(({ lessons: items }) => items.some(({ id }) => id === lesson.id))?.id;
  if (currentChapterId === undefined) {
    throw new Error(`LessonのChapterがCourseにありません: ${lesson.id}`);
  }
  const courseComplete =
    lessonIds.length > 0 && lessonIds.every((id) => lessons[id]?.currentComplete === true);
  return {
    ...progress,
    lessons,
    currentLessonId: lesson.id,
    currentChapterId,
    currentComplete: courseComplete,
    ...(progress.firstCompletedAt !== undefined || courseComplete
      ? { firstCompletedAt: progress.firstCompletedAt ?? now }
      : {}),
    updatedAt: now,
  };
}

/** Slide閲覧を重複なしで記録し、LessonとCourseの完了状態を再計算する。 */
export function recordSlideView(
  current: CourseProgress | undefined,
  course: CourseManifest,
  lesson: Lesson,
  slideId: string,
  now: string,
): CourseProgress {
  assertProgressIdentity(current, course);
  assertTargetBelongsToCourse(course, lesson);
  if (!lesson.slides.some(({ id }) => id === slideId)) {
    throw new Error(`SlideがLessonにありません: ${slideId}`);
  }
  const progress = current ?? initial(course, now);
  const state = lessonState(lesson.id, progress.lessons[lesson.id]);
  return recalculate(
    progress,
    course,
    lesson,
    {
      ...state,
      viewedSlideIds: unique([...state.viewedSlideIds, slideId]),
      currentSlideId: slideId,
    },
    now,
  );
}

/** Course Indexと現在LessonだけでSlide閲覧と完了状態を記録する。 */
export function recordSlideViewFromIndex(
  current: CourseProgress | undefined,
  course: CourseIndex,
  lesson: Lesson,
  slideId: string,
  now: string,
): CourseProgress {
  assertProgressIdentity(current, course);
  const outline = assertIndexTargetBelongsToCourse(course, lesson);
  if (
    !outline.slides.some(({ id }) => id === slideId) ||
    !lesson.slides.some(({ id }) => id === slideId)
  ) {
    throw new Error(`SlideがLessonまたはCourse Indexにありません: ${slideId}`);
  }
  const progress = current ?? initial(course, now);
  const state = lessonState(lesson.id, progress.lessons[lesson.id]);
  return recalculateFromIndex(
    progress,
    course,
    outline,
    {
      ...state,
      viewedSlideIds: unique([...state.viewedSlideIds, slideId]),
      currentSlideId: slideId,
    },
    now,
  );
}

/** Guided Projectの現在Rule evidenceから必須Checklist evidenceを再構築する。 */
function guidedChecklistEvidence(
  lesson: Lesson,
  passedRuleIds: readonly string[],
  current: readonly string[],
): readonly string[] {
  if (lesson.kind !== 'guided-project') return current;
  return lesson.project.checklist
    .filter(
      ({ required, ruleIds }) =>
        required && ruleIds.every((ruleId) => passedRuleIds.includes(ruleId)),
    )
    .map(({ id }) => id);
}

/** Index outlineの必須ChecklistとRule evidenceから現在Checklist evidenceを再構築する。 */
function guidedChecklistEvidenceFromIndex(
  lesson: LessonOutline,
  passedRuleIds: readonly string[],
  current: readonly string[],
): readonly string[] {
  if (lesson.kind !== 'guided-project') return current;
  return lesson.requiredChecklistItems
    .filter(({ ruleIds }) => ruleIds.every((ruleId) => passedRuleIds.includes(ruleId)))
    .map(({ id }) => id);
}

/** 最新Draftが直近pass snapshotと異なる間はExercise由来の現在evidenceを取り消す。 */
export function recordDraftMutation(
  current: CourseProgress | undefined,
  course: CourseManifest,
  lesson: Lesson,
  exercise: Exercise,
  draft: ExerciseDraft,
): CourseProgress | undefined {
  assertProgressIdentity(current, course);
  assertTargetBelongsToCourse(course, lesson, exercise);
  if (current === undefined) return undefined;
  if (
    draft.courseId !== course.id ||
    draft.contentRevision !== course.revision ||
    draft.workspaceId !== exercise.workspaceId
  ) {
    throw new Error('DraftのCourse、content revision、workspaceが対象と一致しません');
  }
  const snapshot = draft.lastPassingSnapshots[exercise.id];
  const stillPassing =
    snapshot?.contentRevision === draft.contentRevision &&
    snapshot.editRevision === draft.editRevision;
  if (stillPassing) return current;

  const state = lessonState(lesson.id, current.lessons[lesson.id]);
  const requirementIds = exercise.validationRules.map(({ groupId, id }) => groupId ?? id);
  const passedRuleIds = state.passedRuleIds.filter((id) => !requirementIds.includes(id));
  return recalculate(
    current,
    course,
    lesson,
    {
      ...state,
      passedExerciseIds: state.passedExerciseIds.filter((id) => id !== exercise.id),
      passedChecklistItemIds: guidedChecklistEvidence(
        lesson,
        passedRuleIds,
        state.passedChecklistItemIds,
      ),
      passedRuleIds,
      passedViewportIds: state.passedViewportIds.filter(
        (id) => !exercise.previewViewports.some(({ id: viewportId }) => viewportId === id),
      ),
    },
    draft.updatedAt,
  );
}

/** Course Indexと現在LessonだけでDraft編集によるpass evidence失効を反映する。 */
export function recordDraftMutationFromIndex(
  current: CourseProgress | undefined,
  course: CourseIndex,
  lesson: Lesson,
  exercise: Exercise,
  draft: ExerciseDraft,
): CourseProgress | undefined {
  assertProgressIdentity(current, course);
  const outline = assertIndexTargetBelongsToCourse(course, lesson, exercise);
  if (current === undefined) return undefined;
  if (
    draft.courseId !== course.id ||
    draft.lessonId !== lesson.id ||
    draft.exerciseId !== exercise.id ||
    draft.contentRevision !== course.revision ||
    draft.workspaceId !== exercise.workspaceId
  ) {
    throw new Error('DraftがCourse Index、Lesson、Exerciseまたはworkspaceに一致しません');
  }
  const snapshot = draft.lastPassingSnapshots[exercise.id];
  const stillPassing =
    snapshot?.contentRevision === draft.contentRevision &&
    snapshot.editRevision === draft.editRevision;
  if (stillPassing) return current;

  const state = lessonState(lesson.id, current.lessons[lesson.id]);
  const requirementIds = exercise.validationRules.map(({ groupId, id }) => groupId ?? id);
  const passedRuleIds = state.passedRuleIds.filter((id) => !requirementIds.includes(id));
  return recalculateFromIndex(
    current,
    course,
    outline,
    {
      ...state,
      passedExerciseIds: state.passedExerciseIds.filter((id) => id !== exercise.id),
      passedChecklistItemIds: guidedChecklistEvidenceFromIndex(
        outline,
        passedRuleIds,
        state.passedChecklistItemIds,
      ),
      passedRuleIds,
      passedViewportIds: state.passedViewportIds.filter(
        (id) => !exercise.previewViewports.some(({ id: viewportId }) => viewportId === id),
      ),
    },
    draft.updatedAt,
  );
}

/** 単一Exerciseの判定結果を所属Lessonへ反映して完了状態を再計算する。 */
export function recordValidation(
  current: CourseProgress | undefined,
  course: CourseManifest,
  lesson: Lesson,
  exercise: Exercise,
  result: ValidationResult,
): CourseProgress {
  assertProgressIdentity(current, course);
  assertTargetBelongsToCourse(course, lesson, exercise);
  if (result.exerciseId !== exercise.id) {
    throw new Error(`Validation resultのExercise IDが一致しません: ${result.exerciseId}`);
  }
  const progress = current ?? initial(course, result.evaluatedAt);
  const state = lessonState(lesson.id, progress.lessons[lesson.id]);
  const requirementIds = exercise.validationRules.map(({ groupId, id }) => groupId ?? id);
  if (result.passedRequirementIds.some((id) => !requirementIds.includes(id))) {
    throw new Error('Validation resultに対象Exercise外のrequirement evidenceが含まれています');
  }
  const passedRuleIds = unique([
    ...state.passedRuleIds.filter((id) => !requirementIds.includes(id)),
    ...result.passedRequirementIds,
  ]);
  const passed = result.status === 'pass';
  return recalculate(
    progress,
    course,
    lesson,
    {
      ...state,
      passedExerciseIds: passed
        ? unique([...state.passedExerciseIds, exercise.id])
        : state.passedExerciseIds.filter((id) => id !== exercise.id),
      passedChecklistItemIds: guidedChecklistEvidence(
        lesson,
        passedRuleIds,
        state.passedChecklistItemIds,
      ),
      passedRuleIds,
      passedViewportIds: passed
        ? unique([...state.passedViewportIds, ...exercise.previewViewports.map(({ id }) => id)])
        : state.passedViewportIds.filter(
            (id) => !exercise.previewViewports.some(({ id: viewportId }) => viewportId === id),
          ),
    },
    result.evaluatedAt,
  );
}

/** Course Indexと現在Lessonだけで単一Exerciseの判定結果を進捗へ反映する。 */
export function recordValidationFromIndex(
  current: CourseProgress | undefined,
  course: CourseIndex,
  lesson: Lesson,
  exercise: Exercise,
  result: ValidationResult,
): CourseProgress {
  assertProgressIdentity(current, course);
  const outline = assertIndexTargetBelongsToCourse(course, lesson, exercise);
  if (result.exerciseId !== exercise.id) {
    throw new Error(`Validation resultのExercise IDが一致しません: ${result.exerciseId}`);
  }
  const progress = current ?? initial(course, result.evaluatedAt);
  const state = lessonState(lesson.id, progress.lessons[lesson.id]);
  const requirementIds = exercise.validationRules.map(({ groupId, id }) => groupId ?? id);
  if (result.passedRequirementIds.some((id) => !requirementIds.includes(id))) {
    throw new Error('Validation resultに対象Exercise外のrequirement evidenceが含まれています');
  }
  const passedRuleIds = unique([
    ...state.passedRuleIds.filter((id) => !requirementIds.includes(id)),
    ...result.passedRequirementIds,
  ]);
  const passed = result.status === 'pass';
  return recalculateFromIndex(
    progress,
    course,
    outline,
    {
      ...state,
      passedExerciseIds: passed
        ? unique([...state.passedExerciseIds, exercise.id])
        : state.passedExerciseIds.filter((id) => id !== exercise.id),
      passedChecklistItemIds: guidedChecklistEvidenceFromIndex(
        outline,
        passedRuleIds,
        state.passedChecklistItemIds,
      ),
      passedRuleIds,
      passedViewportIds: passed
        ? unique([...state.passedViewportIds, ...exercise.previewViewports.map(({ id }) => id)])
        : state.passedViewportIds.filter(
            (id) => !exercise.previewViewports.some(({ id: viewportId }) => viewportId === id),
          ),
    },
    result.evaluatedAt,
  );
}

export interface WorkspaceValidationTarget {
  readonly lesson: Lesson;
  readonly exercise: Exercise;
}

/** Course全体から同じworkspaceを共有する全Exerciseを教材順で返す。 */
export function findWorkspaceTargets(
  course: CourseManifest,
  currentExerciseId: string,
): readonly WorkspaceValidationTarget[] {
  const lessons = courseLessons(course);
  const all = lessons.flatMap((lesson) =>
    lesson.exercises.map((exercise) => ({ lesson, exercise })),
  );
  const duplicateIds = all.filter(
    ({ exercise }, index) =>
      all.findIndex((target) => target.exercise.id === exercise.id) !== index,
  );
  if (duplicateIds.length > 0) {
    throw new Error(`Course内でExercise IDが重複しています: ${duplicateIds[0]!.exercise.id}`);
  }
  const current = all.find(({ exercise }) => exercise.id === currentExerciseId);
  if (current === undefined) {
    throw new Error(`ExerciseがCourseにありません: ${currentExerciseId}`);
  }
  return all.filter(({ exercise }) => exercise.workspaceId === current.exercise.workspaceId);
}

/** 現在工程までのworkspace Exerciseだけを同じsnapshotで累積再判定する。 */
export function findWorkspaceValidationTargets(
  course: CourseManifest,
  currentExerciseId: string,
): readonly WorkspaceValidationTarget[];
export function findWorkspaceValidationTargets(
  course: CourseIndex,
  loadedLessons: readonly Lesson[],
  currentExerciseId: string,
): readonly WorkspaceValidationTarget[];
export function findWorkspaceValidationTargets(
  course: CourseManifest | CourseIndex,
  loadedLessonsOrExerciseId: readonly Lesson[] | string,
  currentExerciseId?: string,
): readonly WorkspaceValidationTarget[] {
  if (typeof loadedLessonsOrExerciseId !== 'string') {
    if (currentExerciseId === undefined) throw new Error('現在Exercise IDが必要です');
    const lessonById = new Map<string, Lesson>();
    for (const lesson of loadedLessonsOrExerciseId) {
      if (lessonById.has(lesson.id)) {
        throw new Error(`読込済みWorkspace Lesson IDが重複しています: ${lesson.id}`);
      }
      lessonById.set(lesson.id, lesson);
    }
    return resolveWorkspaceExerciseLocations(course as CourseIndex, currentExerciseId).map(
      (location) => {
        const lesson = lessonById.get(location.lessonId);
        if (lesson === undefined) {
          throw new Error(`Workspace Lessonが未読込です: ${location.lessonId}`);
        }
        const exercise = lesson.exercises.find(({ id }) => id === location.exerciseId);
        if (exercise === undefined) {
          throw new Error(
            `Workspace Exerciseが未読込です: ${location.lessonId}/${location.exerciseId}`,
          );
        }
        const outline = findLessonOutline(course as CourseIndex, location.lessonId);
        const exerciseOutline = outline.exercises.find(({ id }) => id === location.exerciseId);
        if (
          exerciseOutline?.workspaceId !== exercise.workspaceId ||
          exerciseOutline.kind !== exercise.kind
        ) {
          throw new Error(`Workspace対応がIndexとLessonで一致しません: ${location.exerciseId}`);
        }
        return { lesson, exercise };
      },
    );
  }

  const exerciseId = loadedLessonsOrExerciseId;
  const allTargets = findWorkspaceTargets(course, exerciseId);
  const currentIndex = allTargets.findIndex(({ exercise }) => exercise.id === exerciseId);
  if (currentIndex < 0) {
    throw new Error(`Workspace内に現在Exerciseがありません: ${exerciseId}`);
  }
  return allTargets.slice(0, currentIndex + 1);
}

/** target batchの非空・重複・canonical関係・単一workspaceを検証する。 */
function assertWorkspaceTargets(
  course: CourseManifest,
  targets: readonly WorkspaceValidationTarget[],
): string {
  if (targets.length === 0) throw new Error('workspace target batchは空にできません');
  const ids = new Set<string>();
  const workspaceId = targets[0]!.exercise.workspaceId;
  for (const { lesson, exercise } of targets) {
    if (ids.has(exercise.id)) {
      throw new Error(`workspace targetのExercise IDが重複しています: ${exercise.id}`);
    }
    ids.add(exercise.id);
    assertTargetBelongsToCourse(course, lesson, exercise);
    if (exercise.workspaceId !== workspaceId) {
      throw new Error('workspace target batchに異なるworkspaceが含まれています');
    }
  }
  return workspaceId;
}

/** 共有workspace編集時に同workspaceの現在完了evidenceをすべて取り消す。 */
export function recordWorkspaceDraftMutation(
  current: CourseProgress | undefined,
  course: CourseManifest,
  targets: readonly WorkspaceValidationTarget[],
  draft: ExerciseDraft,
): CourseProgress | undefined {
  assertProgressIdentity(current, course);
  const workspaceId = assertWorkspaceTargets(course, targets);
  if (workspaceId !== draft.workspaceId) {
    throw new Error('Draftとtarget batchのworkspaceが一致しません');
  }
  const draftLesson = courseLessons(course).find(({ id }) => id === draft.lessonId);
  const draftTarget = targets.find(({ exercise }) => exercise.id === draft.exerciseId);
  if (
    draft.courseId !== course.id ||
    draft.contentRevision !== course.revision ||
    draftLesson === undefined ||
    draftTarget === undefined ||
    draftTarget.lesson.id !== draft.lessonId
  ) {
    throw new Error('DraftがCourseまたはworkspace targetに一致しません');
  }
  if (current === undefined) return undefined;

  const invalidated = targets.reduce<CourseProgress>(
    (progress, { lesson, exercise }) =>
      recordDraftMutation(progress, course, lesson, exercise, draft) ?? progress,
    current,
  );
  const currentChapterId = course.phases
    .flatMap(({ chapters }) => chapters)
    .find(({ lessons }) => lessons.some(({ id }) => id === draft.lessonId))?.id;
  if (currentChapterId === undefined) {
    throw new Error(`DraftのLessonがCourseにありません: ${draft.lessonId}`);
  }
  return {
    ...invalidated,
    currentLessonId: draft.lessonId,
    currentChapterId,
  };
}

export type WorkspaceValidationResult = WorkspaceValidationTarget & {
  readonly result: ValidationResult;
};

/** 同一snapshotで再判定した各Exercise結果を全所属Lessonへ反映する。 */
export function recordWorkspaceValidation(
  current: CourseProgress | undefined,
  course: CourseManifest,
  batch: readonly WorkspaceValidationResult[],
): CourseProgress {
  assertProgressIdentity(current, course);
  assertWorkspaceTargets(course, batch);
  const revision = batch[0]!.result.executionRevision;
  const evaluatedAt = batch[0]!.result.evaluatedAt;
  if (revision === null || !Number.isInteger(revision) || revision < 0) {
    throw new Error('validation batchのexecution revisionが不正です');
  }
  for (const { exercise, result } of batch) {
    if (result.exerciseId !== exercise.id) {
      throw new Error(`Validation resultのExercise IDが一致しません: ${result.exerciseId}`);
    }
    if (result.executionRevision !== revision) {
      throw new Error('validation batchは同じsnapshot revisionである必要があります');
    }
    if (result.evaluatedAt !== evaluatedAt) {
      throw new Error('validation batchは同じevaluatedAtである必要があります');
    }
  }
  return batch.reduce<CourseProgress>(
    (progress, { lesson, exercise, result }) =>
      recordValidation(progress, course, lesson, exercise, result),
    current ?? initial(course, evaluatedAt),
  );
}
