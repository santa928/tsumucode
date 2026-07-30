/** 学習中の一覧、用語、Hint、Feedbackを同じModal Drawerで表示する。 */
import {
  useEffect,
  useId,
  useRef,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type RefObject,
} from 'react';

export interface LearningDrawerProps {
  readonly open: boolean;
  readonly title: string;
  readonly onClose: () => void;
  readonly initialFocusRef?: RefObject<HTMLElement | null>;
  readonly returnFocusRef?: RefObject<HTMLElement | null>;
  readonly placement: 'side' | 'bottom';
  readonly heightMode?: 'content' | 'viewport';
  readonly children: ReactNode;
}

/** native dialogへopen状態を同期し、閉じた後のTrigger Focusまで所有する。 */
export function LearningDrawer({
  open,
  title,
  onClose,
  initialFocusRef,
  returnFocusRef,
  placement,
  heightMode = 'content',
  children,
}: LearningDrawerProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const wasOpenRef = useRef(false);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;

    if (open) {
      if (!dialog.open) dialog.showModal();
      (initialFocusRef?.current ?? closeButtonRef.current)?.focus();
    } else {
      if (dialog.open) dialog.close();
      if (wasOpenRef.current) returnFocusRef?.current?.focus();
    }
    wasOpenRef.current = open;
  }, [initialFocusRef, open, returnFocusRef]);

  /** Escape keyをnative cancelと同じClose経路へ集約する。 */
  function handleKeyDown(event: KeyboardEvent<HTMLDialogElement>): void {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    onClose();
  }

  /** Drawer panel外のBackdrop clickだけをCloseとして扱う。 */
  function handleBackdropClick(event: MouseEvent<HTMLDialogElement>): void {
    if (event.target === event.currentTarget) onClose();
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-modal="true"
      className="tc-learning-drawer"
      data-height-mode={heightMode}
      data-placement={placement}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
    >
      <section className="tc-learning-drawer-panel">
        <header className="tc-learning-drawer-header">
          <h2 id={titleId}>{title}</h2>
          <button
            ref={closeButtonRef}
            type="button"
            aria-label="閉じる"
            className="tc-learning-drawer-close"
            onClick={onClose}
          >
            <span aria-hidden="true">×</span>
          </button>
        </header>
        <div className="tc-learning-drawer-body">{children}</div>
      </section>
    </dialog>
  );
}
