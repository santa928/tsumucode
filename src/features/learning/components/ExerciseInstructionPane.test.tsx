/** Exerciseの現在手順だけを固定Paneへ展開する契約を検証する。 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { fixtureCourse } from '../../../../tests/fixtures/course';
import type { ExerciseStep } from '../../../core/content/types';
import { ExerciseInstructionPane } from './ExerciseInstructionPane';

const firstStep = structuredClone(
  fixtureCourse.phases[0]!.chapters[0]!.lessons[0]!.exercises[0]!.steps[0]!,
);
const steps: readonly ExerciseStep[] = [
  firstStep,
  {
    ...firstStep,
    id: 'style-heading',
    file: 'styles.css',
    target: 'h1 Ruleの内側',
    starterAnchor: 'h1 {}',
    change: '文字色を追加する',
    observe: 'Previewの見出しが緑色になる',
  },
];

describe('ExerciseInstructionPane', () => {
  it('現在Stepだけを展開しfile・target・change・observeを表示する', async () => {
    const onStepChange = vi.fn();
    render(
      <ExerciseInstructionPane
        steps={steps}
        activeStepId="write-heading"
        onStepChange={onStepChange}
      />,
    );

    expect(screen.getByText('index.html')).toBeVisible();
    expect(screen.getByText('見出しがPreviewへ表示される')).toBeVisible();
    expect(screen.queryByText('Previewの見出しが緑色になる')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /手順/u })).toHaveLength(steps.length);

    await userEvent.click(screen.getByRole('button', { name: /手順 2/u }));
    expect(onStepChange).toHaveBeenCalledWith('style-heading');
  });

  it('Structured Step移行前は既存instructionsをRead-only表示する', () => {
    const exercise = fixtureCourse.phases[0]!.chapters[0]!.lessons[0]!.exercises[0]!;
    render(
      <ExerciseInstructionPane
        steps={[]}
        activeStepId={undefined}
        onStepChange={vi.fn()}
        fallbackInstructions={exercise.instructions}
      />,
    );

    expect(screen.getByRole('region', { name: '演習の手順' })).toHaveTextContent(
      'ページにh1見出しを1つ追加します。',
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
