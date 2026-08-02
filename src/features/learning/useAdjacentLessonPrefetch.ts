/** 学習画面のidle時間へ隣接Lessonの任意先読みを接続する。 */
import { useEffect } from 'react';
import { courseContentRepository } from '../../core/content/CourseContentRepository';
import { scheduleAdjacentLessonPrefetch } from '../../core/content/lessonPrefetch';
import type { CourseIndex } from '../../core/content/types';

/** Network Information APIが公開するData節約設定だけを安全に読む。 */
function isSaveDataEnabled(): boolean {
  const connection: unknown = Reflect.get(navigator, 'connection');
  return (
    typeof connection === 'object' &&
    connection !== null &&
    Reflect.get(connection, 'saveData') === true
  );
}

/** idle callbackまたは500ms fallbackをPromise scheduleへ変換する。 */
function createIdleSchedule(registerCancel: (cancel: () => void) => void) {
  return (task: () => Promise<void>): Promise<void> =>
    new Promise((resolve) => {
      const idleWindow = window;
      let settled = false;
      const run = (): void => {
        if (settled) return;
        settled = true;
        void task().finally(resolve);
      };
      if (typeof idleWindow.requestIdleCallback === 'function') {
        const handle = idleWindow.requestIdleCallback(run, { timeout: 1_500 });
        registerCancel(() => {
          if (settled) return;
          settled = true;
          idleWindow.cancelIdleCallback(handle);
          resolve();
        });
        return;
      }
      const handle = window.setTimeout(run, 500);
      registerCancel(() => {
        if (settled) return;
        settled = true;
        window.clearTimeout(handle);
        resolve();
      });
    });
}

/** 現在Lessonの前後をidle時だけ先読みし、unmount時は未実行scheduleを取消す。 */
export function useAdjacentLessonPrefetch(course: CourseIndex, lessonId: string): void {
  useEffect(() => {
    let cancel = (): void => undefined;
    const schedule = createIdleSchedule((nextCancel) => {
      cancel = nextCancel;
    });
    void scheduleAdjacentLessonPrefetch({
      course,
      lessonId,
      visibilityState: document.visibilityState,
      saveData: isSaveDataEnabled(),
      schedule,
      prefetch: (targetLessonId) =>
        courseContentRepository.prefetchLesson(import.meta.env.BASE_URL, course, targetLessonId),
    });
    return () => {
      cancel();
    };
  }, [course, lessonId]);
}
