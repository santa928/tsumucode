import { describe, expect, it } from 'vitest';
import { cn } from './cn';

describe('cn', () => {
  it('条件付きclassを束ね、後勝ちでTailwind競合を解消する', () => {
    expect(cn('p-2', 'p-4', { hidden: false })).toBe('p-4');
  });
});
