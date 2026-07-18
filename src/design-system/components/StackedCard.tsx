import type { ComponentPropsWithRef, ElementType, ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';

type StackedCardOwnProps<T extends ElementType> = {
  readonly as?: T;
  readonly children: ReactNode;
  readonly className?: string;
};

type StackedCardProps<T extends ElementType> = StackedCardOwnProps<T> &
  Omit<ComponentPropsWithRef<T>, keyof StackedCardOwnProps<T>>;

/** 要素固有propsとrefを保ちながら、学習Pieceを積んだ共通Panelを表示する。 */
export function StackedCard<T extends ElementType = 'section'>({
  as,
  children,
  className,
  ...nativeProps
}: StackedCardProps<T>) {
  const Component = as ?? 'section';
  return (
    <Component
      {...nativeProps}
      className={cn(
        'relative rounded-[var(--tc-radius-lg)] border border-workshop-border bg-workshop-surface p-6 shadow-[var(--tc-shadow-piece)]',
        className,
      )}
    >
      {children}
    </Component>
  );
}
