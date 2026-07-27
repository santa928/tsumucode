import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

export interface LearningToolRailProps {
  readonly coursePath: string;
  readonly lessonTitle: string;
  readonly children: ReactNode;
}

/** 学習詳細RouteのBrand、戻る導線、Lesson、補助操作を1列へ集約する。 */
export function LearningToolRail({ coursePath, lessonTitle, children }: LearningToolRailProps) {
  return (
    <nav aria-label="学習ツール" className="tc-learning-tool-rail">
      <Link to="/" aria-label="TsumuCodeホームへ" className="tc-learning-tool-brand">
        <span aria-hidden="true" className="tc-learning-tool-mark">
          <span />
          <span />
          <span />
        </span>
        <span>TsumuCode</span>
      </Link>
      <Link to={coursePath} aria-label="コースマップへ戻る" className="tc-learning-tool-course">
        ← コース
      </Link>
      <p className="tc-learning-tool-lesson" title={lessonTitle}>
        {lessonTitle}
      </p>
      <div className="tc-learning-tool-actions">{children}</div>
    </nav>
  );
}
