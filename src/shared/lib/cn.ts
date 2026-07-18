import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** 条件付きclassを束ね、利用側に近いTailwind utilityを優先して返す純粋関数。 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
