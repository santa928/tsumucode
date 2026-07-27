/** 学習詳細Routeの共通Tool Railが現在地と補助操作を1列へまとめることを検証する。 */
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithRouter } from '../../../test/renderWithRouter';
import { LearningToolRail } from './LearningToolRail';

describe('LearningToolRail', () => {
  it('Brand、Course Map、Lesson、補助操作を1本のTool Railへ置く', () => {
    renderWithRouter(
      <LearningToolRail coursePath="/courses/html-css" lessonTitle="Webページを作る3つの役割">
        <button type="button">用語</button>
      </LearningToolRail>,
    );

    expect(screen.getByRole('navigation', { name: '学習ツール' })).toHaveClass(
      'tc-learning-tool-rail',
    );
    expect(screen.getByRole('link', { name: 'TsumuCodeホームへ' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'コースマップへ戻る' })).toHaveAttribute(
      'href',
      '/courses/html-css',
    );
    expect(screen.getByText('Webページを作る3つの役割')).toBeVisible();
    expect(screen.getByRole('button', { name: '用語' })).toBeVisible();
  });
});
