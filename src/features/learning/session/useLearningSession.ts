import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { LearningSessionController } from './LearningSessionController';

interface ActiveLifecycle {
  readonly controller: LearningSessionController;
  readonly generation: number;
}

/** lifecycle Promiseを未処理rejectionにせず開始する。 */
function runSafely(operation: () => Promise<void>): void {
  void operation().catch(() => undefined);
}

/** Strict Modeの同一Controller再setupだけを実disposeから除外する。 */
function scheduleLifecycleCleanup(
  lifecycleRef: { current: ActiveLifecycle | undefined },
  lifecycle: ActiveLifecycle,
): void {
  queueMicrotask(() => {
    const active = lifecycleRef.current;
    if (
      active !== undefined &&
      active.controller === lifecycle.controller &&
      active.generation !== lifecycle.generation
    ) {
      return;
    }
    runSafely(async () => {
      try {
        await lifecycle.controller.flush();
      } finally {
        await lifecycle.controller.dispose();
      }
    });
  });
}

/** Controller snapshotをReactへ接続し、background遷移とunmountで保存・解放する。 */
export function useLearningSession(controller: LearningSessionController) {
  const lifecycleRef = useRef<ActiveLifecycle>(undefined);
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );

  useEffect(() => {
    const lifecycle = {
      controller,
      generation: (lifecycleRef.current?.generation ?? 0) + 1,
    };
    lifecycleRef.current = lifecycle;
    const flush = (): void => {
      runSafely(async () => {
        await controller.flush();
      });
    };
    const onVisibility = (): void => {
      if (document.visibilityState === 'hidden') flush();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', flush);
      scheduleLifecycleCleanup(lifecycleRef, lifecycle);
    };
  }, [controller]);

  return state;
}
