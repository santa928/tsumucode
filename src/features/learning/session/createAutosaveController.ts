/** 最新Draftを500ms以内に直列保存し、遷移前flushと失敗retryを提供する。 */
import type { ExerciseDraft, ProgressRepository } from '../../../core/persistence/contracts';

export type AutosaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export interface AutosaveController {
  /** 最新Draftをpendingへ置き、debounce timerを開始し直す。 */
  schedule(draft: ExerciseDraft): void;
  /** timerを待たず、進行中saveと最新pendingがなくなるまで直列保存する。 */
  flush(): Promise<void>;
  /** 未発火timerだけを停止し、以後の自動保存副作用を解放する。 */
  dispose(): void;
}

export interface AutosaveOptions {
  readonly delayMs: number;
  readonly onStatus?: (status: AutosaveStatus) => void;
  readonly onError?: (error: unknown) => void;
  readonly onRecovered?: () => void;
  readonly saveDraft?: (draft: ExerciseDraft) => Promise<void>;
}

/** 観測callbackの例外を元の保存成否へ波及させず通知する。 */
function notifySafely(operation: () => void): void {
  try {
    operation();
  } catch {
    // Noticeなど観測側の失敗で保存処理の結果を変更しない。
  }
}

/** Performance APIの欠落や計測失敗を永続保存の失敗へ波及させない。 */
function safelyMeasureDraftPersistence(stage: 'input' | 'saved'): void {
  try {
    if (stage === 'input') {
      performance.mark('tsumucode:draft-input');
      return;
    }
    performance.mark('tsumucode:draft-saved');
    performance.measure(
      'tsumucode:draft-persist',
      'tsumucode:draft-input',
      'tsumucode:draft-saved',
    );
  } catch {
    // Performance instrumentationはbest-effortで、Draft保存の成否を変えない。
  }
}

/** 最新Draftを0〜500msで保存し、同時saveと失敗時pendingを安全に直列化する。 */
export function createAutosaveController(
  repository: ProgressRepository,
  options: AutosaveOptions,
): AutosaveController {
  if (!Number.isFinite(options.delayMs) || options.delayMs < 0 || options.delayMs > 500) {
    throw new Error('autosave delayMsは0以上500以下で指定してください');
  }

  const persist = options.saveDraft ?? ((draft: ExerciseDraft) => repository.putDraft(draft));
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: ExerciseDraft | undefined;
  let activeSave: Promise<void> | undefined;
  let disposed = false;
  let recoveringFromError = false;

  /** 1件を保存し、失敗時はより新しいpendingがなければ同じDraftをretry用に戻す。 */
  const saveOne = async (draft: ExerciseDraft): Promise<void> => {
    options.onStatus?.('saving');
    try {
      await persist(draft);
      safelyMeasureDraftPersistence('saved');
      if (recoveringFromError) {
        recoveringFromError = false;
        notifySafely(() => options.onRecovered?.());
      }
      if (!pending) options.onStatus?.('saved');
    } catch (error) {
      if (!disposed) pending ??= draft;
      recoveringFromError = true;
      options.onStatus?.('error');
      notifySafely(() => options.onError?.(error));
      throw error;
    }
  };

  /** 既存saveを待ち、現時点の最新pendingだけを順番に空になるまで保存する。 */
  const drain = async (): Promise<void> => {
    if (disposed) return;
    const running = activeSave;
    if (running) {
      await running;
      await drain();
      return;
    }
    const draft = pending;
    if (!draft) return;
    pending = undefined;
    const operation = saveOne(draft);
    activeSave = operation;
    try {
      await operation;
    } finally {
      if (activeSave === operation) activeSave = undefined;
    }
    await drain();
  };

  return {
    schedule(draft) {
      if (disposed) return;
      pending = draft;
      safelyMeasureDraftPersistence('input');
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = undefined;
        void drain().catch(() => undefined);
      }, options.delayMs);
    },
    async flush() {
      if (timer) clearTimeout(timer);
      timer = undefined;
      if (disposed) {
        if (activeSave) await activeSave;
        return;
      }
      await drain();
    },
    dispose() {
      disposed = true;
      pending = undefined;
      if (timer) clearTimeout(timer);
      timer = undefined;
    },
  };
}
