import { Link } from 'react-router';
import { cn } from '@/shared/lib/cn';

interface ActionLinkProps {
  readonly to: string;
  readonly children: string;
  readonly className?: string;
  readonly dataPathPrimaryAction?: boolean;
}

/** 次の主要操作を、見えるTextがAccessible Nameになる深緑のLinkとして表示する。 */
export function ActionLink({
  to,
  children,
  className,
  dataPathPrimaryAction = false,
}: ActionLinkProps) {
  if (children.trim().length === 0) {
    throw new Error('ActionLinkにはAccessible Nameが必要です。');
  }

  return (
    <Link
      to={to}
      data-path-primary-action={dataPathPrimaryAction ? '' : undefined}
      className={cn(
        'inline-flex min-h-11 items-center justify-center rounded-[var(--tc-radius-md)] bg-workshop-primary px-5 py-3 font-bold text-workshop-on-primary shadow-[var(--tc-shadow-piece)] transition-[transform,background-color,box-shadow] duration-[var(--tc-motion-fast)] ease-[var(--tc-ease-piece)] hover:-translate-y-0.5 hover:bg-[var(--tc-color-primary-hover)] active:translate-y-0.5 active:shadow-none',
        className,
      )}
    >
      {children}
    </Link>
  );
}
