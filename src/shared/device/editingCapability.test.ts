import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  EDITING_CAPABILITY_QUERY,
  isEditingCapable,
  useEditingCapability,
} from './editingCapability';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('editing capability', () => {
  it('1024px以上かつprimary pointer fineの場合だけ編集可能にする', () => {
    expect(isEditingCapable({ viewportWidth: 1024, primaryPointer: 'fine' })).toBe(true);
    expect(isEditingCapable({ viewportWidth: 1023, primaryPointer: 'fine' })).toBe(false);
    expect(isEditingCapable({ viewportWidth: 1366, primaryPointer: 'coarse' })).toBe(false);
    expect(isEditingCapable({ viewportWidth: 1366, primaryPointer: 'none' })).toBe(false);
  });

  it('UA文字列を使わない共有Media Queryを固定する', () => {
    expect(EDITING_CAPABILITY_QUERY).toBe('(min-width: 1024px) and (pointer: fine)');
    expect(EDITING_CAPABILITY_QUERY).not.toContain('user-agent');
  });

  it('Media Queryの変化を購読して編集可否を更新する', () => {
    let matches = false;
    const listeners = new Set<(event: MediaQueryListEvent) => void>();
    const mediaQueryList = {
      get matches() {
        return matches;
      },
      media: EDITING_CAPABILITY_QUERY,
      onchange: null,
      addEventListener: (_type: 'change', listener: (event: MediaQueryListEvent) => void) => {
        listeners.add(listener);
      },
      removeEventListener: (_type: 'change', listener: (event: MediaQueryListEvent) => void) => {
        listeners.delete(listener);
      },
    } as unknown as MediaQueryList;
    const matchMedia = vi.fn(() => mediaQueryList);
    vi.stubGlobal('matchMedia', matchMedia);

    const { result, unmount } = renderHook(() => useEditingCapability());

    expect(result.current).toBe(false);
    expect(matchMedia).toHaveBeenCalledWith(EDITING_CAPABILITY_QUERY);
    expect(listeners.size).toBe(1);

    act(() => {
      matches = true;
      const event = { matches, media: EDITING_CAPABILITY_QUERY } as MediaQueryListEvent;
      listeners.forEach((listener) => {
        listener(event);
      });
    });

    expect(result.current).toBe(true);
    expect(listeners.size).toBe(1);

    unmount();
    expect(listeners.size).toBe(0);
  });
});
