import { describe, expect, it } from 'vitest';
import { fixtureCourse } from '../../fixtures/course';
import { splitCourseArtifacts } from '../../../scripts/content/splitCourseArtifacts';
import {
  exerciseReferenceIds,
  exerciseRequirementIds,
} from '../../../src/core/content/exerciseRequirementIds';
import {
  IdSchema,
  LessonSchema,
  ProgressMigrationStepSchema,
  ProgressRuleReferenceIdSchema,
} from '../../../src/core/content/schema';
import type { Exercise } from '../../../src/core/content/types';

/** 通常のgroup集約とDOM checkpointを同時に持つ、参照境界用Exercise。 */
function domExercise(): Exercise {
  const original = fixtureCourse.phases[0]!.chapters[0]!.lessons[0]!.exercises[0]!;
  return {
    ...original,
    files: [
      ...original.files,
      { path: 'script.js', language: 'javascript', editable: true, content: 'console.log(1);' },
    ],
    runtime: {
      kind: 'javascript',
      entryFile: 'script.js',
      sourceType: 'script',
      capabilityProfile: 'dom',
      primaryOutput: 'preview',
    },
    validationRules: original.validationRules.map((rule, index) => ({
      ...rule,
      groupId: 'heading-group',
      ...(index === 0
        ? {
            target: { kind: 'javascript-source' as const, file: 'script.js' },
            assertion: {
              kind: 'query-selector-text-content-assignment' as const,
              selector: '#answer',
              expected: '1',
            },
          }
        : {}),
    })),
    interactionScenarios: [
      {
        id: 'answer-flow',
        label: '回答',
        actions: [{ id: 'answer', kind: 'click', selector: '#answer' }],
        checkpoints: [
          {
            id: 'answered',
            afterActionId: 'answer',
            expectations: [{ id: 'exists', kind: 'selector-exists', selector: '#answer' }],
          },
        ],
      },
    ],
  };
}

describe('Exerciseの進捗ID契約', () => {
  it('合格はgroupとcheckpointに集約し、履歴参照にはruleとexpectationも残す', () => {
    const exercise = domExercise();
    expect(exerciseRequirementIds(exercise)).toEqual([
      'heading-group',
      'interaction:answer-flow:answered',
    ]);
    expect(exerciseReferenceIds(exercise)).toEqual([
      ...exercise.validationRules.flatMap((rule, index) =>
        index === 0 ? [rule.id, 'heading-group'] : [rule.id],
      ),
      'interaction:answer-flow:answered',
      'interaction:answer-flow:answered:exists',
    ]);
  });

  it('正規Compilerがcheckpointとcheckの両参照をIndexへ保持する', () => {
    const course = structuredClone(fixtureCourse);
    course.runnerId = 'javascript';
    course.validatorId = 'javascript';
    course.phases[0]!.chapters[0]!.lessons[0]!.exercises = [domExercise()];
    const { index } = splitCourseArtifacts(course);
    expect(index.entityIds.rule).toEqual(exerciseReferenceIds(domExercise()));
  });

  it('別Exercise間のcheckpoint衝突を拒否し、異なるscenarioの同checkpoint名は許可する', () => {
    const first = domExercise();
    const second = { ...domExercise(), id: 'other-exercise', workspaceId: 'other-workspace' };
    const lesson = {
      ...fixtureCourse.phases[0]!.chapters[0]!.lessons[0]!,
      exercises: [first, second],
    };
    const collision = LessonSchema.safeParse(lesson);
    expect(collision.success).toBe(false);
    if (!collision.success)
      expect(
        collision.error.issues.some((issue) => issue.message.includes('操作checkpoint IDが重複')),
      ).toBe(true);
    expect(
      LessonSchema.safeParse({
        ...lesson,
        exercises: [
          first,
          {
            ...second,
            interactionScenarios: second.interactionScenarios!.map((scenario) => ({
              ...scenario,
              id: 'other-flow',
            })),
          },
        ],
      }).success,
    ).toBe(true);
  });

  it('合成IDの許可をrule参照へ限定し、形式不正と他entityへの混入を拒否する', () => {
    for (const id of [
      'interaction:answer-flow:answered',
      'interaction:answer-flow:answered:exists',
    ]) {
      expect(ProgressRuleReferenceIdSchema.safeParse(id).success).toBe(true);
      expect(IdSchema.safeParse(id).success).toBe(false);
      expect(
        ProgressMigrationStepSchema.safeParse({ action: 'preserve', entity: 'rule', id }).success,
      ).toBe(true);
      expect(
        ProgressMigrationStepSchema.safeParse({ action: 'preserve', entity: 'exercise', id })
          .success,
      ).toBe(false);
      expect(
        ProgressMigrationStepSchema.safeParse({
          action: 'map-to',
          entity: 'slide',
          fromId: 'old-slide',
          toId: id,
        }).success,
      ).toBe(false);
    }
    for (const id of [
      'other:answer:exists',
      'interaction:answer',
      'interaction::answered',
      'interaction:Answer:answered',
      'interaction:answer:answered:exists:extra',
    ]) {
      expect(ProgressRuleReferenceIdSchema.safeParse(id).success).toBe(false);
    }
  });
});
