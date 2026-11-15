import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { beforeAll, expect, it, vi } from 'vitest';
import { loadAuthoringCourse, type AuthoringExercise } from '../../scripts/content/compileCourse';
import { ExerciseInstructionPane } from '../../src/features/learning/components/ExerciseInstructionPane';

let exercise: AuthoringExercise;
// 実原稿の読取は準備へ分け、通常のUI component testへNodeの制作依存を入れない。
beforeAll(async () => {
  const course = await loadAuthoringCourse('content/react');
  const found = course.exercises.find(({ id }) => id === 'react-ch02-l04-e01');
  if (!found) throw Error('温度課題がありません');
  exercise = found;
}, 60_000);

it('温度の仕様制作で必要なID・操作条件・構文範囲を常設の説明から見つけられる', () => {
  render(
    <ExerciseInstructionPane
      steps={exercise.steps}
      activeStepId={exercise.steps[0]?.id}
      onStepChange={vi.fn()}
      fallbackInstructions={exercise.instructions}
    />,
  );
  const pane = screen.getByRole('region', { name: '演習の手順' });
  for (const required of [
    'celsius',
    'fahrenheit',
    'increase',
    'decrease',
    'reset',
    'type="button"',
    '1℃上げる',
    '1℃下げる',
    '最初に戻す',
    '20℃',
    '68℉',
    '69.8',
    '66.2',
    'Props',
    'Callback',
    'spread',
    'Effect',
  ]) {
    expect(pane).toHaveTextContent(required);
  }
});
