import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { expect, it } from 'vitest';
import { fixtureCourse } from '../../../../tests/fixtures/course';
import { OptionalPracticeLinks } from './OptionalPracticeLinks';

/** 既存Lessonへ任意の練習だけ追加し、必須導線と独立したURLを検査する。 */
it('必須練習を重複表示せず、別workspaceの任意練習と予測へ戻れる', () => {
  const lesson = structuredClone(fixtureCourse.phases[0]!.chapters[0]!.lessons[0]!);
  const exercise = lesson.exercises[0]!;
  lesson.exercises.push({
    ...exercise,
    id: 'optional-two',
    workspaceId: 'optional-two',
    title: '初期化を直す',
  });
  lesson.slides[0]!.blocks.push({
    type: 'prediction',
    prompt: '次の値は？',
    answer: '20',
    explanation: '10を加えるため',
  });
  render(
    <MemoryRouter>
      <OptionalPracticeLinks courseId="html-css" lesson={lesson} />
    </MemoryRouter>,
  );
  expect(
    screen.queryByRole('link', { name: `追加練習：${exercise.title}` }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: '追加練習：初期化を直す' })).toHaveAttribute(
    'href',
    `/courses/html-css/lessons/${lesson.id}/exercises/optional-two`,
  );
  expect(screen.getByRole('link', { name: '予測と理由を見直す' })).toHaveAttribute(
    'href',
    `/courses/html-css/lessons/${lesson.id}/slides/${lesson.slides[0]!.id}`,
  );
});
