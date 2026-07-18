import { useId, type ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';

const TONES = {
  learning: {
    label: '学習のヒント',
    icon: '◆',
    className: 'border-workshop-learning',
  },
  complete: {
    label: '完了',
    icon: '✓',
    className: 'border-workshop-complete',
  },
  correction: {
    label: '確認するところ',
    icon: '!',
    className: 'border-workshop-correction',
  },
  neutral: {
    label: 'お知らせ',
    icon: 'i',
    className: 'border-workshop-border',
  },
} as const;

interface WorkshopNoticeProps {
  readonly tone: keyof typeof TONES;
  readonly title: string;
  readonly children: ReactNode;
  readonly className?: string;
}

/** Tone label、Icon、見出しを併記し、色だけに依存しない案内を表示する。 */
export function WorkshopNotice({ tone, title, children, className }: WorkshopNoticeProps) {
  const titleId = useId();
  const config = TONES[tone];

  return (
    <aside
      aria-labelledby={titleId}
      data-tone={tone}
      className={cn(
        'rounded-workshop-md border border-l-4 bg-workshop-raised p-4',
        config.className,
        className,
      )}
    >
      <p className="text-sm font-black text-workshop-muted">
        <span aria-hidden="true">{config.icon} </span>
        {config.label}
      </p>
      <p id={titleId} className="mt-1 text-lg font-black">
        {title}
      </p>
      <div className="mt-2 text-workshop-muted">{children}</div>
    </aside>
  );
}
