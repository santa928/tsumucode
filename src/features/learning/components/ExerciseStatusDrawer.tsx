/** ExerciseのFeedbackとHintを同時に重ねず、単一Drawer Slotへ表示する。 */
import type { RefObject } from 'react';
import type { ValidationResult } from '../../../core/validation/contracts';
import { FeedbackPanel } from './FeedbackPanel';
import { HintPanel, type HintViewModel } from './HintPanel';
import { LearningDrawer } from './LearningDrawer';

export type ExerciseStatusDrawerMode = 'feedback' | 'hint' | undefined;

export interface ExerciseStatusDrawerProps {
  readonly mode: ExerciseStatusDrawerMode;
  readonly result: ValidationResult | undefined;
  readonly hints: readonly HintViewModel[];
  readonly revealedHintIds: readonly string[];
  readonly placement: 'side' | 'bottom';
  readonly busy?: boolean;
  readonly returnFocusRef?: RefObject<HTMLElement | null>;
  readonly onClose: () => void;
  readonly onRevealNextHint: () => void;
  readonly onReviewSlide: (slideId: string) => void;
  readonly onResolveCodeError?: () => void;
  readonly onRetrySystemError?: () => void;
}

/** modeに対応するPanelだけを1つのAccessible Drawerへ差し替えて表示する。 */
export function ExerciseStatusDrawer({
  mode,
  result,
  hints,
  revealedHintIds,
  placement,
  busy = false,
  returnFocusRef,
  onClose,
  onRevealNextHint,
  onReviewSlide,
  onResolveCodeError,
  onRetrySystemError,
}: ExerciseStatusDrawerProps) {
  return (
    <LearningDrawer
      open={mode !== undefined}
      title={mode === 'hint' ? 'ヒント' : '判定結果'}
      placement={placement}
      dismissDisabled={busy}
      {...(returnFocusRef === undefined ? {} : { returnFocusRef })}
      onClose={onClose}
    >
      {mode === 'feedback' ? (
        <FeedbackPanel
          result={result}
          actionsDisabled={busy}
          onRevealNextHint={onRevealNextHint}
          onReviewSlide={onReviewSlide}
          {...(onResolveCodeError === undefined ? {} : { onResolveCodeError })}
          {...(onRetrySystemError === undefined ? {} : { onRetrySystemError })}
        />
      ) : mode === 'hint' ? (
        <HintPanel
          hints={hints}
          revealedHintIds={revealedHintIds}
          onRevealNext={onRevealNextHint}
        />
      ) : null}
    </LearningDrawer>
  );
}
