import { describe, expect, it, vi } from 'vitest';
import { ReadOnlyPreviewRegistry } from './ReadOnlyPreviewRegistry';

describe('ReadOnlyPreviewRegistry', () => {
  it('hasは専用Previewの支持を副作用なく調べ、未登録createの拒否を変えない', () => {
    const registry = new ReadOnlyPreviewRegistry();
    const factory = vi.fn(() => ({
      languageId: 'html-css' as const,
      prepare: vi.fn(async () => undefined),
      render: vi.fn(async () => undefined),
      dispose: vi.fn(async () => undefined),
    }));
    expect(registry.has('html-css')).toBe(false);
    registry.register('html-css', factory);
    factory.mockClear();
    expect(registry.has('html-css')).toBe(true);
    expect(registry.has('javascript')).toBe(false);
    expect(factory).not.toHaveBeenCalled();
    expect(() => registry.create('javascript')).toThrow('not registered');
    expect(() => registry.has('')).toThrow('non-empty');
    expect(registry.create('html-css').languageId).toBe('html-css');
    expect(factory).toHaveBeenCalledOnce();
  });
});
