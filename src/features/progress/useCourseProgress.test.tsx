import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CourseProgress } from '../../core/persistence/contracts';
import { useCourseProgress, type CourseProgressPort } from './useCourseProgress';

const NOW = '2026-07-10T00:00:00.000Z';

const completedProgress = {
  courseId: 'html-css',
  contentRevision: '2026-07-10.1',
  lessons: {
    'lesson-first-heading': {
      lessonId: 'lesson-first-heading',
      viewedSlideIds: ['slide-html-role'],
      currentSlideId: 'slide-html-role',
      passedExerciseIds: ['exercise-first-heading'],
      passedChecklistItemIds: [],
      passedRuleIds: ['rule-h1-exists'],
      passedViewportIds: ['desktop'],
      currentComplete: true,
      firstCompletedAt: NOW,
    },
  },
  currentComplete: true,
  firstCompletedAt: NOW,
  updatedAt: NOW,
} satisfies CourseProgress;

interface Deferred<Value> {
  readonly promise: Promise<Value>;
  readonly resolve: (value: Value) => void;
  readonly reject: (reason?: unknown) => void;
}

/** 手動で完了順を制御できるPromiseを作る。 */
function deferred<Value>(): Deferred<Value> {
  let resolve!: (value: Value) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<Value>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

interface FakeCourseProgressPort {
  readonly port: CourseProgressPort;
  readonly getCourse: ReturnType<
    typeof vi.fn<(courseId: string) => Promise<CourseProgress | undefined>>
  >;
  readonly emitDataChanged: () => void;
  readonly listenerCount: () => number;
}

/** data revisionと購読通知を実サービスと同じ順序で進める注入portを作る。 */
function createPort(
  getCourse: FakeCourseProgressPort['getCourse'],
  ready: Promise<void> = Promise.resolve(),
): FakeCourseProgressPort {
  const listeners = new Set<() => void>();
  let revision = 0;
  return {
    getCourse,
    port: {
      ready,
      repository: { getCourse },
      subscribeData: (listener) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
      getDataRevision: () => revision,
    },
    emitDataChanged: () => {
      revision += 1;
      for (const listener of [...listeners]) listener();
    },
    listenerCount: () => listeners.size,
  };
}

describe('useCourseProgress', () => {
  it('Repository準備中はloadingを返し、準備後のCourse進捗をreadyで返す', async () => {
    const repositoryReady = deferred<undefined>();
    const getCourse = vi.fn(async () => completedProgress);
    const { port } = createPort(getCourse, repositoryReady.promise);

    const { result } = renderHook(() => useCourseProgress('html-css', port));

    expect(result.current.status).toBe('loading');
    expect(getCourse).not.toHaveBeenCalled();

    repositoryReady.resolve(undefined);

    await waitFor(() => {
      expect(result.current.status).toBe('ready');
    });
    expect(getCourse).toHaveBeenCalledWith('html-css');
    expect(result.current.progress).toEqual(completedProgress);
  });

  it('data revision通知のたびにCourse進捗を読み直す', async () => {
    const getCourse = vi
      .fn<(courseId: string) => Promise<CourseProgress | undefined>>()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(completedProgress);
    const fake = createPort(getCourse);
    const { result } = renderHook(() => useCourseProgress('html-css', fake.port));
    await waitFor(() => {
      expect(result.current.status).toBe('ready');
    });

    act(() => {
      fake.emitDataChanged();
    });

    await waitFor(() => {
      expect(result.current.progress).toEqual(completedProgress);
    });
    expect(getCourse).toHaveBeenCalledTimes(2);
  });

  it('bfcacheからpageshowで復帰したときCourse進捗を読み直す', async () => {
    const getCourse = vi
      .fn<(courseId: string) => Promise<CourseProgress | undefined>>()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(completedProgress);
    const { port } = createPort(getCourse);
    const { result } = renderHook(() => useCourseProgress('html-css', port));
    await waitFor(() => {
      expect(result.current.status).toBe('ready');
    });

    act(() => {
      window.dispatchEvent(new Event('pageshow'));
    });

    await waitFor(() => {
      expect(result.current.progress).toEqual(completedProgress);
    });
    expect(getCourse).toHaveBeenCalledTimes(2);
  });

  it('新しい読込より後に解決した古い応答を表示へ戻さない', async () => {
    const oldRead = deferred<CourseProgress | undefined>();
    const currentRead = deferred<CourseProgress | undefined>();
    const getCourse = vi
      .fn<(courseId: string) => Promise<CourseProgress | undefined>>()
      .mockReturnValueOnce(oldRead.promise)
      .mockReturnValueOnce(currentRead.promise);
    const fake = createPort(getCourse);
    const { result } = renderHook(() => useCourseProgress('html-css', fake.port));
    await waitFor(() => {
      expect(getCourse).toHaveBeenCalledTimes(1);
    });

    act(() => {
      fake.emitDataChanged();
    });
    await waitFor(() => {
      expect(getCourse).toHaveBeenCalledTimes(2);
    });
    currentRead.resolve(completedProgress);
    await waitFor(() => {
      expect(result.current.progress).toEqual(completedProgress);
    });

    oldRead.resolve(undefined);
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.progress).toEqual(completedProgress);
  });

  it('unmountで購読とpageshowを解除し、解決待ち応答を無視する', async () => {
    const pendingRead = deferred<CourseProgress | undefined>();
    const getCourse = vi.fn(() => pendingRead.promise);
    const fake = createPort(getCourse);
    const { unmount } = renderHook(() => useCourseProgress('html-css', fake.port));
    await waitFor(() => {
      expect(getCourse).toHaveBeenCalledTimes(1);
    });
    expect(fake.listenerCount()).toBe(1);

    unmount();
    expect(fake.listenerCount()).toBe(0);
    act(() => {
      window.dispatchEvent(new Event('pageshow'));
    });
    pendingRead.resolve(completedProgress);
    await act(async () => {
      await Promise.resolve();
    });

    expect(getCourse).toHaveBeenCalledTimes(1);
  });

  it('読込失敗をsafeなerrorへ変換し、明示retryで再読込できる', async () => {
    const getCourse = vi
      .fn<(courseId: string) => Promise<CourseProgress | undefined>>()
      .mockRejectedValueOnce(new Error('indexed-db-secret-detail'))
      .mockResolvedValueOnce(completedProgress);
    const { port } = createPort(getCourse);
    const { result } = renderHook(() => useCourseProgress('html-css', port));

    await waitFor(() => {
      expect(result.current.status).toBe('error');
    });
    expect(result.current.error).toBe('コース進捗を読み込めませんでした。');
    expect(result.current.error).not.toContain('indexed-db-secret-detail');

    act(() => {
      result.current.retry();
    });
    expect(result.current.status).toBe('loading');
    await waitFor(() => {
      expect(result.current.status).toBe('ready');
    });
    expect(result.current.progress).toEqual(completedProgress);
    expect(getCourse).toHaveBeenCalledTimes(2);
  });
});
