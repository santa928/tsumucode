import { cn } from '@/shared/lib/cn';

type Status = 'complete' | 'current' | 'not-started';

interface StatusBadgeProps {
  readonly status: Status;
  readonly className?: string;
}

const LABELS: Readonly<Record<Status, string>> = {
  complete: '完了',
  current: '現在のピース',
  'not-started': '未着手',
};

const STATUS_CLASSES: Readonly<Record<Status, string>> = {
  complete: 'bg-workshop-complete text-workshop-on-primary',
  current: 'bg-workshop-learning text-workshop-ink',
  'not-started': 'border-workshop-border bg-workshop-raised text-workshop-muted',
};

/** 学習状態を色、data属性、日本語Textの組み合わせで伝える。 */
export function StatusBadge({ status, className }: StatusBadgeProps) {
  return (
    <span
      data-status={status}
      className={cn(
        'inline-flex rounded-[var(--tc-radius-sm)] border border-transparent px-3 py-1 text-sm font-bold',
        STATUS_CLASSES[status],
        className,
      )}
    >
      {LABELS[status]}
    </span>
  );
}
