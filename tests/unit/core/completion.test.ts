import { describe, expect, it } from 'vitest';
import {
  evaluateChapterCompletion,
  evaluateCompletionRequirement,
  evaluateCourseCompletion,
  evaluateLessonCompletion,
  everyLessonComplete,
  preserveFirstCompletion,
} from '../../../src/core/learning/completion';
import type { CompletionEvidence } from '../../../src/core/learning/completion';
import { fixtureCourse } from '../../fixtures/course';

describe('lesson 完了規則', () => {
  const emptyEvidence: CompletionEvidence = {
    viewedSlideIds: [],
    passedExerciseIds: [],
    passedChecklistItemIds: [],
    passedRuleIds: [],
    passedViewportIds: [],
  };

  describe('standard', () => {
    const requirement = {
      kind: 'standard' as const,
      finalSlideId: 'slide-last',
      requiredExerciseIds: ['ex-a', 'ex-b'],
    };

    it.each([
      {
        name: 'final slideが欠けると未完了',
        evidence: {
          ...emptyEvidence,
          passedExerciseIds: ['ex-a', 'ex-b'],
        },
        expected: false,
      },
      {
        name: 'required exercise ex-aが欠けると未完了',
        evidence: {
          ...emptyEvidence,
          viewedSlideIds: ['slide-last'],
          passedExerciseIds: ['ex-b'],
        },
        expected: false,
      },
      {
        name: 'required exercise ex-bが欠けると未完了',
        evidence: {
          ...emptyEvidence,
          viewedSlideIds: ['slide-last'],
          passedExerciseIds: ['ex-a'],
        },
        expected: false,
      },
      {
        name: 'final slideと全required exerciseが揃うと完了',
        evidence: {
          ...emptyEvidence,
          viewedSlideIds: ['slide-last'],
          passedExerciseIds: ['ex-a', 'ex-b'],
        },
        expected: true,
      },
    ])('$name', ({ evidence, expected }) => {
      expect(evaluateCompletionRequirement(requirement, evidence)).toBe(expected);
    });
  });

  describe('guided-project', () => {
    const requirement = {
      kind: 'guided-project' as const,
      requiredChecklistItemIds: ['check-a', 'check-b'],
      requiredExerciseIds: ['ex-a', 'ex-b'],
    };

    it.each([
      {
        name: 'required checklist check-aが欠けると未完了',
        evidence: {
          ...emptyEvidence,
          passedChecklistItemIds: ['check-b'],
          passedExerciseIds: ['ex-a', 'ex-b'],
        },
        expected: false,
      },
      {
        name: 'required checklist check-bが欠けると未完了',
        evidence: {
          ...emptyEvidence,
          passedChecklistItemIds: ['check-a'],
          passedExerciseIds: ['ex-a', 'ex-b'],
        },
        expected: false,
      },
      {
        name: 'required exercise ex-aが欠けると未完了',
        evidence: {
          ...emptyEvidence,
          passedChecklistItemIds: ['check-a', 'check-b'],
          passedExerciseIds: ['ex-b'],
        },
        expected: false,
      },
      {
        name: 'required exercise ex-bが欠けると未完了',
        evidence: {
          ...emptyEvidence,
          passedChecklistItemIds: ['check-a', 'check-b'],
          passedExerciseIds: ['ex-a'],
        },
        expected: false,
      },
      {
        name: '全required checklistとexerciseが揃うと完了',
        evidence: {
          ...emptyEvidence,
          passedChecklistItemIds: ['check-a', 'check-b'],
          passedExerciseIds: ['ex-a', 'ex-b'],
        },
        expected: true,
      },
    ])('$name', ({ evidence, expected }) => {
      expect(evaluateCompletionRequirement(requirement, evidence)).toBe(expected);
    });
  });

  describe('capstone', () => {
    const requirement = {
      kind: 'capstone' as const,
      requiredRuleIds: ['rule-a', 'rule-b'],
      requiredViewportIds: ['desktop', 'mobile'],
    };

    it.each([
      {
        name: 'required rule rule-aが欠けると未完了',
        evidence: {
          ...emptyEvidence,
          passedRuleIds: ['rule-b'],
          passedViewportIds: ['desktop', 'mobile'],
        },
        expected: false,
      },
      {
        name: 'required rule rule-bが欠けると未完了',
        evidence: {
          ...emptyEvidence,
          passedRuleIds: ['rule-a'],
          passedViewportIds: ['desktop', 'mobile'],
        },
        expected: false,
      },
      {
        name: 'required viewport desktopが欠けると未完了',
        evidence: {
          ...emptyEvidence,
          passedRuleIds: ['rule-a', 'rule-b'],
          passedViewportIds: ['mobile'],
        },
        expected: false,
      },
      {
        name: 'required viewport mobileが欠けると未完了',
        evidence: {
          ...emptyEvidence,
          passedRuleIds: ['rule-a', 'rule-b'],
          passedViewportIds: ['desktop'],
        },
        expected: false,
      },
      {
        name: '全required ruleとviewportが揃うと完了',
        evidence: {
          ...emptyEvidence,
          passedRuleIds: ['rule-a', 'rule-b'],
          passedViewportIds: ['desktop', 'mobile'],
        },
        expected: true,
      },
    ])('$name', ({ evidence, expected }) => {
      expect(evaluateCompletionRequirement(requirement, evidence)).toBe(expected);
    });
  });

  it('現在未達へ戻っても初回完了日時を保持する', () => {
    expect(
      preserveFirstCompletion('2026-07-10T00:00:00.000Z', false, '2026-07-11T00:00:00.000Z'),
    ).toEqual({
      currentComplete: false,
      firstCompletedAt: '2026-07-10T00:00:00.000Z',
    });
    expect(preserveFirstCompletion(undefined, false, '2026-07-11T00:00:00.000Z')).toEqual({
      currentComplete: false,
    });
  });

  it('Lesson、Chapter、CourseをIDで集約し、初回完了日時を保持する', () => {
    const chapter = fixtureCourse.phases[0]!.chapters[0]!;
    const lesson = chapter.lessons[0]!;
    const lessonCompletion = evaluateLessonCompletion(
      lesson,
      {
        viewedSlideIds: ['slide-html-role'],
        passedExerciseIds: ['exercise-first-heading'],
        passedChecklistItemIds: [],
        passedRuleIds: [],
        passedViewportIds: [],
      },
      undefined,
      '2026-07-10T00:00:00.000Z',
    );

    expect(lessonCompletion).toEqual({
      currentComplete: true,
      firstCompletedAt: '2026-07-10T00:00:00.000Z',
    });
    expect(
      evaluateChapterCompletion(chapter, {
        [lesson.id]: lessonCompletion,
      }),
    ).toBe(true);
    expect(evaluateChapterCompletion(chapter, {})).toBe(false);
    expect(evaluateChapterCompletion({ lessons: [] }, {})).toBe(false);
    expect(everyLessonComplete([])).toBe(false);
    expect(everyLessonComplete([{ currentComplete: true }])).toBe(true);
    expect(
      evaluateCourseCompletion(fixtureCourse, {
        [chapter.id]: { currentComplete: true },
      }),
    ).toBe(true);
    expect(evaluateCourseCompletion(fixtureCourse, {})).toBe(false);
    expect(evaluateCourseCompletion({ phases: [] }, {})).toBe(false);
  });
});
