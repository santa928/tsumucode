/** 複数Courseを読むLearningPath進捗Hookの購読・再試行契約を検証する。 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { fixtureCatalog } from '../../../tests/fixtures/course';
import type { CourseCatalogEntry, LearningPathDefinition } from '../../core/content/types';
import type { CourseProgress } from '../../core/persistence/contracts';
import type { CourseProgressPort } from './useCourseProgress';
import { useLearningPathProgress } from './useLearningPathProgress';

const NOW = '2026-07-31T00:00:00.000Z';

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

/** 2 Courseを持つPathとCatalog entryを作る。 */
function pathFixture(): {
  readonly path: LearningPathDefinition;
  readonly courses: readonly CourseCatalogEntry[];
} {
  const html = structuredClone(fixtureCatalog.courses[0]!);
  const javascript: CourseCatalogEntry = {
    ...structuredClone(html),
    id: 'javascript',
    revision: '2026-07-31.javascript',
    indexPath: 'generated/content/courses/javascript/index.json',
    indexSha256: 'b'.repeat(64),
    lessonStarts: [
      {
        lessonId: 'js-values',
        target: { kind: 'slide', targetId: 'js-values-intro' },
      },
    ],
  };
  return {
    path: {
      ...structuredClone(fixtureCatalog.learningPaths[0]!),
      steps: [
        { courseId: html.id, role: 'required', prerequisiteCourseIds: [] },
        {
          courseId: javascript.id,
          role: 'required',
          prerequisiteCourseIds: [html.id],
        },
      ],
    },
    courses: [html, javascript],
  };
}

/** Course entryに対応する未完了進捗を作る。 */
function startedProgress(course: CourseCatalogEntry): CourseProgress {
  return {
    courseId: course.id,
    contentRevision: course.revision,
    lessons: {},
    currentLessonId: course.lessonStarts[0]!.lessonId,
    currentComplete: false,
    updatedAt: NOW,
  };
}

interface FakeCourseProgressPort {
  readonly port: CourseProgressPort;
  readonly getCourse: ReturnType<
    typeof vi.fn<(courseId: string) => Promise<CourseProgress | undefined>>
  >;
  readonly emitDataChanged: () => void;
  readonly listenerCount: () => number;
}

/** data revisionと購読通知を実サービスと同じ順序で進める読取専用portを作る。 */
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

describe('useLearningPathProgress', () => {
  it('Repository準備中はloadingで、準備後に対象Course IDを1回ずつ読む', async () => {
    const { path, courses } = pathFixture();
    const repositoryReady = deferred<undefined>();
    const getCourse = vi.fn<(courseId: string) => Promise<CourseProgress | undefined>>(
      async () => undefined,
    );
    const fake = createPort(getCourse, repositoryReady.promise);

    const { result } = renderHook(() => useLearningPathProgress(path, courses, fake.port));

    expect(result.current.status).toBe('loading');
    expect(getCourse).not.toHaveBeenCalled();
    expect(Object.hasOwn(fake.port.repository, 'putCourse')).toBe(false);

    repositoryReady.resolve(undefined);

    await waitFor(() => {
      expect(result.current.status).toBe('ready');
    });
    expect(getCourse.mock.calls.map(([courseId]) => courseId)).toEqual(['html-css', 'javascript']);
    expect(result.current.summary).toMatchObject({
      status: 'not-started',
      totalRequiredCourses: 2,
    });
  });

  it('data revision通知のたびに全対象Courseを再読込する', async () => {
    const { path, courses } = pathFixture();
    const getCourse = vi.fn<(courseId: string) => Promise<CourseProgress | undefined>>(
      async () => undefined,
    );
    const fake = createPort(getCourse);
    const { result } = renderHook(() => useLearningPathProgress(path, courses, fake.port));
    await waitFor(() => {
      expect(result.current.status).toBe('ready');
    });

    act(() => {
      fake.emitDataChanged();
    });

    await waitFor(() => {
      expect(getCourse).toHaveBeenCalledTimes(4);
    });
    expect(getCourse.mock.calls.slice(2).map(([courseId]) => courseId)).toEqual([
      'html-css',
      'javascript',
    ]);
  });

  it('bfcacheからpageshowで復帰したとき全対象Courseを再読込する', async () => {
    const { path, courses } = pathFixture();
    const getCourse = vi.fn<(courseId: string) => Promise<CourseProgress | undefined>>(
      async () => undefined,
    );
    const fake = createPort(getCourse);
    const { result } = renderHook(() => useLearningPathProgress(path, courses, fake.port));
    await waitFor(() => {
      expect(result.current.status).toBe('ready');
    });

    act(() => {
      window.dispatchEvent(new Event('pageshow'));
    });

    await waitFor(() => {
      expect(getCourse).toHaveBeenCalledTimes(4);
    });
  });

  it('1 Courseの読込失敗をsafeなerrorへ変換し、retryで全対象を読み直す', async () => {
    const { path, courses } = pathFixture();
    const getCourse = vi
      .fn<(courseId: string) => Promise<CourseProgress | undefined>>()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('indexed-db-secret-detail'))
      .mockResolvedValue(undefined);
    const fake = createPort(getCourse);
    const { result } = renderHook(() => useLearningPathProgress(path, courses, fake.port));

    await waitFor(() => {
      expect(result.current.status).toBe('error');
    });
    expect(result.current.error).toBe('学習パスの進捗を読み込めませんでした。');
    expect(result.current.error).not.toContain('indexed-db-secret-detail');

    act(() => {
      result.current.retry();
    });
    expect(result.current.status).toBe('loading');
    await waitFor(() => {
      expect(result.current.status).toBe('ready');
    });
    expect(getCourse).toHaveBeenCalledTimes(4);
  });

  it('後から解決した古い読込結果を新しいsummaryへ戻さない', async () => {
    const { path, courses } = pathFixture();
    const oldHtml = deferred<CourseProgress | undefined>();
    const oldJavascript = deferred<CourseProgress | undefined>();
    const currentHtml = deferred<CourseProgress | undefined>();
    const currentJavascript = deferred<CourseProgress | undefined>();
    const getCourse = vi
      .fn<(courseId: string) => Promise<CourseProgress | undefined>>()
      .mockReturnValueOnce(oldHtml.promise)
      .mockReturnValueOnce(oldJavascript.promise)
      .mockReturnValueOnce(currentHtml.promise)
      .mockReturnValueOnce(currentJavascript.promise);
    const fake = createPort(getCourse);
    const { result } = renderHook(() => useLearningPathProgress(path, courses, fake.port));
    await waitFor(() => {
      expect(getCourse).toHaveBeenCalledTimes(2);
    });

    act(() => {
      fake.emitDataChanged();
    });
    await waitFor(() => {
      expect(getCourse).toHaveBeenCalledTimes(4);
    });
    currentHtml.resolve(startedProgress(courses[0]!));
    currentJavascript.resolve(undefined);
    await waitFor(() => {
      expect(result.current.summary?.status).toBe('in-progress');
    });

    oldHtml.resolve(undefined);
    oldJavascript.resolve(undefined);
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.summary?.status).toBe('in-progress');
  });

  it('同じCourse ID列の再renderでは不要な再読込をしない', async () => {
    const { path, courses } = pathFixture();
    const getCourse = vi.fn<(courseId: string) => Promise<CourseProgress | undefined>>(
      async () => undefined,
    );
    const fake = createPort(getCourse);
    const { result, rerender } = renderHook(
      ({ currentPath, currentCourses }) =>
        useLearningPathProgress(currentPath, currentCourses, fake.port),
      { initialProps: { currentPath: path, currentCourses: courses } },
    );
    await waitFor(() => {
      expect(result.current.status).toBe('ready');
    });

    rerender({
      currentPath: structuredClone(path),
      currentCourses: structuredClone(courses),
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(getCourse).toHaveBeenCalledTimes(2);
  });

  it('unmount時に購読とpageshowを解除する', async () => {
    const { path, courses } = pathFixture();
    const getCourse = vi.fn<(courseId: string) => Promise<CourseProgress | undefined>>(
      async () => undefined,
    );
    const fake = createPort(getCourse);
    const { result, unmount } = renderHook(() => useLearningPathProgress(path, courses, fake.port));
    await waitFor(() => {
      expect(result.current.status).toBe('ready');
    });
    expect(fake.listenerCount()).toBe(1);

    unmount();
    expect(fake.listenerCount()).toBe(0);
    act(() => {
      window.dispatchEvent(new Event('pageshow'));
    });

    expect(getCourse).toHaveBeenCalledTimes(2);
  });
});
