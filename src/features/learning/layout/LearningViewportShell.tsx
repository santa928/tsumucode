/** 学習Routeを固定Viewport内のHeader、Stage、Pagerへ分割する。 */
import type { ReactNode } from 'react';

export interface LearningViewportShellProps {
  readonly header: ReactNode;
  readonly children: ReactNode;
  readonly pager: ReactNode;
  readonly label: string;
}

/** Stageだけに低高さ・Zoom時の救済Scrollを持たせる学習画面Shell。 */
export function LearningViewportShell({
  header,
  children,
  pager,
  label,
}: LearningViewportShellProps) {
  return (
    <section aria-label={label} className="tc-learning-viewport-shell">
      <header className="tc-learning-shell-header">{header}</header>
      <div
        role="region"
        aria-label={`${label}の本文`}
        tabIndex={0}
        className="tc-learning-shell-stage"
        data-testid="learning-stage"
      >
        {children}
      </div>
      <div className="tc-learning-shell-pager">{pager}</div>
    </section>
  );
}
