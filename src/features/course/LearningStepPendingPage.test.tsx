import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LearningStepPendingPage } from './LearningStepPendingPage';

/** Exercise準備中Routeを、指定した編集可否の端末条件で表示する。 */
function renderPendingExercise(canEdit: boolean): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: canEdit,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
  render(
    <MemoryRouter
      initialEntries={[
        '/courses/html-css/lessons/lesson-first-heading/exercises/exercise-first-heading',
      ]}
    >
      <Routes>
        <Route
          path="/courses/:courseId/lessons/:lessonId/exercises/:exerciseId"
          element={<LearningStepPendingPage />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('LearningStepPendingPage', () => {
  it('Exercise準備中であることとCourseへの復帰手段を正確に示す', () => {
    renderPendingExercise(true);

    expect(
      screen.getByRole('heading', { level: 1, name: 'コード演習は準備中です' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/スライド学習は利用できます/u)).toBeInTheDocument();
    expect(screen.queryByText(/スライドとコード実習は次の工程/u)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'コースマップへ戻る' })).toHaveAttribute(
      'href',
      '/courses/html-css',
    );
  });

  it('編集不能環境からExerciseへ直接来てもPCが必要な理由を示す', () => {
    renderPendingExercise(false);

    expect(screen.getByText(/幅1024px以上/u)).toBeInTheDocument();
    expect(screen.getByText(/マウスまたはトラックパッド/u)).toBeInTheDocument();
  });
});
