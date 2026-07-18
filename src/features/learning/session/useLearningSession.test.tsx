import { act, renderHook } from '@testing-library/react';
import { StrictMode, type PropsWithChildren } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLearningSessionState } from '../../../core/learning/sessionReducer';
import type { LearningSessionController } from './LearningSessionController';
import { useLearningSession } from './useLearningSession';

/** Hook test用のController公開面を生成する。 */
function hookController() {
  let listener: (() => void) | undefined;
  let state = createLearningSessionState({
    courseId: 'html-css',
    lessonId: 'lesson-1',
    exerciseId: 'exercise-1',
    files: { 'index.html': '<main></main>' },
    selectedFile: 'index.html',
  });
  const flush = vi.fn().mockResolvedValue(undefined);
  const dispose = vi.fn().mockResolvedValue(undefined);
  const controller = {
    getSnapshot: () => state,
    subscribe: (next: () => void) => {
      listener = next;
      return () => {
        if (listener === next) listener = undefined;
      };
    },
    flush,
    dispose,
  } as unknown as LearningSessionController;
  return {
    controller,
    flush,
    dispose,
    update() {
      state = { ...state, executionRevision: state.executionRevision + 1 };
      listener?.();
    },
  };
}

/** microtask cleanupの完了を型安全に待つ。 */
function nextMicrotask(): Promise<void> {
  return new Promise<void>((resolve) => {
    queueMicrotask(() => {
      resolve();
    });
  });
}

describe('useLearningSession', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('visibility hiddenとpagehideでflushし、Controller更新をReactへ接続する', async () => {
    const fixture = hookController();
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    const { result } = renderHook(() => useLearningSession(fixture.controller));

    expect(result.current.executionRevision).toBe(0);
    act(() => {
      fixture.update();
    });
    expect(result.current.executionRevision).toBe(1);
    visibility.mockReturnValue('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('pagehide'));
    await Promise.resolve();

    expect(fixture.flush).toHaveBeenCalledTimes(2);
  });

  it('cleanupでflush後にdisposeし rejectionを未処理にしない', async () => {
    const fixture = hookController();
    const events: string[] = [];
    fixture.flush.mockImplementation(async () => {
      events.push('flush');
      throw new Error('quota');
    });
    fixture.dispose.mockImplementation(async () => {
      events.push('dispose');
    });
    const { unmount } = renderHook(() => useLearningSession(fixture.controller));

    unmount();
    await nextMicrotask();
    await Promise.resolve();

    expect(events).toEqual(['flush', 'dispose']);
  });

  it('Strict Modeのeffect再実行では利用中Controllerをdisposeせず実unmountで一度だけ解放する', async () => {
    const fixture = hookController();
    const wrapper = ({ children }: PropsWithChildren) => <StrictMode>{children}</StrictMode>;
    const { unmount } = renderHook(() => useLearningSession(fixture.controller), { wrapper });

    await nextMicrotask();
    expect(fixture.dispose).not.toHaveBeenCalled();
    unmount();
    await nextMicrotask();
    await Promise.resolve();

    expect(fixture.dispose).toHaveBeenCalledOnce();
  });
});
