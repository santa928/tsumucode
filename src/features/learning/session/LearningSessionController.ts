import type {
  Exercise,
  JavaScriptInteractionCheckpoint,
  JavaScriptInteractionScenario,
  PreviewViewport,
} from '../../../core/content/types';
import {
  createLearningSessionState,
  learningSessionReducer,
  type LearningSessionAction,
  type LearningSessionState,
} from '../../../core/learning/sessionReducer';
import type {
  EditorCursor,
  ExerciseDraft,
  ProgressRepository,
} from '../../../core/persistence/contracts';
import type {
  InteractionCheckpointResult,
  InteractionResult,
  PreviewSnapshot,
  ResolvedPreviewAsset,
  RunnerAdapter,
  RunnerDiagnostic,
  RunnerEvidence,
  RunnerRenderResult,
  RunnerConsoleRecord,
  SnapshotPolicy,
} from '../../../core/runtime/contracts';
import type { ValidationResult, ValidatorAdapter } from '../../../core/validation/contracts';
import { createAutosaveController } from './createAutosaveController';
import { evaluateInteractionCheckpoint } from './evaluateInteractionCheckpoint';

export interface LearningSessionControllerInput {
  readonly courseId: string;
  readonly lessonId: string;
  readonly exercise: Exercise;
  readonly validationExercises?: readonly Exercise[];
  readonly contentRevision: string;
  readonly resolvedAssets: readonly ResolvedPreviewAsset[];
  readonly repository: ProgressRepository;
  readonly saveDraft?: (draft: ExerciseDraft) => Promise<void>;
  readonly onDirty?: (draft: ExerciseDraft) => void;
  readonly onBackgroundError?: (error: unknown) => void;
  readonly onSaveError?: (error: unknown) => void;
  readonly onSaveRecovered?: () => void;
  readonly runner: RunnerAdapter;
  readonly validator: ValidatorAdapter;
  readonly now: () => string;
  readonly createRequestId?: () => string;
}

export interface WorkspaceValidationItem {
  readonly exercise: Exercise;
  readonly result: ValidationResult;
}

interface ExecutionInput {
  readonly revision: number;
  readonly mutationRevision: number;
  readonly files: Readonly<Record<string, string>>;
  readonly exerciseSessionId: string;
}

interface ValidationPlan {
  readonly exercises: readonly Exercise[];
  readonly viewports: readonly PreviewViewport[];
}

const MAX_EVIDENCE_ITEMS = 64;
const MAX_EVIDENCE_ID_LENGTH = 128;
const MAX_EVIDENCE_FILE_LENGTH = 256;
const MAX_EVIDENCE_STRING_LENGTH = 4096;
const EVIDENCE_ID_PATTERN = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/u;
const INTERACTION_POLL_INTERVAL_MS = 50;
const INTERACTION_POLL_TIMEOUT_MS = 750;
const MAX_INTERACTION_POLICY_ITEMS = 64;

type InteractionResultsByExercise = Record<string, Record<string, InteractionCheckpointResult[]>>;

/** ScenarioのDOM期待値を既存Validator policyへ重複なく追加する。 */
function extendSnapshotPolicyForInteractions(
  policy: SnapshotPolicy,
  exercises: readonly Exercise[],
): SnapshotPolicy {
  const selectors = new Set(policy.selectors);
  const attributes = new Set(policy.attributes);
  for (const exercise of exercises) {
    for (const scenario of exercise.interactionScenarios ?? []) {
      for (const checkpoint of scenario.checkpoints) {
        for (const expectation of checkpoint.expectations) {
          if (expectation.kind === 'console-includes') continue;
          selectors.add(expectation.selector);
          if (expectation.kind === 'attribute') attributes.add(expectation.name);
        }
      }
    }
  }
  if (
    selectors.size > MAX_INTERACTION_POLICY_ITEMS ||
    attributes.size > MAX_INTERACTION_POLICY_ITEMS
  ) {
    throw new Error('Interaction Snapshot policyが上限を超えています');
  }
  return {
    ...policy,
    selectors: [...selectors],
    attributes: [...attributes],
  };
}

/** EvidenceのFileがworkspace内の正規化済み相対Pathとして安全か確認する。 */
function isNormalizedEvidenceFile(value: string): boolean {
  if (
    value.length === 0 ||
    value.length > MAX_EVIDENCE_FILE_LENGTH ||
    value.startsWith('/') ||
    value.includes('\\') ||
    value.includes('?') ||
    value.includes('#')
  ) {
    return false;
  }
  const segments = value.split('/');
  return segments.every((segment) => segment.length > 0 && segment !== '.' && segment !== '..');
}

/** Runner境界のEvidenceをbounded scalarへ限定し、比較可能な決定順で複製する。 */
function normalizeRunnerEvidence(evidence: unknown): readonly RunnerEvidence[] {
  if (!Array.isArray(evidence) || evidence.length > MAX_EVIDENCE_ITEMS) {
    throw new Error('Runner evidenceはboundedな配列で指定してください');
  }
  const rawEvidence: readonly unknown[] = evidence;
  const identities = new Set<string>();
  const normalized = rawEvidence.map((rawItem) => {
    if (typeof rawItem !== 'object' || rawItem === null || Array.isArray(rawItem)) {
      throw new Error('Runner evidence項目がObjectではありません');
    }
    const item = rawItem as Readonly<Record<string, unknown>>;
    const id = item.id;
    const file = item.file;
    const value = item.value;
    const expectedKeys = file === undefined ? ['id', 'value'] : ['file', 'id', 'value'];
    if (
      JSON.stringify(Object.keys(item).sort()) !== JSON.stringify(expectedKeys) ||
      typeof id !== 'string' ||
      id.length === 0 ||
      id.length > MAX_EVIDENCE_ID_LENGTH ||
      !EVIDENCE_ID_PATTERN.test(id)
    ) {
      throw new Error('Runner evidence IDが契約に一致しません');
    }
    if (file !== undefined && (typeof file !== 'string' || !isNormalizedEvidenceFile(file))) {
      throw new Error('Runner evidence Fileが契約に一致しません');
    }
    if (!(
      typeof value === 'boolean' ||
      (typeof value === 'number' && Number.isFinite(value)) ||
      (typeof value === 'string' && value.length <= MAX_EVIDENCE_STRING_LENGTH)
    )) {
      throw new Error('Runner evidence Valueがbounded scalarではありません');
    }
    const identity = JSON.stringify([id, file ?? null]);
    if (identities.has(identity)) throw new Error('Runner evidence identityが重複しています');
    identities.add(identity);
    return Object.freeze({
      id,
      ...(file === undefined ? {} : { file }),
      value,
    });
  });
  return Object.freeze(
    normalized.sort((left, right) =>
      JSON.stringify([left.id, left.file ?? null, left.value]).localeCompare(
        JSON.stringify([right.id, right.file ?? null, right.value]),
      ),
    ),
  );
}

/** 2 viewportのEvidenceがscalar値まで完全一致するか確認する。 */
function runnerEvidenceEqual(
  left: readonly RunnerEvidence[],
  right: readonly RunnerEvidence[],
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/** 2 viewportのbounded Consoleがsequence、level、textまで完全一致するか確認する。 */
function runnerConsoleEqual(
  left: readonly RunnerConsoleRecord[],
  right: readonly RunnerConsoleRecord[],
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/** editでrevisionが変わった非同期結果をstateへ入れないための公開Error。 */
export class StaleExecutionError extends Error {
  constructor() {
    super('新しい操作または編集があるため古い実行結果を破棄しました');
    this.name = 'StaleExecutionError';
  }
}

/** 同値diagnosticを初出順で一度だけ残す。 */
function dedupeDiagnostics(diagnostics: readonly RunnerDiagnostic[]): readonly RunnerDiagnostic[] {
  const seen = new Set<string>();
  return diagnostics.filter((diagnostic) => {
    const key = JSON.stringify([
      diagnostic.code,
      diagnostic.kind,
      diagnostic.severity,
      diagnostic.message,
      diagnostic.learnerMessage,
      diagnostic.file,
      diagnostic.line,
      diagnostic.column,
    ]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** 共有workspaceの判定batchを現在Exerciseの履歴用Resultへ決定的にまとめる。 */
function mergeWorkspaceValidationResults(
  currentExerciseId: string,
  revision: number,
  batch: readonly WorkspaceValidationItem[],
  now: string,
): ValidationResult {
  const current = batch.find(({ exercise: item }) => item.id === currentExerciseId)?.result;
  if (current === undefined) throw new Error('現在Exerciseの判定結果がありません');
  const statuses = batch.map(({ result }) => result.status);
  const status = statuses.includes('system-error')
    ? 'system-error'
    : statuses.includes('code-error')
      ? 'code-error'
      : statuses.includes('incomplete')
        ? 'incomplete'
        : 'pass';
  return {
    ...current,
    executionRevision: revision,
    status,
    checks: batch.flatMap(({ exercise: item, result }) =>
      result.checks.map((check) => ({
        ...check,
        label: item.id === currentExerciseId ? check.label : `${item.title}: ${check.label}`,
      })),
    ),
    passedRequirementIds: [...new Set(batch.flatMap(({ result }) => result.passedRequirementIds))],
    diagnostics: dedupeDiagnostics(batch.flatMap(({ result }) => result.diagnostics)),
    evaluatedAt: now,
  };
}

/** 対象Exerciseとviewport unionをrender前に検証する。 */
function createValidationPlan(
  current: Exercise,
  requested: readonly Exercise[] | undefined,
): ValidationPlan {
  const exercises = requested ?? [current];
  if (exercises.length === 0) throw new Error('validationExercisesは1件以上必要です');
  const exerciseIds = new Set<string>();
  let currentCount = 0;
  const viewports = new Map<string, PreviewViewport>();
  for (const item of exercises) {
    if (exerciseIds.has(item.id)) throw new Error(`Exercise IDが重複しています: ${item.id}`);
    exerciseIds.add(item.id);
    if (item.id === current.id) currentCount += 1;
    if (item.workspaceId !== current.workspaceId) {
      throw new Error(`validationExercisesのworkspaceIdが一致しません: ${item.id}`);
    }
    for (const viewport of item.previewViewports) {
      const previous = viewports.get(viewport.id);
      if (
        previous !== undefined &&
        (previous.width !== viewport.width || previous.height !== viewport.height)
      ) {
        throw new Error(`同じViewport IDの寸法が一致しません: ${viewport.id}`);
      }
      if (previous === undefined) viewports.set(viewport.id, viewport);
    }
  }
  if (currentCount !== 1) throw new Error('現在ExerciseがvalidationExercisesに1件必要です');
  return { exercises: [...exercises], viewports: [...viewports.values()] };
}

/** persisted cursorが存在file内の有限な非負整数か確認する。 */
function isValidCursor(cursor: EditorCursor, content: string): boolean {
  return (
    Number.isInteger(cursor.anchor) &&
    Number.isInteger(cursor.head) &&
    cursor.anchor >= 0 &&
    cursor.head >= 0 &&
    cursor.anchor <= content.length &&
    cursor.head <= content.length
  );
}

/** lastPassingSnapshotsをFile recordまで複製する。 */
function clonePassingSnapshots(
  snapshots: ExerciseDraft['lastPassingSnapshots'],
): ExerciseDraft['lastPassingSnapshots'] {
  return Object.fromEntries(
    Object.entries(snapshots).map(([exerciseId, item]) => [
      exerciseId,
      { ...item, files: { ...item.files } },
    ]),
  );
}

/** unknownなWeb Crypto値がrandomUUIDを安全に提供するか確認する。 */
function isRandomUUIDProvider(value: unknown): value is { readonly randomUUID: () => string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof Reflect.get(value, 'randomUUID') === 'function'
  );
}

/** Performance APIの欠落・例外を学習操作の成否へ波及させない。 */
function safelyMeasure(stage: 'start' | 'end', name: string, marker: string): void {
  try {
    if (stage === 'start') {
      globalThis.performance.mark(`${marker}:start`);
      return;
    }
    globalThis.performance.mark(`${marker}:end`);
    globalThis.performance.measure(name, `${marker}:start`, `${marker}:end`);
  } catch {
    // 計測はbest-effortで、Runner・保存・判定の結果を変更しない。
  }
}

/** File keyと内容が完全に一致するかを、未知のDraft由来Fileも含めて判定する。 */
function filesEqual(
  left: Readonly<Record<string, string>>,
  right: Readonly<Record<string, string>>,
): boolean {
  const paths = Object.keys(left);
  return (
    paths.length === Object.keys(right).length &&
    paths.every((path) => Object.hasOwn(right, path) && left[path] === right[path])
  );
}

/** Editor、Runner、Validator、Repositoryをrevision付きの1セッションへ直列化する。 */
export class LearningSessionController {
  readonly #listeners = new Set<() => void>();
  readonly #autosave;
  readonly #editableFiles: ReadonlyMap<string, boolean>;
  readonly #exerciseSessionId: string;
  readonly #starterFiles: Readonly<Record<string, string>>;
  readonly #starterSelectedFile: string;
  #operationTail: Promise<void> = Promise.resolve();
  #previewTimer: ReturnType<typeof setTimeout> | undefined;
  #lastPassingSnapshots: ExerciseDraft['lastPassingSnapshots'] = {};
  #lastValidationBatch: readonly WorkspaceValidationItem[] = [];
  #lastValidationDraft: ExerciseDraft | undefined;
  #state: LearningSessionState;
  #initializePromise: Promise<void> | undefined;
  #disposePromise: Promise<void> | undefined;
  #disposeRequested = false;
  #measureSequence = 0;
  #mutationRevision = 0;
  #requestSequence = 0;

  constructor(private readonly input: LearningSessionControllerInput) {
    const files = Object.fromEntries(input.exercise.files.map((file) => [file.path, file.content]));
    const firstFile = input.exercise.files[0]?.path;
    if (firstFile === undefined) throw new Error('ExerciseにFileがありません');
    const firstStepFile = input.exercise.steps[0]?.file;
    const selectedFile =
      firstStepFile !== undefined && Object.hasOwn(files, firstStepFile)
        ? firstStepFile
        : firstFile;
    this.#starterFiles = Object.freeze({ ...files });
    this.#starterSelectedFile = selectedFile;
    this.#editableFiles = new Map(
      input.exercise.files.map((file) => [file.path, file.editable] as const),
    );
    this.#exerciseSessionId = `${input.courseId}:${input.exercise.id}`;
    this.#state = learningSessionReducer(
      createLearningSessionState({
        courseId: input.courseId,
        lessonId: input.lessonId,
        exerciseId: input.exercise.id,
        files,
        selectedFile,
      }),
      { type: 'phase.exercise' },
    );
    this.#autosave = createAutosaveController(input.repository, {
      delayMs: 450,
      ...(input.saveDraft === undefined ? {} : { saveDraft: input.saveDraft }),
      ...(input.onSaveError === undefined ? {} : { onError: input.onSaveError }),
      ...(input.onSaveRecovered === undefined ? {} : { onRecovered: input.onSaveRecovered }),
      onStatus: (status) => {
        this.#dispatch({ type: 'save.changed', status: status === 'idle' ? 'idle' : status });
      },
    });
  }

  /** React subscription用の安定したsnapshot getter。 */
  readonly getSnapshot = (): LearningSessionState => this.#state;

  /** React subscriptionへlistenerを登録し、冪等な解除関数を返す。 */
  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    let subscribed = true;
    return () => {
      if (!subscribed) return;
      subscribed = false;
      this.#listeners.delete(listener);
    };
  };

  /** reducer結果が変わったときだけsnapshotを差し替えて通知する。 */
  #dispatch(action: LearningSessionAction): void {
    const next = learningSessionReducer(this.#state, action);
    if (next === this.#state) return;
    this.#state = next;
    for (const listener of [...this.#listeners]) listener();
  }

  /** 直接構築したstateを一度だけ通知付きでcommitする。 */
  #replaceState(next: LearningSessionState): void {
    if (next === this.#state) return;
    this.#state = next;
    for (const listener of [...this.#listeners]) listener();
  }

  /** dispose開始後の新規操作を同期境界で拒否する。 */
  #assertAcceptingOperations(): void {
    if (this.#disposeRequested)
      throw new Error('LearningSessionController is disposing or disposed');
  }

  /** stateful Runnerを触る非同期操作を失敗後も継続可能な1本のqueueへ積む。 */
  #enqueue<T>(operation: () => Promise<T>): Promise<T> {
    this.#assertAcceptingOperations();
    const queued = this.#operationTail.then(operation);
    this.#operationTail = queued.then(
      () => undefined,
      () => undefined,
    );
    return queued;
  }

  /** 現在revisionとFile snapshotをRunnerへ渡す不変入力として固定する。 */
  #captureExecution(): ExecutionInput {
    return {
      revision: this.#state.executionRevision,
      mutationRevision: this.#mutationRevision,
      files: Object.freeze({ ...this.#state.files }),
      exerciseSessionId: this.#exerciseSessionId,
    };
  }

  /** 非同期境界の前後でsourceまたはDraft UI状態が変わっていないことを確認する。 */
  #assertFresh(execution: ExecutionInput): void {
    if (
      execution.revision !== this.#state.executionRevision ||
      execution.mutationRevision !== this.#mutationRevision
    ) {
      throw new StaleExecutionError();
    }
  }

  /** 永続Draftへ影響する同期UI操作を非同期処理用generationへ記録する。 */
  #markDraftMutation(): void {
    this.#mutationRevision += 1;
    this.#lastValidationDraft = undefined;
  }

  /** 背景通知先の例外をtimer起点Promiseへ再伝播させない。 */
  #reportBackgroundError(error: unknown): void {
    try {
      this.input.onBackgroundError?.(error);
    } catch {
      // 観測callbackの失敗は学習セッションや未処理rejectionへ波及させない。
    }
  }

  /** 指定stateとpassing snapshotから永続Draftを複製して構築する。 */
  #draft(
    state: LearningSessionState = this.#state,
    passingSnapshots: ExerciseDraft['lastPassingSnapshots'] = this.#lastPassingSnapshots,
  ): ExerciseDraft {
    const review = state.reviewReturn;
    return {
      courseId: this.input.courseId,
      lessonId: this.input.lessonId,
      exerciseId: this.input.exercise.id,
      workspaceId: this.input.exercise.workspaceId,
      contentRevision: this.input.contentRevision,
      editRevision: state.executionRevision,
      files: { ...state.files },
      selectedFile: state.selectedFile,
      cursors: { ...state.cursors },
      validationHistory: [...state.validationHistory],
      revealedHintIds: [...state.revealedHintIds],
      ...(review === undefined
        ? {}
        : { reviewSlideId: review.slideId, reviewScrollOffset: review.scrollOffset }),
      lastPassingSnapshots: clonePassingSnapshots(passingSnapshots),
      updatedAt: this.input.now(),
    };
  }

  /** 保存済みDraftをworkspace sourceとExercise-local状態へ分離して復元する。 */
  async #initialize(): Promise<void> {
    const execution = this.#captureExecution();
    const draft = await this.input.repository.getDraft(
      this.input.courseId,
      this.input.exercise.workspaceId,
    );
    this.#assertFresh(execution);
    if (draft === undefined) return;
    if (
      draft.courseId !== this.input.courseId ||
      draft.workspaceId !== this.input.exercise.workspaceId ||
      draft.contentRevision !== this.input.contentRevision
    ) {
      throw new Error('DraftのCourse、workspace、content revisionが一致しません');
    }
    const files = { ...this.#state.files, ...draft.files };
    const cursors = Object.fromEntries(
      Object.entries(draft.cursors).filter(([path, cursor]) => {
        const content = files[path];
        return content !== undefined && isValidCursor(cursor, content);
      }),
    );
    const isCurrentExercise = draft.exerciseId === this.input.exercise.id;
    const hintIds = new Set(this.input.exercise.hints.map(({ id }) => id));
    const revealedHintIds = isCurrentExercise
      ? draft.revealedHintIds.filter((id) => hintIds.has(id))
      : [];
    const reviewReturn =
      isCurrentExercise &&
      draft.reviewSlideId !== undefined &&
      this.input.exercise.relatedSlideIds.includes(draft.reviewSlideId)
        ? {
            slideId: draft.reviewSlideId,
            scrollOffset: draft.reviewScrollOffset ?? 0,
          }
        : undefined;
    this.#lastPassingSnapshots = clonePassingSnapshots(draft.lastPassingSnapshots);
    this.#replaceState({
      ...this.#state,
      files,
      executionRevision: draft.editRevision,
      selectedFile: Object.hasOwn(files, draft.selectedFile)
        ? draft.selectedFile
        : this.#state.selectedFile,
      cursors,
      validationHistory: isCurrentExercise
        ? draft.validationHistory.filter(({ exerciseId }) => exerciseId === this.input.exercise.id)
        : [],
      revealedHintIds,
      ...(reviewReturn === undefined ? {} : { reviewReturn }),
    });
  }

  /** RepositoryからDraftを一度だけ復元する。 */
  async initialize(): Promise<void> {
    this.#initializePromise ??= this.#enqueue(() => this.#initialize());
    return this.#initializePromise;
  }

  /** iframe準備も他のRunner操作と直列化する。 */
  async prepare(frame: HTMLIFrameElement): Promise<void> {
    return this.#enqueue(() => this.input.runner.prepare(frame));
  }

  /** 既知かつeditableなFileだけを変更し、保存と250ms previewを予約して新revisionを返す。 */
  edit(path: string, content: string): number {
    this.#assertAcceptingOperations();
    const editable = this.#editableFiles.get(path);
    if (editable === undefined) throw new Error(`FileがExerciseに存在しません: ${path}`);
    if (!editable) throw new Error(`Fileはeditableではありません: ${path}`);
    this.#markDraftMutation();
    this.#dispatch({ type: 'editor.changed', path, content });
    const draft = this.#draft();
    this.input.onDirty?.(draft);
    this.#autosave.schedule(draft);
    this.#clearPreviewTimer();
    this.#previewTimer = setTimeout(() => {
      this.#previewTimer = undefined;
      void this.previewNow().catch((error: unknown) => {
        if (!(error instanceof StaleExecutionError)) this.#reportBackgroundError(error);
      });
    }, 250);
    return this.#state.executionRevision;
  }

  /** 現在Exerciseの全Starterを1 mutationで復元し、変更があった場合だけ保存を予約する。 */
  resetToStarter(): boolean {
    this.#assertAcceptingOperations();
    if (filesEqual(this.#state.files, this.#starterFiles)) return false;
    this.#markDraftMutation();
    this.#clearPreviewTimer();
    const selectedFile = Object.hasOwn(this.#starterFiles, this.#state.selectedFile)
      ? this.#state.selectedFile
      : this.#starterSelectedFile;
    this.#lastPassingSnapshots = {};
    this.#lastValidationBatch = [];
    this.#dispatch({
      type: 'editor.reset',
      files: this.#starterFiles,
      selectedFile,
    });
    const draft = this.#draft();
    this.input.onDirty?.(draft);
    this.#autosave.schedule(draft);
    return true;
  }

  /** 存在するFileだけをEditor選択へ反映して保存する。 */
  selectFile(path: string): void {
    this.#assertAcceptingOperations();
    if (!Object.hasOwn(this.#state.files, path)) throw new Error(`Fileが存在しません: ${path}`);
    this.#markDraftMutation();
    this.#dispatch({ type: 'editor.selected', path });
    this.#autosave.schedule(this.#draft());
  }

  /** source範囲内の有限な非負整数cursorだけを保存する。 */
  setCursor(path: string, cursor: EditorCursor): void {
    this.#assertAcceptingOperations();
    const content = this.#state.files[path];
    if (content === undefined) throw new Error(`Fileが存在しません: ${path}`);
    if (!isValidCursor(cursor, content)) throw new Error(`cursorがFile範囲外です: ${path}`);
    this.#markDraftMutation();
    this.#dispatch({ type: 'editor.cursor', path, cursor });
    this.#autosave.schedule(this.#draft());
  }

  /** 未表示Hintのうちlevelが最小の1件だけを開く。 */
  revealNextHint(): void {
    this.#assertAcceptingOperations();
    const next = [...this.input.exercise.hints]
      .sort((left, right) => left.level - right.level)
      .find(({ id }) => !this.#state.revealedHintIds.includes(id));
    if (next === undefined) return;
    this.#markDraftMutation();
    this.#dispatch({ type: 'hint.revealed', hintId: next.id });
    this.#autosave.schedule(this.#draft());
  }

  /** 直近のExercise別判定batchを入力順で返す。 */
  getLastValidationBatch(): readonly WorkspaceValidationItem[] {
    return this.#lastValidationBatch;
  }

  /** 指定revisionで判定保存済みのDraftだけを、原子的な進捗保存へ再利用する。 */
  getLastValidationDraft(executionRevision: number): ExerciseDraft | undefined {
    return this.#lastValidationDraft?.editRevision === executionRevision
      ? this.#lastValidationDraft
      : undefined;
  }

  /** Exerciseに紐づくSlideと非負offsetだけを見直し先として保存する。 */
  openReview(slideId: string, scrollOffset: number): void {
    this.#assertAcceptingOperations();
    if (!this.input.exercise.relatedSlideIds.includes(slideId)) {
      throw new Error(`SlideがExerciseに関連付いていません: ${slideId}`);
    }
    if (!Number.isFinite(scrollOffset) || scrollOffset < 0) {
      throw new Error('review scroll offsetは有限な非負数で指定してください');
    }
    this.#markDraftMutation();
    this.#dispatch({ type: 'review.open', slideId, scrollOffset });
    this.#autosave.schedule(this.#draft());
  }

  /** 見直しからExercise phaseへ戻し、復帰情報を維持して保存する。 */
  closeReview(): void {
    this.#assertAcceptingOperations();
    this.#markDraftMutation();
    this.#dispatch({ type: 'review.close' });
    this.#autosave.schedule(this.#draft());
  }

  /** timerが残っていれば発火させず解除する。 */
  #clearPreviewTimer(): void {
    if (this.#previewTimer !== undefined) clearTimeout(this.#previewTimer);
    this.#previewTimer = undefined;
  }

  /** Runnerへ1 viewportを描画しidentityとstaleを検証する。 */
  async #render(
    execution: ExecutionInput,
    viewport: PreviewViewport,
    commitPreview: boolean,
  ): Promise<RunnerRenderResult> {
    this.#assertFresh(execution);
    const result = await this.input.runner.render({
      exerciseSessionId: execution.exerciseSessionId,
      executionRevision: execution.revision,
      languageId: this.input.runner.languageId,
      files: execution.files,
      assets: this.input.resolvedAssets,
      viewport,
      options:
        this.input.exercise.runtime === undefined ? {} : { runtime: this.input.exercise.runtime },
    });
    this.#assertFresh(execution);
    if (
      result.exerciseSessionId !== execution.exerciseSessionId ||
      result.executionRevision !== execution.revision
    ) {
      throw new Error('Runner render identityが要求と一致しません');
    }
    const evidence = normalizeRunnerEvidence(result.evidence);
    if (commitPreview) {
      this.#dispatch({
        type: 'preview.completed',
        revision: execution.revision,
        diagnostics: result.diagnostics,
        console: result.console,
      });
    }
    return { ...result, evidence };
  }

  /** 操作時間をbest-effortで測り、例外時も元の結果を維持する。 */
  async #measure<T>(name: string, operation: () => Promise<T>): Promise<T> {
    this.#measureSequence += 1;
    const marker = `tsumucode:${name}:${String(this.#measureSequence)}`;
    const measureName = `tsumucode:${name}`;
    safelyMeasure('start', measureName, marker);
    try {
      return await operation();
    } finally {
      safelyMeasure('end', measureName, marker);
    }
  }

  /** debounceを待たず、現在viewportのpreviewをRunner queueで更新する。 */
  async previewNow(): Promise<void> {
    this.#clearPreviewTimer();
    const execution = this.#captureExecution();
    const viewport = this.input.exercise.previewViewports[0];
    if (viewport === undefined) throw new Error('ExerciseにPreviewViewportがありません');
    return this.#enqueue(() =>
      this.#measure('preview-update', async () => {
        await this.#render(execution, viewport, true);
      }),
    );
  }

  /** request IDをboundedかつ同一判定内で一意に生成する。 */
  #nextRequestId(used: Set<string>): string {
    let requestId: string;
    const cryptoValue: unknown = Reflect.get(globalThis, 'crypto');
    if (this.input.createRequestId !== undefined) {
      requestId = this.input.createRequestId();
    } else if (isRandomUUIDProvider(cryptoValue)) {
      requestId = cryptoValue.randomUUID();
    } else {
      this.#requestSequence += 1;
      requestId = `${this.#exerciseSessionId}:${String(this.#requestSequence)}`;
    }
    if (requestId.trim().length === 0 || requestId.length > 256 || used.has(requestId)) {
      throw new Error('Snapshot request IDは空でないboundedな一意値が必要です');
    }
    used.add(requestId);
    return requestId;
  }

  /** pass Exerciseのfilesだけを新しいpassing snapshot mapへ追加する。 */
  #nextPassingSnapshots(
    batch: readonly WorkspaceValidationItem[],
    execution: ExecutionInput,
  ): ExerciseDraft['lastPassingSnapshots'] {
    const next: Record<string, ExerciseDraft['lastPassingSnapshots'][string]> =
      clonePassingSnapshots(this.#lastPassingSnapshots);
    for (const { exercise: item, result } of batch) {
      if (result.status !== 'pass') continue;
      next[item.id] = {
        editRevision: execution.revision,
        contentRevision: this.input.contentRevision,
        files: { ...execution.files },
        evaluatedAt: result.evaluatedAt,
      };
    }
    return next;
  }

  /** 未commit候補を現在stateのclean Draftで置換し、元の失敗を保持する。 */
  async #rollbackValidationCandidate(error: unknown, restoreSaveError = false): Promise<never> {
    this.#autosave.schedule(this.#draft());
    try {
      await this.#autosave.flush();
    } catch (rollbackError: unknown) {
      throw new AggregateError([error, rollbackError], 'Validation candidate rollback failed', {
        cause: rollbackError,
      });
    }
    if (restoreSaveError) this.#dispatch({ type: 'save.changed', status: 'error' });
    throw error;
  }

  /** Interaction境界が返したidentityをactive frame要求と完全一致で検証する。 */
  #assertInteractionIdentity(
    result: InteractionResult,
    execution: ExecutionInput,
    frameGeneration: number,
    requestId: string,
  ): void {
    if (
      result.exerciseSessionId !== execution.exerciseSessionId ||
      result.executionRevision !== execution.revision ||
      result.frameGeneration !== frameGeneration ||
      result.requestId !== requestId
    ) {
      throw new Error('Interaction result identityが要求と一致しません');
    }
  }

  /** Interaction Snapshotのsession・revision・viewportをpollごとに再検証する。 */
  #assertInteractionSnapshotIdentity(
    snapshot: PreviewSnapshot,
    execution: ExecutionInput,
    viewport: PreviewViewport,
  ): void {
    if (
      snapshot.exerciseSessionId !== execution.exerciseSessionId ||
      snapshot.executionRevision !== execution.revision ||
      snapshot.viewport.id !== viewport.id ||
      snapshot.viewport.width !== viewport.width ||
      snapshot.viewport.height !== viewport.height
    ) {
      throw new Error('Interaction Snapshot identityが要求と一致しません');
    }
  }

  /** 期待値が揃うまで即時観測から始め、50ms以下の間隔で最大750msだけ再観測する。 */
  async #pollInteractionCheckpoint(
    execution: ExecutionInput,
    viewport: PreviewViewport,
    policy: SnapshotPolicy,
    checkpoint: JavaScriptInteractionCheckpoint,
    consoleRecords: readonly RunnerConsoleRecord[],
    usedRequestIds: Set<string>,
  ): Promise<InteractionCheckpointResult['expectations']> {
    const deadline = Date.now() + INTERACTION_POLL_TIMEOUT_MS;
    for (;;) {
      this.#assertFresh(execution);
      const requestId = this.#nextRequestId(usedRequestIds);
      const snapshot = await this.input.runner.requestSnapshot({
        exerciseSessionId: execution.exerciseSessionId,
        executionRevision: execution.revision,
        requestId,
        policy,
        preserveTimers: true,
      });
      this.#assertFresh(execution);
      this.#assertInteractionSnapshotIdentity(snapshot, execution, viewport);
      const expectations = evaluateInteractionCheckpoint(checkpoint, snapshot, consoleRecords);
      if (expectations.every(({ passed }) => passed) || Date.now() >= deadline) {
        return expectations;
      }
      const remaining = deadline - Date.now();
      await new Promise<void>((resolve) => {
        setTimeout(resolve, Math.min(INTERACTION_POLL_INTERVAL_MS, Math.max(0, remaining)));
      });
      this.#assertFresh(execution);
    }
  }

  /** 1 Scenarioをfresh frameへ再描画し、action順とcheckpoint位置を保持して実行する。 */
  async #runInteractionScenario(
    execution: ExecutionInput,
    viewport: PreviewViewport,
    policy: SnapshotPolicy,
    scenario: JavaScriptInteractionScenario,
    usedRequestIds: Set<string>,
  ): Promise<InteractionCheckpointResult[]> {
    const interact = this.input.runner.interact?.bind(this.input.runner);
    if (interact === undefined) throw new Error('RunnerがInteractionに対応していません');
    const rendered = await this.#render(execution, viewport, false);
    if (rendered.diagnostics.some(({ severity }) => severity === 'error')) {
      throw new Error('Interaction ScenarioのPreviewを準備できませんでした');
    }
    const frameGeneration = rendered.frameGeneration;
    if (
      frameGeneration === undefined ||
      !Number.isSafeInteger(frameGeneration) ||
      frameGeneration < 0
    ) {
      throw new Error('Runnerが有効なframe generationを返しませんでした');
    }
    const results: InteractionCheckpointResult[] = [];
    for (const action of scenario.actions) {
      this.#assertFresh(execution);
      const requestId = this.#nextRequestId(usedRequestIds);
      const interaction = await interact({
        exerciseSessionId: execution.exerciseSessionId,
        executionRevision: execution.revision,
        frameGeneration,
        requestId,
        action,
      });
      this.#assertFresh(execution);
      this.#assertInteractionIdentity(interaction, execution, frameGeneration, requestId);
      for (const checkpoint of scenario.checkpoints) {
        if (checkpoint.afterActionId !== action.id) continue;
        const expectations = await this.#pollInteractionCheckpoint(
          execution,
          viewport,
          policy,
          checkpoint,
          interaction.console,
          usedRequestIds,
        );
        results.push({
          exerciseSessionId: execution.exerciseSessionId,
          executionRevision: execution.revision,
          frameGeneration,
          viewportId: viewport.id,
          scenarioId: scenario.id,
          checkpointId: checkpoint.id,
          afterActionId: action.id,
          expectations,
        });
      }
    }
    return results;
  }

  /** 同revisionの全viewport Snapshotを集め、判定結果を保存成功後にcommitする。 */
  async #validate(execution: ExecutionInput): Promise<ValidationResult> {
    this.#assertFresh(execution);
    await this.#autosave.flush();
    this.#assertFresh(execution);
    const plan = createValidationPlan(this.input.exercise, this.input.validationExercises);
    const policy = extendSnapshotPolicyForInteractions(
      this.input.validator.buildSnapshotPolicy(
        plan.exercises.flatMap(({ validationRules }) => validationRules),
      ),
      plan.exercises,
    );
    const diagnostics: RunnerDiagnostic[] = [];
    let evidence: readonly RunnerEvidence[] | undefined;
    let renderConsole: readonly RunnerConsoleRecord[] | undefined;
    const snapshots: Record<string, PreviewSnapshot> = {};
    const interactionResults: InteractionResultsByExercise = Object.fromEntries(
      plan.exercises.map(({ id }) => [id, {}]),
    );
    const usedRequestIds = new Set<string>();
    for (const viewport of plan.viewports) {
      const rendered = await this.#render(execution, viewport, false);
      diagnostics.push(...rendered.diagnostics);
      if (evidence === undefined) {
        evidence = rendered.evidence;
      } else if (!runnerEvidenceEqual(evidence, rendered.evidence)) {
        throw new Error('Runner evidenceがViewport間で一致しません');
      }
      if (renderConsole === undefined) {
        renderConsole = rendered.console;
      } else if (!runnerConsoleEqual(renderConsole, rendered.console)) {
        throw new Error('Runner ConsoleがViewport間で一致しません');
      }
      if (rendered.diagnostics.some(({ severity }) => severity === 'error')) continue;
      const requestId = this.#nextRequestId(usedRequestIds);
      const currentSnapshot = await this.input.runner.requestSnapshot({
        exerciseSessionId: execution.exerciseSessionId,
        executionRevision: execution.revision,
        requestId,
        policy,
      });
      this.#assertFresh(execution);
      snapshots[viewport.id] = currentSnapshot;
      for (const item of plan.exercises) {
        const scenarios = item.interactionScenarios ?? [];
        if (scenarios.length === 0) continue;
        const viewportResults: InteractionCheckpointResult[] = [];
        for (const scenario of scenarios) {
          viewportResults.push(
            ...(await this.#runInteractionScenario(
              execution,
              viewport,
              policy,
              scenario,
              usedRequestIds,
            )),
          );
        }
        interactionResults[item.id]![viewport.id] = viewportResults;
      }
    }

    const batch: WorkspaceValidationItem[] = [];
    for (const item of plan.exercises) {
      const result = await this.input.validator.validate({
        exerciseId: item.id,
        rules: item.validationRules,
        ...(item.runtime === undefined ? {} : { runtime: item.runtime }),
        files: execution.files,
        snapshots,
        diagnostics,
        evidence: evidence ?? [],
        console: renderConsole ?? [],
        interactionScenarios: item.interactionScenarios ?? [],
        interactionCheckpoints: interactionResults[item.id] ?? {},
        now: this.input.now(),
      });
      this.#assertFresh(execution);
      batch.push({ exercise: item, result });
    }
    const result = mergeWorkspaceValidationResults(
      this.input.exercise.id,
      execution.revision,
      batch,
      this.input.now(),
    );
    const nextPassingSnapshots = this.#nextPassingSnapshots(batch, execution);
    const candidateState = learningSessionReducer(this.#state, {
      type: 'validation.completed',
      revision: execution.revision,
      result,
    });
    const validationDraft = this.#draft(candidateState, nextPassingSnapshots);
    this.#autosave.schedule(validationDraft);
    try {
      await this.#autosave.flush();
    } catch (error: unknown) {
      return this.#rollbackValidationCandidate(error, true);
    }
    try {
      this.#assertFresh(execution);
    } catch (error: unknown) {
      return this.#rollbackValidationCandidate(error);
    }

    let committedState = candidateState;
    const displayViewport = this.input.exercise.previewViewports[0];
    if (displayViewport !== undefined) {
      let displayResult: RunnerRenderResult;
      try {
        displayResult = await this.#render(execution, displayViewport, false);
      } catch (error: unknown) {
        return this.#rollbackValidationCandidate(error);
      }
      if (evidence !== undefined && !runnerEvidenceEqual(evidence, displayResult.evidence)) {
        return this.#rollbackValidationCandidate(
          new Error('Runner evidenceが表示Previewの再描画と一致しません'),
        );
      }
      if (
        renderConsole !== undefined &&
        !runnerConsoleEqual(renderConsole, displayResult.console)
      ) {
        return this.#rollbackValidationCandidate(
          new Error('Runner Consoleが表示Previewの再描画と一致しません'),
        );
      }
      committedState = learningSessionReducer(committedState, {
        type: 'preview.completed',
        revision: execution.revision,
        diagnostics: displayResult.diagnostics,
        console: displayResult.console,
      });
    }
    this.#assertFresh(execution);
    this.#lastValidationBatch = batch;
    this.#lastPassingSnapshots = nextPassingSnapshots;
    this.#lastValidationDraft = validationDraft;
    this.#replaceState({ ...committedState, saveStatus: this.#state.saveStatus });
    return result;
  }

  /** debounceを取消し、保存・multi-viewport判定・履歴保存を1 Runner queueで行う。 */
  async validateNow(): Promise<ValidationResult> {
    this.#clearPreviewTimer();
    const execution = this.#captureExecution();
    return this.#enqueue(() => this.#measure('validation', () => this.#validate(execution)));
  }

  /** pending/active autosaveを明示的に最後まで待つ。 */
  async flush(): Promise<void> {
    if (this.#disposePromise !== undefined) return this.#disposePromise;
    return this.#autosave.flush();
  }

  /** 既存Runner操作と最新保存を待ち、Runnerを一度だけ解放する。 */
  async dispose(): Promise<void> {
    if (this.#disposePromise !== undefined) return this.#disposePromise;
    this.#disposeRequested = true;
    this.#clearPreviewTimer();
    this.#disposePromise = (async () => {
      await this.#operationTail;
      const errors: unknown[] = [];
      try {
        await this.#autosave.flush();
      } catch (error: unknown) {
        errors.push(error);
      } finally {
        this.#autosave.dispose();
      }
      try {
        await this.input.runner.dispose();
      } catch (error: unknown) {
        errors.push(error);
      } finally {
        this.#listeners.clear();
      }
      if (errors.length === 1) throw errors[0];
      if (errors.length > 1) throw new AggregateError(errors, 'LearningSession dispose failed');
    })();
    return this.#disposePromise;
  }
}
