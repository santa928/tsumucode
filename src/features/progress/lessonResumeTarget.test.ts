import { expect, it } from 'vitest';
import { fixtureCourseIndex } from '../../../tests/fixtures/course';
import type { LessonOutline } from '../../core/content/types';
import type { CourseProgress, ExerciseDraft } from '../../core/persistence/contracts';
import { lessonResumeTarget } from './lessonResumeTarget';

const course = fixtureCourseIndex;
const lesson = course.phases[0]!.chapters[0]!.lessons[0]!;
const exercise = lesson.exercises[0]!;

/** 現行教材に属する未完了の編集を作り、候補選択だけを検査する。 */
function draft(overrides: Partial<ExerciseDraft> = {}): ExerciseDraft {
  return {
    courseId: course.id,
    lessonId: lesson.id,
    exerciseId: exercise.id,
    workspaceId: exercise.workspaceId,
    contentRevision: course.revision,
    editRevision: 1,
    files: { 'index.html': '<h1>保存した編集</h1>' },
    selectedFile: 'index.html',
    cursors: {},
    validationHistory: [],
    revealedHintIds: [],
    lastPassingSnapshots: {},
    updatedAt: '2026-10-14T00:00:00Z',
    ...overrides,
  };
}

/** 閲覧済みSlideと合格Exerciseを持つ、同revisionの進捗を作る。 */
function progress(
  currentSlideId: string,
  viewedSlideIds: readonly string[] = [],
  passedExerciseIds: readonly string[] = [],
): CourseProgress {
  return {
    courseId: course.id,
    contentRevision: course.revision,
    currentLessonId: lesson.id,
    lessons: {
      [lesson.id]: {
        lessonId: lesson.id,
        viewedSlideIds,
        currentSlideId,
        passedExerciseIds,
        passedChecklistItemIds: [],
        passedRuleIds: [],
        passedViewportIds: [],
        currentComplete: false,
      },
    },
    currentComplete: false,
    updatedAt: '2026-10-14T00:00:00Z',
  };
}

it('保存なしは既存の開始Slideを維持する', () => {
  expect(lessonResumeTarget(course, lesson, undefined, new Map())).toEqual({
    kind: 'slide',
    targetId: lesson.slides[0]!.id,
  });
});

it('同Lessonの有効な未完了Draftへ戻り、保存値を変更しない', () => {
  const saved = draft();
  const before = structuredClone(saved);
  expect(
    lessonResumeTarget(course, lesson, undefined, new Map([[exercise.workspaceId, saved]])),
  ).toEqual({ kind: 'exercise', targetId: exercise.id });
  expect(saved).toEqual(before);
});

it('最終Slideを読み終えたら未合格Exerciseへ再開する', () => {
  const finalSlideId = lesson.slides.at(-1)!.id;
  expect(
    lessonResumeTarget(course, lesson, progress(finalSlideId, [finalSlideId]), new Map()),
  ).toEqual({ kind: 'exercise', targetId: exercise.id });
});

it('最後の閲覧Slideが未知なら不正なURLを作らず開始先へ戻す', () => {
  expect(lessonResumeTarget(course, lesson, progress('unknown-slide'), new Map())).toEqual({
    kind: 'slide',
    targetId: lesson.slides[0]!.id,
  });
});

it.each([
  { courseId: 'other-course' },
  { contentRevision: 'old-revision' },
  { lessonId: 'other-lesson' },
  { exerciseId: 'unknown-exercise' },
  { workspaceId: 'other-workspace' },
  { updatedAt: 'invalid-time' },
])('保存Draftの所有関係・revision・時刻が不正なら使わない: %j', (overrides) => {
  expect(
    lessonResumeTarget(
      course,
      lesson,
      undefined,
      new Map([[exercise.workspaceId, draft(overrides)]]),
    ),
  ).toEqual({
    kind: 'slide',
    targetId: lesson.slides[0]!.id,
  });
});

it('読取workspaceキーとDraftが一致しなければ別workspaceへ再開しない', () => {
  expect(
    lessonResumeTarget(course, lesson, undefined, new Map([['wrong-read-key', draft()]])),
  ).toEqual({ kind: 'slide', targetId: lesson.slides[0]!.id });
});

it('合格済みExerciseのDraftだけなら読書を再開し、別Course進捗は無視する', () => {
  const saved = new Map([[exercise.workspaceId, draft()]]);
  expect(
    lessonResumeTarget(course, lesson, progress(lesson.slides[0]!.id, [], [exercise.id]), saved),
  ).toEqual({
    kind: 'slide',
    targetId: lesson.slides[0]!.id,
  });
  expect(
    lessonResumeTarget(
      course,
      lesson,
      { ...progress(lesson.slides[0]!.id, [], [exercise.id]), courseId: 'other' },
      saved,
    ),
  ).toEqual({ kind: 'exercise', targetId: exercise.id });
});

it('複数workspaceは最新の未完了Draftを選び、同時刻なら教材順にする', () => {
  const second = { ...exercise, id: 'second-exercise', workspaceId: 'second-workspace' };
  const twoExercises = { ...lesson, exercises: [exercise, second] };
  const first = draft();
  const later = draft({
    exerciseId: second.id,
    workspaceId: second.workspaceId,
    updatedAt: '2026-10-14T01:00:00Z',
  });
  const saved = new Map([
    [exercise.workspaceId, first],
    [second.workspaceId, later],
  ]);
  expect(lessonResumeTarget(course, twoExercises, undefined, saved)).toEqual({
    kind: 'exercise',
    targetId: second.id,
  });
  saved.set(second.workspaceId, { ...later, updatedAt: first.updatedAt });
  expect(lessonResumeTarget(course, twoExercises, undefined, saved)).toEqual({
    kind: 'exercise',
    targetId: exercise.id,
  });
});

it('途中SlideはそのSlideに戻り、古いrevision進捗からURLを作らない', () => {
  const extraSlide = { ...lesson.slides[0]!, id: 'middle-slide' };
  const threeSlides = {
    ...lesson,
    kind: 'standard' as const,
    slides: [lesson.slides[0]!, extraSlide, { ...extraSlide, id: 'final-slide' }],
    completion: {
      kind: 'standard' as const,
      finalSlideId: 'final-slide',
      requiredExerciseIds: [exercise.id],
    },
  };
  expect(lessonResumeTarget(course, threeSlides, progress(extraSlide.id), new Map())).toEqual({
    kind: 'slide',
    targetId: extraSlide.id,
  });
  expect(
    lessonResumeTarget(
      course,
      threeSlides,
      { ...progress(extraSlide.id), contentRevision: 'old' },
      new Map(),
    ),
  ).toEqual({ kind: 'slide', targetId: lesson.slides[0]!.id });
});

it('制作の共有workspaceでも別Lesson所有のDraftへ飛ばず、選択Lesson内を開く', () => {
  const project: LessonOutline = {
    ...lesson,
    kind: 'guided-project',
    requiredChecklistItems: [],
    completion: {
      kind: 'guided-project',
      requiredChecklistItemIds: ['project-check'],
      requiredExerciseIds: [exercise.id],
    },
  };
  const otherLessonDraft = draft({
    lessonId: 'previous-project-lesson',
    exerciseId: 'previous-exercise',
  });
  expect(
    lessonResumeTarget(
      course,
      project,
      undefined,
      new Map([[exercise.workspaceId, otherLessonDraft]]),
    ),
  ).toEqual({ kind: 'exercise', targetId: exercise.id });
});
