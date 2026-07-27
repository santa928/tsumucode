import { useId } from 'react';
import { cn } from '@/shared/lib/cn';

interface PieceProgressProps {
  readonly completed: number;
  readonly total: number;
  readonly label: string;
  readonly className?: string;
  readonly compact?: boolean;
}

/** 外部の進捗値を、描画可能な0以上の整数へ正規化する。 */
function normalizePieceCount(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

/** 数値とnative progressを保ち、通常時だけ積み上がるPiece形状も表示する。 */
export function PieceProgress({
  completed,
  total,
  label,
  className,
  compact = false,
}: PieceProgressProps) {
  const labelId = useId();
  const safeTotal = normalizePieceCount(total);
  const safeCompleted = Math.min(normalizePieceCount(completed), safeTotal);
  const progressMaximum = Math.max(1, safeTotal);
  const progressText = `${String(safeCompleted)} / ${String(safeTotal)}`;
  const isComplete = safeTotal > 0 && safeCompleted === safeTotal;

  return (
    <section
      aria-labelledby={labelId}
      className={className}
      data-complete={isComplete}
      data-compact={compact}
    >
      <div className="flex flex-wrap items-end justify-between gap-2">
        <strong id={labelId} className="text-sm font-black text-workshop-muted">
          {label}
        </strong>
        <span aria-hidden="true" className="font-mono text-sm font-black tabular-nums">
          {progressText}
        </span>
      </div>
      <progress
        className="sr-only"
        value={safeCompleted}
        max={progressMaximum}
        aria-label={label}
        aria-valuetext={`${progressText} ピース完了`}
      >
        {progressText} ピース完了
      </progress>
      {compact ? null : (
        <ol
          aria-hidden="true"
          className="mt-3 grid list-none grid-cols-[repeat(auto-fit,minmax(1.25rem,1fr))] gap-2 p-0"
        >
          {Array.from({ length: safeTotal }, (_, index) => {
            const pieceIsComplete = index < safeCompleted;
            const isFinalPiece = index === safeTotal - 1;
            return (
              <li
                key={index}
                data-testid="progress-piece"
                data-state={pieceIsComplete ? 'complete' : 'next'}
                className={cn(
                  'h-3 min-w-5 rounded-workshop-piece border border-workshop-border transition-transform duration-[var(--tc-motion-normal)] ease-[var(--tc-ease-piece)]',
                  pieceIsComplete
                    ? 'translate-y-0 bg-workshop-complete'
                    : 'translate-y-1 bg-workshop-raised',
                  isComplete && isFinalPiece && 'shadow-[var(--tc-shadow-piece)]',
                )}
              />
            );
          })}
        </ol>
      )}
    </section>
  );
}
