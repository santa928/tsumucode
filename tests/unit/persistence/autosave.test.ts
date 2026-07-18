import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExerciseDraft, ProgressRepository } from '../../../src/core/persistence/contracts';
import { createAutosaveController } from '../../../src/features/learning/session/createAutosaveController';

/** revisionだけを変えられる完全なDraft fixtureを生成する。 */
function draft(editRevision: number): ExerciseDraft {
  return {
    courseId: 'fixture',
    lessonId: 'lesson-1',
    exerciseId: 'ex-1',
    workspaceId: 'workspace-1',
    contentRevision: 'rev-1',
    editRevision,
    files: { 'index.html': `<main>${String(editRevision)}</main>` },
    selectedFile: 'index.html',
    cursors: { 'index.html': { anchor: editRevision, head: editRevision } },
    validationHistory: [],
    revealedHintIds: [],
    lastPassingSnapshots: {},
    updatedAt: `2026-07-10T00:00:0${String(editRevision)}.000Z`,
  };
}

/** Promiseの完了をtest側から制御する。 */
function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe('draft autosave', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('最後の入力だけを500ms以内に保存し、明示flushはtimerを待たない', async () => {
    const putDraft = vi.fn().mockResolvedValue(undefined);
    const statuses: string[] = [];
    const repository = { putDraft } as unknown as ProgressRepository;
    const autosave = createAutosaveController(repository, {
      delayMs: 450,
      onStatus: (status) => statuses.push(status),
    });

    autosave.schedule(draft(1));
    autosave.schedule(draft(2));
    await vi.advanceTimersByTimeAsync(449);
    expect(putDraft).not.toHaveBeenCalled();
    await autosave.flush();
    expect(putDraft).toHaveBeenCalledTimes(1);
    expect(putDraft).toHaveBeenCalledWith(draft(2));
    expect(statuses).toEqual(['saving', 'saved']);
  });

  it('進行中saveと後続pendingを直列化し、flushは両方を待つ', async () => {
    const first = deferred<undefined>();
    const saveDraft = vi
      .fn<(next: ExerciseDraft) => Promise<void>>()
      .mockImplementationOnce(() => first.promise)
      .mockResolvedValue(undefined);
    const statuses: string[] = [];
    const autosave = createAutosaveController({} as ProgressRepository, {
      delayMs: 450,
      saveDraft,
      onStatus: (status) => statuses.push(status),
    });

    autosave.schedule(draft(1));
    await vi.advanceTimersByTimeAsync(450);
    autosave.schedule(draft(2));
    const flushing = autosave.flush();
    expect(saveDraft).toHaveBeenCalledTimes(1);
    first.resolve(undefined);
    await flushing;

    expect(saveDraft.mock.calls.map(([value]) => value.editRevision)).toEqual([1, 2]);
    expect(statuses).toEqual(['saving', 'saving', 'saved']);
  });

  it('古いsave失敗で新しいpendingを上書きせず、次のflushで最新をretryする', async () => {
    const first = deferred<undefined>();
    const saveDraft = vi
      .fn<(next: ExerciseDraft) => Promise<void>>()
      .mockImplementationOnce(() => first.promise)
      .mockResolvedValue(undefined);
    const statuses: string[] = [];
    const autosave = createAutosaveController({} as ProgressRepository, {
      delayMs: 450,
      saveDraft,
      onStatus: (status) => statuses.push(status),
    });

    autosave.schedule(draft(1));
    await vi.advanceTimersByTimeAsync(450);
    autosave.schedule(draft(2));
    const failedFlush = autosave.flush();
    first.reject(new Error('quota'));
    await expect(failedFlush).rejects.toThrow('quota');
    expect(statuses).toEqual(['saving', 'error']);

    await autosave.flush();
    expect(saveDraft.mock.calls.map(([value]) => value.editRevision)).toEqual([1, 2]);
    expect(statuses).toEqual(['saving', 'error', 'saving', 'saved']);
  });

  it('timer save失敗を未処理にせずpending保持し、disposeで次のtimerを停止する', async () => {
    const saveDraft = vi
      .fn<(next: ExerciseDraft) => Promise<void>>()
      .mockRejectedValueOnce(new Error('write'))
      .mockResolvedValue(undefined);
    const statuses: string[] = [];
    const autosave = createAutosaveController({} as ProgressRepository, {
      delayMs: 450,
      saveDraft,
      onStatus: (status) => statuses.push(status),
    });

    autosave.schedule(draft(1));
    await vi.advanceTimersByTimeAsync(450);
    expect(statuses).toEqual(['saving', 'error']);
    await autosave.flush();
    expect(saveDraft).toHaveBeenCalledTimes(2);

    autosave.schedule(draft(2));
    autosave.dispose();
    await vi.advanceTimersByTimeAsync(500);
    expect(saveDraft).toHaveBeenCalledTimes(2);
  });

  it('timer保存失敗と次回成功の回復を安全なcallbackへ一度ずつ通知する', async () => {
    const saveDraft = vi
      .fn<(next: ExerciseDraft) => Promise<void>>()
      .mockRejectedValueOnce(new Error('quota'))
      .mockResolvedValueOnce(undefined);
    const onError = vi.fn();
    const onRecovered = vi.fn();
    const autosave = createAutosaveController({} as ProgressRepository, {
      delayMs: 450,
      saveDraft,
      onError,
      onRecovered,
    });

    autosave.schedule(draft(1));
    await vi.advanceTimersByTimeAsync(450);
    expect(onError).toHaveBeenCalledOnce();
    expect(onRecovered).not.toHaveBeenCalled();

    await autosave.flush();
    expect(onRecovered).toHaveBeenCalledOnce();
    expect(saveDraft).toHaveBeenCalledTimes(2);
  });

  it('active save中のdisposeは進行中だけを完了させ、後続pendingを保存しない', async () => {
    const first = deferred<undefined>();
    const saveDraft = vi
      .fn<(next: ExerciseDraft) => Promise<void>>()
      .mockImplementationOnce(() => first.promise)
      .mockResolvedValue(undefined);
    const autosave = createAutosaveController({} as ProgressRepository, {
      delayMs: 450,
      saveDraft,
    });

    autosave.schedule(draft(1));
    await vi.advanceTimersByTimeAsync(450);
    autosave.schedule(draft(2));
    autosave.dispose();
    first.resolve(undefined);
    await autosave.flush();

    expect(saveDraft.mock.calls.map(([value]) => value.editRevision)).toEqual([1]);
  });

  it.each([-1, 501, Number.NaN])('不正なdelayを拒否する: %s', (delayMs) => {
    expect(() => createAutosaveController({} as ProgressRepository, { delayMs })).toThrow(
      'autosave delayMsは0以上500以下で指定してください',
    );
  });
});
