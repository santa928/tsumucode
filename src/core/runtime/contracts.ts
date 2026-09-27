/// <reference lib="dom" />

/** 学習コードの実行とプレビュー取得を隔離する Runtime 公開契約。 */
import type { JavaScriptInteractionAction, PreviewViewport } from '../content/types';

export type { PreviewViewport } from '../content/types';

export type RunnerLanguageId = 'html-css' | (string & {});
export type RunnerDiagnosticKind = 'syntax' | 'reference' | 'security' | 'unsupported' | 'system';
export type RunnerDiagnosticSeverity = 'warning' | 'error';

export interface RunnerDiagnostic {
  readonly code: string;
  readonly kind: RunnerDiagnosticKind;
  readonly severity: RunnerDiagnosticSeverity;
  readonly message: string;
  readonly learnerMessage: string;
  readonly file?: string;
  readonly line?: number;
  readonly column?: number;
}

export interface ResolvedPreviewAsset {
  readonly id: string;
  readonly mediaType: 'image' | 'font' | 'other';
  readonly url: string;
}

export interface SnapshotPolicy {
  readonly selectors: readonly string[];
  readonly attributes: readonly string[];
  readonly computedStyles: readonly string[];
  readonly focusVisibleSelectors: readonly string[];
  readonly focusVisibleComputedStyles: readonly string[];
  readonly includeAllElements: boolean;
}

export interface RunnerInput {
  readonly exerciseSessionId: string;
  readonly executionRevision: number;
  readonly languageId: RunnerLanguageId;
  readonly files: Readonly<Record<string, string>>;
  readonly assets: readonly ResolvedPreviewAsset[];
  readonly viewport: PreviewViewport;
  readonly options: Readonly<Record<string, unknown>>;
}

export type RunnerEvidenceValue = string | number | boolean;

/** 同じsession／revisionの実行事実をValidatorへ渡すbounded scalar証拠。 */
export interface RunnerEvidence {
  readonly id: string;
  readonly file?: string;
  readonly value: RunnerEvidenceValue;
}

export type RunnerConsoleLevel = 'log' | 'info' | 'warn' | 'error';

/** Runnerが親画面へ返すplain text限定のConsole 1件。 */
export interface RunnerConsoleRecord {
  readonly sequence: number;
  readonly level: RunnerConsoleLevel;
  readonly text: string;
}

/** 現在のframeへ1件だけ適用する認証対象Interaction要求。 */
export interface InteractionRequest {
  readonly exerciseSessionId: string;
  readonly executionRevision: number;
  readonly frameGeneration: number;
  readonly requestId: string;
  readonly action: JavaScriptInteractionAction;
}

/** Interaction後の同一性と非永続Consoleを返すbounded結果。 */
export interface InteractionResult {
  readonly exerciseSessionId: string;
  readonly executionRevision: number;
  readonly frameGeneration: number;
  readonly requestId: string;
  readonly console: readonly RunnerConsoleRecord[];
}

/** Contentのexpectation 1件を観測事実へ評価した結果。 */
export interface InteractionExpectationResult {
  readonly expectationId: string;
  readonly passed: boolean;
  readonly actual: string;
}

/** viewport内のScenario checkpointを同一実行へ結びつけた検証入力。 */
export interface InteractionCheckpointResult {
  readonly exerciseSessionId: string;
  readonly executionRevision: number;
  readonly frameGeneration: number;
  readonly viewportId: string;
  readonly scenarioId: string;
  readonly checkpointId: string;
  readonly afterActionId: string;
  readonly expectations: readonly InteractionExpectationResult[];
}

export interface RunnerRenderResult {
  readonly exerciseSessionId: string;
  readonly executionRevision: number;
  /** Interaction対応Runnerだけが成功したactive frameのgenerationを返す。 */
  readonly frameGeneration?: number;
  readonly diagnostics: readonly RunnerDiagnostic[];
  readonly evidence: readonly RunnerEvidence[];
  readonly console: readonly RunnerConsoleRecord[];
}

export interface SnapshotRequest {
  readonly exerciseSessionId: string;
  readonly executionRevision: number;
  readonly requestId: string;
  readonly policy: SnapshotPolicy;
  /** Interaction polling中だけtrueにし、観測前にlearner timerを停止しない。 */
  readonly preserveTimers?: boolean;
}

export interface PreviewRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface PreviewOverflow {
  readonly x: boolean;
  readonly y: boolean;
  readonly scrollWidth: number;
  readonly scrollHeight: number;
  readonly clientWidth: number;
  readonly clientHeight: number;
}

export interface PreviewNode {
  readonly nodeId: number;
  readonly parentId: number | null;
  readonly documentOrder: number;
  readonly tagName: string;
  readonly matchedSelectors: readonly string[];
  readonly attributes: Readonly<Record<string, string>>;
  readonly text: string;
  readonly computedStyles: Readonly<Record<string, string>>;
  readonly focusVisibleComputedStyles: Readonly<Record<string, string>>;
  readonly rect: PreviewRect;
  readonly overflow: PreviewOverflow;
  readonly focusable: boolean;
  /** 実activeElementまたは認証済みFocus actionの対象と一致するか。 */
  readonly focused: boolean;
  readonly accessibleName: string;
  readonly role: string;
}

export interface PreviewSnapshot {
  readonly exerciseSessionId: string;
  readonly executionRevision: number;
  readonly viewport: PreviewViewport;
  readonly nodes: readonly PreviewNode[];
  readonly documentOverflow: PreviewOverflow;
}

/** 既存Browser実装の移行用契約。利用側はExecutionServiceと任意のdom portを使う。 */
export interface RunnerAdapter {
  readonly languageId: RunnerLanguageId;
  /** 隔離プレビュー用 frame を初期化する。render より前に呼び、frame の設定と監視登録を副作用として行う。 */
  prepare(frame: HTMLIFrameElement): Promise<void>;
  /** prepare 済み frame に同じ languageId の入力を描画し、プレビュー DOM の更新を副作用として行う。 */
  render(input: RunnerInput): Promise<RunnerRenderResult>;
  /** 対応Runnerだけが現在の同一frameへbounded Interactionを1件適用する。 */
  interact?(request: InteractionRequest): Promise<InteractionResult>;
  /** 描画済みの同一 session・revision を前提に DOM を観測し、学習コードを変更せず snapshot を返す。 */
  requestSnapshot(request: SnapshotRequest): Promise<PreviewSnapshot>;
  /** 旧実行を中断しframe・通信・実行資源を解放する。解析器など再利用資源は残し、次回はprepareを行う。 */
  stop(): Promise<void>;
  /** 解析器を含む全資源を最終破棄する。以後の再利用は契約外とし、新しいRunnerを生成する。 */
  dispose(): Promise<void>;
}

/** 言語と独立した実行先。能力は現在利用するconsole／DOMに限定する。 */
export interface ExecutionEnvironment {
  readonly backend: 'browser' | 'local';
  readonly engine: 'browser-html-css' | 'browser-js' | 'node';
  readonly mode: 'console' | 'dom';
  readonly capabilities: readonly ('console' | 'dom')[];
}

export interface RunIdentity {
  readonly runId: string;
  readonly exerciseSessionId: string;
  readonly executionRevision: number;
  readonly backend: ExecutionEnvironment['backend'];
  readonly engine: ExecutionEnvironment['engine'];
}

/** console実行にはframe、viewport、snapshotを要求しない。 */
export interface ExecutionRequest extends RunIdentity {
  readonly languageId: RunnerLanguageId;
  readonly files: Readonly<Record<string, string>>;
  readonly options: Readonly<Record<string, unknown>>;
  readonly requiredCapabilities: ExecutionEnvironment['capabilities'];
  readonly presentation?: {
    readonly assets: readonly ResolvedPreviewAsset[];
    readonly viewport: PreviewViewport;
  };
}

export type ExecutionStatus =
  'succeeded' | 'code-error' | 'unsupported' | 'stopped' | 'system-error';

/** 実行終了の事実。教材の合否は含めずValidatorが別に判定する。 */
export interface ExecutionResult extends RunnerRenderResult, RunIdentity {
  readonly status: ExecutionStatus;
}

export interface DomObservationPort {
  prepare(frame: HTMLIFrameElement): Promise<void>;
  requestSnapshot(request: SnapshotRequest): Promise<PreviewSnapshot>;
  interact?(request: InteractionRequest): Promise<InteractionResult>;
}

/** DOMを持たない実行Adapterも実装可能な最小port。 */
export interface ExecutionService {
  readonly languageId: RunnerLanguageId;
  readonly environment: ExecutionEnvironment;
  readonly dom?: DomObservationPort;
  execute(request: ExecutionRequest): Promise<ExecutionResult>;
  /** 旧実行を失効させ、次のexecuteで再利用可能な状態へ戻す。 */
  stop(): Promise<void>;
  /** 全資源を最終破棄し、以後のexecuteを拒否する。 */
  dispose(): Promise<void>;
}

/** 完了済みコードを静的Previewへ描画するための最小port。 */
export interface ReadOnlyPreviewAdapter {
  readonly languageId: RunnerLanguageId;
  /** opaque-origin frameを静的表示専用に初期化する。 */
  prepare(frame: HTMLIFrameElement): Promise<void>;
  /** 学習コードを安全な静的出力へ変換して描画する。 */
  render(input: RunnerInput): Promise<void>;
  /** in-flight処理とframeが保有する資源を解放する。 */
  dispose(): Promise<void>;
}
