import type { RefObject } from 'react';
import { Link } from 'react-router-dom';

export interface LibraryToolRailProps {
  readonly courseId: string;
  readonly lessonTitle: string;
  readonly positionLabel: string;
  readonly onOpenSlides: () => void;
  readonly onOpenGlossary?: () => void;
  readonly slideListTriggerRef: RefObject<HTMLButtonElement | null>;
  readonly glossaryTriggerRef: RefObject<HTMLButtonElement | null>;
}

/** 閲覧状態と補助機能を44px高の省スペースRailへまとめる。 */
export function LibraryToolRail({
  courseId,
  lessonTitle,
  positionLabel,
  onOpenSlides,
  onOpenGlossary,
  slideListTriggerRef,
  glossaryTriggerRef,
}: LibraryToolRailProps) {
  return (
    <nav aria-label="スライド閲覧ツール" className="tc-library-tool-rail">
      <div className="tc-library-mode">
        <span className="tc-library-mode-badge">閲覧モード</span>
        <span className="tc-library-mode-copy">進捗には反映されません</span>
      </div>
      <div className="tc-library-location" title={lessonTitle}>
        <span className="tc-library-lesson-title">{lessonTitle}</span>
        <span className="tc-library-position">{positionLabel}</span>
      </div>
      <div className="tc-library-tool-actions">
        <button
          ref={slideListTriggerRef}
          type="button"
          aria-label="スライド目次を開く"
          className="tc-library-tool-button"
          onClick={onOpenSlides}
        >
          <span aria-hidden="true">☷</span>
          <span className="tc-library-tool-label">スライド目次</span>
        </button>
        {onOpenGlossary === undefined ? null : (
          <button
            ref={glossaryTriggerRef}
            type="button"
            aria-label="用語を開く"
            className="tc-library-tool-button"
            onClick={onOpenGlossary}
          >
            <span aria-hidden="true">Aa</span>
            <span className="tc-library-tool-label">用語</span>
          </button>
        )}
        <Link
          to={`/courses/${courseId}`}
          aria-label="通常学習へ戻る"
          className="tc-library-tool-button"
        >
          <span aria-hidden="true">↩</span>
          <span className="tc-library-tool-label">通常学習へ戻る</span>
        </Link>
      </div>
    </nav>
  );
}
