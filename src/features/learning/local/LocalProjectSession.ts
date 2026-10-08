import {
  LocalWorkspaceApiError,
  workspaceFilesSchema,
  type LocalWorkspace,
  type LocalWorkspaceClient,
  type WorkspaceRun,
} from '../../../adapters/runtime/local/LocalWorkspaceClient';
import type { EditorCursor, ExerciseDraft } from '../../../core/persistence/contracts';
import { LOCAL_PROJECT } from '../../../core/persistence/localProjectDescriptor';
import type { ValidationResult } from '../../../core/validation/contracts';
import { projectDraft, projectValidation, sameProjectFiles } from './localProjectProgress';

type Operation = 'connect' | 'save' | 'start' | 'apply' | 'grade' | 'stop';
export interface LocalProjectSnapshot {
  readonly draft?: ExerciseDraft | undefined;
  readonly saved?: LocalWorkspace | undefined;
  readonly run?: WorkspaceRun | undefined;
  readonly connected: boolean;
  readonly busy?: Operation | undefined;
  readonly message: string;
  readonly error?: string | undefined;
  readonly conflict: boolean;
  readonly draftSaved: boolean;
  readonly result?: ValidationResult | undefined;
}

type ProjectClient = Pick<
  LocalWorkspaceClient,
  'connect' | 'status' | 'save' | 'start' | 'apply' | 'grade' | 'stop' | 'activity'
>;
const activeStates = new Set(['starting', 'ready', 'applying', 'stopping']);

/** UIの編集版と保存/反映版を分け、停止・離脱・連続編集後の応答を採用しない。 */
export class LocalProjectSession {
  #snapshot: LocalProjectSnapshot;
  readonly #listeners = new Set<() => void>();
  #generation = 0;
  #disposed = false;
  #poll: ReturnType<typeof setTimeout> | undefined;
  #draftTimer: ReturnType<typeof setTimeout> | undefined;
  #writes: Promise<void> = Promise.resolve();
  #starting: Promise<WorkspaceRun> | undefined;
  #lastActivity = 0;
  #disposing: Promise<void> | undefined;

  constructor(
    private readonly client: ProjectClient,
    private readonly persist: (draft: ExerciseDraft) => Promise<void>,
    private readonly writable: () => boolean,
    draft?: ExerciseDraft,
  ) {
    if (draft) {
      if (
        draft.courseId !== LOCAL_PROJECT.courseId ||
        draft.lessonId !== LOCAL_PROJECT.lessonId ||
        draft.exerciseId !== LOCAL_PROJECT.exerciseId ||
        draft.workspaceId !== LOCAL_PROJECT.workspaceId ||
        draft.contentRevision !== LOCAL_PROJECT.revision
      )
        throw new Error('保存された下書きとLocal課題が一致しません。');
      workspaceFilesSchema.parse(draft.files);
      if (!Object.hasOwn(draft.files, draft.selectedFile))
        draft = { ...draft, selectedFile: 'message.js' };
    }
    this.#snapshot = {
      ...(draft ? { draft } : {}),
      connected: false,
      message: '「環境へ接続」で保存版と実行状態を確認します。',
      conflict: false,
      draftSaved: true,
    };
  }

  getSnapshot = (): LocalProjectSnapshot => this.#snapshot;
  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  #set(patch: Partial<LocalProjectSnapshot>): void {
    if (this.#disposed) return;
    this.#snapshot = { ...this.#snapshot, ...patch };
    this.#listeners.forEach((listener) => {
      listener();
    });
  }

  #current(generation: number): boolean {
    return !this.#disposed && this.#generation === generation;
  }

  #failure(error: unknown): void {
    const conflict = error instanceof LocalWorkspaceApiError && error.status === 409;
    this.#set({
      error: error instanceof Error ? error.message : '処理に失敗しました。',
      conflict,
      ...(conflict ? {} : { connected: false }),
    });
  }

  /** 書込を直列化し、古い保存完了で新しい下書きを「保存済み」にしない。 */
  flushDraft = async (): Promise<void> => {
    clearTimeout(this.#draftTimer);
    const draft = this.#snapshot.draft;
    if (!draft) return;
    const pending = this.#writes.catch(() => {}).then(() => this.persist(draft));
    this.#writes = pending;
    try {
      await pending;
      if (this.#snapshot.draft === draft) this.#set({ draftSaved: true });
    } catch (error: unknown) {
      this.#set({
        error: `端末への保存に失敗しました。${error instanceof Error ? error.message : ''}`,
        draftSaved: false,
      });
      throw error;
    }
  };

  #draftChanged(draft: ExerciseDraft): void {
    this.#set({ draft, draftSaved: false });
    clearTimeout(this.#draftTimer);
    this.#draftTimer = setTimeout(() => {
      void this.flushDraft().catch(() => {});
    }, 300);
  }

  edit(path: string, content: string): number | undefined {
    const draft = this.#snapshot.draft;
    if (!draft || !this.writable() || !Object.hasOwn(draft.files, path) || this.#disposed)
      return undefined;
    const next = {
      ...draft,
      files: { ...draft.files, [path]: content },
      editRevision: draft.editRevision + 1,
      updatedAt: new Date().toISOString(),
    };
    this.#draftChanged(next);
    this.#set({ result: undefined });
    const run = this.#snapshot.run;
    if (
      run?.state === 'ready' &&
      this.#snapshot.connected &&
      Date.now() - this.#lastActivity > 30000
    ) {
      this.#lastActivity = Date.now();
      void this.client.activity(run).catch(() => {});
    }
    return next.editRevision;
  }

  select(path: string): void {
    const draft = this.#snapshot.draft;
    if (draft && Object.hasOwn(draft.files, path))
      this.#draftChanged({ ...draft, selectedFile: path });
  }

  cursor(path: string, cursor: EditorCursor): void {
    const draft = this.#snapshot.draft;
    if (draft) this.#draftChanged({ ...draft, cursors: { ...draft.cursors, [path]: cursor } });
  }

  canGrade(): boolean {
    const { draft, saved, run, connected, busy, conflict } = this.#snapshot;
    return Boolean(
      this.writable() &&
      connected &&
      !busy &&
      !conflict &&
      draft &&
      saved &&
      run?.state === 'ready' &&
      !run.cleanupPending &&
      sameProjectFiles(draft.files, saved.files) &&
      saved.sourceRevision === run.sourceRevision &&
      saved.sourceHash === run.sourceHash,
    );
  }

  async #operation(
    kind: Operation,
    operation: (generation: number) => Promise<void>,
  ): Promise<void> {
    if (this.#disposed || !this.writable() || this.#snapshot.busy) return;
    const generation = ++this.#generation;
    clearTimeout(this.#poll);
    this.#set({ busy: kind, error: undefined, result: undefined });
    try {
      await operation(generation);
    } catch (error: unknown) {
      if (this.#current(generation)) this.#failure(error);
    } finally {
      if (this.#current(generation)) {
        this.#set({ busy: undefined });
        this.#schedulePoll();
      }
    }
  }

  connect = async (): Promise<void> =>
    this.#operation('connect', async (generation) => {
      const capabilities = await this.client.connect();
      const saved = await this.client.status();
      if (!this.#current(generation)) return;
      const draft = this.#snapshot.draft ?? projectDraft(saved?.files ?? capabilities.starterFiles);
      workspaceFilesSchema.parse(draft.files);
      this.#set({
        draft,
        saved,
        run: saved?.lastRun ?? undefined,
        connected: true,
        conflict: false,
        message: '環境へ接続しました。下書きを保存して起動できます。',
      });
      if (!this.#snapshot.draftSaved || !saved) await this.flushDraft();
    });

  async #saveSource(generation: number): Promise<LocalWorkspace | undefined> {
    const draft = this.#snapshot.draft;
    if (!draft || !this.#snapshot.connected || this.#snapshot.conflict) return undefined;
    const files = workspaceFilesSchema.parse(draft.files);
    await this.flushDraft();
    if (!this.#current(generation)) return undefined;
    const saved = await this.client.save(this.#snapshot.saved?.sourceRevision ?? 0, files);
    if (!this.#current(generation)) return undefined;
    if (!sameProjectFiles(saved.files, files)) throw new Error('保存応答のSourceが一致しません。');
    this.#set({
      saved,
      run: saved.lastRun ?? undefined,
      message: `保存版 ${String(saved.sourceRevision)} をcontrollerへ保存しました。`,
    });
    return saved;
  }

  save = async (): Promise<void> =>
    this.#operation('save', async (generation) => {
      await this.#saveSource(generation);
    });

  start = async (): Promise<void> =>
    this.#operation('start', async (generation) => {
      const saved = await this.#saveSource(generation);
      if (!saved) return;
      const starting = this.client.start(saved.sourceRevision);
      this.#starting = starting;
      try {
        const run = await starting;
        if (this.#current(generation)) this.#set({ run, message: '実サーバーを起動しています。' });
      } finally {
        if (this.#starting === starting) this.#starting = undefined;
      }
    });

  apply = async (): Promise<void> =>
    this.#operation('apply', async (generation) => {
      const run = this.#snapshot.run;
      if (run?.state !== 'ready') return;
      const saved = await this.#saveSource(generation);
      if (!saved) return;
      this.#set({ run: { ...run, state: 'applying' }, message: '保存版を実行へ反映しています。' });
      const applied = await this.client.apply(run, saved);
      if (!this.#current(generation)) return;
      this.#set({
        saved: applied,
        run: applied.lastRun ?? undefined,
        message: '保存版を実行へ反映しました。',
      });
    });

  grade = async (): Promise<void> => {
    if (!this.canGrade()) return;
    const { draft, saved, run } = this.#snapshot;
    if (!draft || !saved || !run) return;
    await this.#operation('grade', async (generation) => {
      this.#set({ message: '固定Browserで実サーバーの見出しを確認しています。' });
      const grade = await this.client.grade(run, saved);
      if (!this.#current(generation)) return;
      if (!this.writable()) {
        this.#set({
          message: '編集権の再確認中のため、採点結果を採用しませんでした。再判定してください。',
        });
        return;
      }
      const current = this.#snapshot;
      if (
        current.draft?.editRevision !== draft.editRevision ||
        !sameProjectFiles(current.draft.files, draft.files) ||
        current.run?.runId !== run.runId
      ) {
        this.#set({
          message:
            '採点中に編集されたため、結果を採用しませんでした。保存・反映後に再判定してください。',
        });
        return;
      }
      const result = projectValidation(grade, draft.editRevision);
      const snapshots = { ...current.draft.lastPassingSnapshots };
      if (grade.status === 'pass')
        snapshots[LOCAL_PROJECT.exerciseId] = {
          files: draft.files,
          editRevision: draft.editRevision,
          contentRevision: draft.contentRevision,
          evaluatedAt: grade.evaluatedAt,
        };
      else Reflect.deleteProperty(snapshots, LOCAL_PROJECT.exerciseId);
      this.#draftChanged({
        ...current.draft,
        validationHistory: [...current.draft.validationHistory, result].slice(-20),
        lastPassingSnapshots: snapshots,
        updatedAt: grade.evaluatedAt,
      });
      this.#set({
        result,
        message:
          grade.status === 'pass'
            ? '合格です。実サーバーの見出しを確認しました。'
            : grade.status === 'code-error'
              ? 'コードにエラーがあります。'
              : 'まだ合格条件に届いていません。',
      });
      await this.flushDraft();
    });
  };

  /** stopは他の操作を中断できる。start応答待ちの場合も、そのrunだけを回収する。 */
  stop = async (): Promise<void> => {
    if (this.#disposed) return;
    const generation = ++this.#generation;
    clearTimeout(this.#poll);
    this.#set({ busy: 'stop', result: undefined, message: '実サーバーを停止しています。' });
    try {
      const run = this.#starting ? await this.#starting : this.#snapshot.run;
      this.#starting = undefined;
      if (run && activeStates.has(run.state)) {
        this.#set({ run: { ...run, state: 'stopping' } });
        const saved = await this.client.stop(run);
        if (this.#current(generation)) this.#set({ saved, run: saved.lastRun ?? undefined });
      }
      if (this.#current(generation))
        this.#set({ message: '停止しました。下書きと進捗はこの端末に残ります。' });
    } catch (error: unknown) {
      if (this.#current(generation)) this.#failure(error);
    } finally {
      if (this.#current(generation)) this.#set({ busy: undefined });
    }
  };

  #schedulePoll(): void {
    const run = this.#snapshot.run;
    if (!run || !activeStates.has(run.state) || !this.#snapshot.connected || this.#disposed) return;
    const generation = this.#generation;
    this.#poll = setTimeout(
      () => {
        void this.#refresh(generation, run.runId);
      },
      run.state === 'starting' ? 500 : 5000,
    );
  }

  async #refresh(generation: number, runId: string): Promise<void> {
    try {
      const saved = await this.client.status();
      if (!this.#current(generation)) return;
      if (saved?.lastRun?.runId !== runId)
        throw new Error('実行情報が変わりました。「環境へ接続」で再確認してください。');
      const state = saved.lastRun.state;
      const message =
        state === 'failed'
          ? '実サーバーが終了しました。下書きは保持しています。保存して起動すると再開できます。'
          : state === 'idle'
            ? '操作がないため実行を終了しました。下書きは保持しています。保存して起動すると再開できます。'
            : state === 'ready'
              ? '実サーバーが実行可能になりました。Previewを確認して判定できます。'
              : undefined;
      this.#set({
        saved,
        run: saved.lastRun,
        ...(state !== this.#snapshot.run?.state && message ? { message } : {}),
      });
      this.#schedulePoll();
    } catch (error: unknown) {
      if (this.#current(generation)) this.#failure(error);
    }
  }

  /** 実際のLease譲渡では保存と停止を両方待つ。focus再検証からは呼ばない。 */
  quiesce = async (): Promise<void> => {
    const results = await Promise.allSettled([this.stop(), this.flushDraft()]);
    for (const result of results) if (result.status === 'rejected') throw result.reason;
  };

  /** 画面移動時の後着応答を無効化し、同じSessionの重複cleanupを一つにする。 */
  dispose = (): Promise<void> => {
    if (this.#disposing) return this.#disposing;
    this.#disposing = (async () => {
      try {
        await this.quiesce();
      } finally {
        this.#disposed = true;
        this.#generation++;
        clearTimeout(this.#poll);
        clearTimeout(this.#draftTimer);
        this.#listeners.clear();
      }
    })();
    return this.#disposing;
  };
}
