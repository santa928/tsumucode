/** Exercise StepとStarter、Concept要求、Validation Ruleの参照整合を検証する。 */
import { describe, expect, it } from 'vitest';
import { fixtureCourse } from '../../tests/fixtures/course';
import type { Exercise } from '../../src/core/content/types';
import { assertExerciseTrace, collectExerciseTraceDiagnostics } from './exerciseTrace';

/** 独立して破壊できるStandard Exercise Fixtureを返す。 */
function exerciseFixture(): Extract<Exercise, { kind: 'standard' }> {
  const lesson = structuredClone(fixtureCourse).phases[0]?.chapters[0]?.lessons[0];
  const exercise = lesson?.exercises[0];
  if (exercise?.kind !== 'standard') throw new Error('Standard Exercise fixtureがありません');
  return exercise;
}

describe('Exercise trace', () => {
  it('整合したStepは診断を返さない', () => {
    expect(collectExerciseTraceDiagnostics(exerciseFixture())).toEqual([]);
  });

  it('StepのStarter anchorとValidation Rule参照切れを安定順序で返す', () => {
    const exercise = exerciseFixture();
    exercise.validationRules = [];
    exercise.steps = [
      {
        id: 'write-heading',
        file: 'index.html',
        target: 'body内',
        starterAnchor: '<!-- missing-anchor -->',
        change: 'h1を追加する',
        observe: '題名を確認する',
        requiresConceptIds: ['html-element'],
        validationRuleIds: ['missing-rule'],
      },
    ];

    expect(collectExerciseTraceDiagnostics(exercise).map(({ kind }) => kind)).toEqual([
      'missing-starter-anchor',
      'missing-validation-rule',
    ]);
  });

  it('editableでないFileと重複Starter anchorを区別する', () => {
    const readOnly = exerciseFixture();
    readOnly.files[0]!.editable = false;
    expect(collectExerciseTraceDiagnostics(readOnly)).toContainEqual(
      expect.objectContaining({ kind: 'missing-editable-file', file: 'index.html' }),
    );

    const duplicate = exerciseFixture();
    duplicate.files[0]!.content = '<main></main>\n<main></main>';
    expect(collectExerciseTraceDiagnostics(duplicate)).toContainEqual(
      expect.objectContaining({ kind: 'duplicate-starter-anchor', file: 'index.html' }),
    );
  });

  it('Step ConceptをExercise要求の部分集合にし、全Ruleを最低1回参照する', () => {
    const exercise = exerciseFixture();
    exercise.steps[0]!.requiresConceptIds = ['css-rule'];
    exercise.steps[0]!.validationRuleIds = [];

    expect(collectExerciseTraceDiagnostics(exercise).map(({ kind }) => kind)).toEqual([
      'unknown-step-concept',
      'unreferenced-validation-rule',
    ]);
  });

  it('診断があるExerciseを位置情報付きErrorで拒否する', () => {
    const exercise = exerciseFixture();
    exercise.steps[0]!.starterAnchor = '<!-- missing-anchor -->';

    expect(() => {
      assertExerciseTrace(exercise);
    }).toThrow(/exercise-first-heading.*write-heading.*missing-starter-anchor/u);
  });
});
