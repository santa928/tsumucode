/** Lesson・Chapter・Courseの現在完了状態と初回完了日時を純粋に評価する。 */
import type { Lesson } from '../content/types';
import type { LessonProgress } from '../persistence/contracts';

export interface CompletionEvidence {
  readonly viewedSlideIds: readonly string[];
  readonly passedExerciseIds: readonly string[];
  readonly passedChecklistItemIds: readonly string[];
  readonly passedRuleIds: readonly string[];
  readonly passedViewportIds: readonly string[];
}

export type CompletionRequirement = Lesson['completion'];

export interface CompletionStatus {
  readonly currentComplete: boolean;
  readonly firstCompletedAt?: string;
}

interface ChapterCompletionSource {
  readonly lessons: readonly { readonly id: string }[];
}

interface CourseCompletionSource {
  readonly phases: readonly {
    readonly chapters: readonly { readonly id: string }[];
  }[];
}

/** 必須IDの空集合を満たすものとして、全IDが実績に含まれるかを判定する。 */
function includesEvery(actual: readonly string[], required: readonly string[]): boolean {
  return required.every((id) => actual.includes(id));
}

/** Lesson kindごとの必須evidenceが揃っているかを入力変更なしで判定する。 */
export function evaluateCompletionRequirement(
  requirement: CompletionRequirement,
  evidence: CompletionEvidence,
): boolean {
  switch (requirement.kind) {
    case 'standard':
      return (
        evidence.viewedSlideIds.includes(requirement.finalSlideId) &&
        includesEvery(evidence.passedExerciseIds, requirement.requiredExerciseIds)
      );
    case 'guided-project':
      return (
        includesEvery(evidence.passedChecklistItemIds, requirement.requiredChecklistItemIds) &&
        includesEvery(evidence.passedExerciseIds, requirement.requiredExerciseIds)
      );
    case 'capstone':
      return (
        includesEvery(evidence.passedRuleIds, requirement.requiredRuleIds) &&
        includesEvery(evidence.passedViewportIds, requirement.requiredViewportIds)
      );
  }
}

/** 現在の達成状態を更新しつつ、既存または今回成立した初回完了日時を保持する。 */
export function preserveFirstCompletion(
  firstCompletedAt: string | undefined,
  currentComplete: boolean,
  now: string,
): CompletionStatus {
  return {
    currentComplete,
    ...(firstCompletedAt || currentComplete ? { firstCompletedAt: firstCompletedAt ?? now } : {}),
  };
}

/** Lesson要件をevidenceで再評価し、現在状態と履歴上の初回完了日時を分離して返す。 */
export function evaluateLessonCompletion(
  lesson: Pick<Lesson, 'completion'>,
  evidence: CompletionEvidence,
  previous: Pick<LessonProgress, 'firstCompletedAt'> | undefined,
  now: string,
): CompletionStatus {
  return preserveFirstCompletion(
    previous?.firstCompletedAt,
    evaluateCompletionRequirement(lesson.completion, evidence),
    now,
  );
}

/** Chapter所属LessonをIDで照合し、空でない全Lessonが現在完了かを判定する。 */
export function evaluateChapterCompletion(
  chapter: ChapterCompletionSource,
  lessons: Readonly<Record<string, Pick<LessonProgress, 'currentComplete'>>>,
): boolean {
  return (
    chapter.lessons.length > 0 &&
    chapter.lessons.every((lesson) => lessons[lesson.id]?.currentComplete === true)
  );
}

/** Course全Phase配下のChapterをIDで照合し、空でない全Chapterが現在完了かを判定する。 */
export function evaluateCourseCompletion(
  course: CourseCompletionSource,
  chapters: Readonly<Record<string, Pick<CompletionStatus, 'currentComplete'>>>,
): boolean {
  const courseChapters = course.phases.flatMap((phase) => phase.chapters);

  return (
    courseChapters.length > 0 &&
    courseChapters.every((chapter) => chapters[chapter.id]?.currentComplete === true)
  );
}

/** 空でないLesson状態集合について、全件が現在完了しているかを純粋に判定する。 */
export function everyLessonComplete(
  statuses: readonly { readonly currentComplete: boolean }[],
): boolean {
  return statuses.length > 0 && statuses.every(({ currentComplete }) => currentComplete);
}
