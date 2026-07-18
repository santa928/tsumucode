/** 全 Course の学習進捗と編集中 draft を永続化する Persistence 公開契約。 */
import type { ValidationResult } from '../validation/contracts';

export const CURRENT_PROGRESS_SCHEMA_VERSION = 2 as const;

export interface EditorCursor {
  readonly anchor: number;
  readonly head: number;
}

export interface ExerciseDraft {
  readonly courseId: string;
  readonly lessonId: string;
  readonly exerciseId: string;
  readonly workspaceId: string;
  readonly contentRevision: string;
  readonly editRevision: number;
  readonly files: Readonly<Record<string, string>>;
  readonly selectedFile: string;
  readonly cursors: Readonly<Record<string, EditorCursor>>;
  readonly validationHistory: readonly ValidationResult[];
  readonly revealedHintIds: readonly string[];
  readonly reviewSlideId?: string;
  readonly reviewScrollOffset?: number;
  readonly lastPassingSnapshots: Readonly<
    Record<
      string,
      {
        readonly editRevision: number;
        readonly contentRevision: string;
        readonly files: Readonly<Record<string, string>>;
        readonly evaluatedAt: string;
      }
    >
  >;
  readonly updatedAt: string;
}

export interface LessonProgress {
  readonly lessonId: string;
  readonly viewedSlideIds: readonly string[];
  readonly currentSlideId?: string;
  readonly passedExerciseIds: readonly string[];
  readonly passedChecklistItemIds: readonly string[];
  readonly passedRuleIds: readonly string[];
  readonly passedViewportIds: readonly string[];
  readonly currentComplete: boolean;
  readonly firstCompletedAt?: string;
}

export interface CourseProgress {
  readonly courseId: string;
  readonly contentRevision: string;
  readonly lessons: Readonly<Record<string, LessonProgress>>;
  readonly currentLessonId?: string;
  readonly currentChapterId?: string;
  readonly currentComplete: boolean;
  readonly firstCompletedAt?: string;
  readonly updatedAt: string;
}

/** IndexedDB正本から読んだCourse進捗とcanonical CAS version。 */
export interface VersionedCourseProgress {
  readonly progress?: CourseProgress;
  readonly version: number;
}

/** workspace leaseの永続writeを許可する、全field検証対象のproof。 */
export interface WorkspaceLeaseProof {
  readonly courseId: string;
  readonly workspaceId: string;
  readonly ownerId: string;
  readonly token: string;
  readonly dataEpoch: number;
  readonly expiresAt: number;
}

/** IndexedDB CASによるclaim結果。acquired時だけproofが書き込み権限を表す。 */
export type WorkspaceLeaseClaimResult =
  | { readonly acquired: true; readonly proof: WorkspaceLeaseProof }
  | {
      readonly acquired: false;
      readonly owner?: WorkspaceLeaseProof;
      readonly reason?: 'data-epoch-mismatch';
    };

/** 期限切れ・token不一致・epoch変更を永続障害から分離する公開Error。 */
export class LeaseFenceRejectedError extends Error {
  constructor() {
    super('workspace lease proofが失効しているため保存を拒否しました');
    this.name = 'LeaseFenceRejectedError';
  }
}

/** 同一Courseの別workspace更新を再読込・再計算へ送る公開CAS Error。 */
export class CourseProgressVersionConflictError extends Error {
  constructor() {
    super('CourseProgressのcanonical versionが更新されています');
    this.name = 'CourseProgressVersionConflictError';
  }
}

export interface RepositorySnapshot {
  readonly schemaVersion: number;
  readonly courses: Readonly<Record<string, CourseProgress>>;
  readonly drafts: Readonly<Record<string, ExerciseDraft>>;
  readonly quarantined: readonly QuarantinedProgress[];
}

export interface ProgressBundle extends RepositorySnapshot {
  readonly appVersion: string;
  readonly exportedAt: string;
  readonly integrity: {
    readonly algorithm: 'SHA-256';
    readonly digest: string;
  };
}

export interface ProgressBackup {
  readonly id: string;
  readonly reason: 'before-import' | 'manual' | 'recovery';
  readonly createdAt: string;
  readonly snapshot: RepositorySnapshot;
}

export interface QuarantinedProgress {
  readonly id: string;
  readonly reason: string;
  readonly quarantinedAt: string;
  readonly raw: unknown;
}

export interface ProgressMigration {
  readonly from: number;
  readonly to: number;
  /** from schema の入力を to schema の完全な snapshot へ変換し、入力値自体は変更しない。 */
  migrate(input: unknown): RepositorySnapshot;
}

export interface ProgressRepository {
  /** 永続ストアを初期化して接続資源を確保する。他の repository 操作より前に呼ぶ。 */
  open(): Promise<void>;
  /** open 済みストアから courseId の進捗を読み取り、永続状態は変更しない。 */
  getCourse(courseId: string): Promise<CourseProgress | undefined>;
  /** Courseの永続CAS versionを進捗と同じtransaction snapshotで読む。 */
  getCourseVersioned(courseId: string): Promise<VersionedCourseProgress>;
  /** open 済みストアへ courseId 単位で進捗を保存し、同じ courseId の値を更新する。 */
  putCourse(progress: CourseProgress): Promise<void>;
  /** Course versionをCASして進捗を保存し、成功後のversionを返す。 */
  putCourseVersioned(progress: CourseProgress, expectedVersion: number): Promise<number>;
  /** open 済みストアから courseId・workspaceId の draft を読み取り、永続状態は変更しない。 */
  getDraft(courseId: string, workspaceId: string): Promise<ExerciseDraft | undefined>;
  /** open 済みストアへ courseId・workspaceId 単位で draft を保存し、同じ組の値を更新する。 */
  putDraft(draft: ExerciseDraft): Promise<void>;
  /** workspace lease proofをDraftと同じtransactionで検査して保存する。 */
  putDraftFenced(draft: ExerciseDraft, proof: WorkspaceLeaseProof): Promise<void>;
  /** 対応する draft と course 進捗を同一トランザクションで保存し、片方だけの更新を残さない。 */
  putDraftAndCourse(draft: ExerciseDraft, progress: CourseProgress): Promise<void>;
  /** lease proofとCourse versionを同じtransactionでCASしてDraft・Courseを保存する。 */
  putDraftAndCourseFenced(
    draft: ExerciseDraft,
    progress: CourseProgress,
    proof: WorkspaceLeaseProof,
    expectedCourseVersion: number,
  ): Promise<number>;
  /** open 済みストアの全 course・draft・隔離データを一貫した snapshot として読み取り、状態は変更しない。 */
  snapshot(): Promise<RepositorySnapshot>;
  /** open 済みストアの全 course・draft・隔離データを受領 snapshot で一括置換し、部分更新を残さない。 */
  replaceSnapshot(snapshot: RepositorySnapshot): Promise<void>;
  /** backup作成・全置換・data epoch増分を一つのexclusive transactionで実行する。 */
  replaceSnapshotWithBackup(
    snapshot: RepositorySnapshot,
    reason: ProgressBackup['reason'],
  ): Promise<ProgressBackup>;
  /** open 済みストア全体の snapshot を指定理由の backup として永続化し、backup record を追加する。 */
  createBackup(reason: ProgressBackup['reason']): Promise<ProgressBackup>;
  /** 存在する backupId を前提に、その snapshot で全 course・draft・隔離データを一括復元する。 */
  restoreBackup(backupId: string): Promise<void>;
  /** open 済みストアの隔離領域へ record を保存し、通常の course・draft データには反映しない。 */
  quarantine(record: QuarantinedProgress): Promise<void>;
  /** IndexedDB正本へ期限付きworkspace ownerをCASし、勝者だけproofを受け取る。 */
  tryClaimWorkspaceLease(
    candidate: Omit<WorkspaceLeaseProof, 'dataEpoch'> & { readonly dataEpoch?: number },
  ): Promise<WorkspaceLeaseClaimResult>;
  /** 現在のworkspace ownerを読み、通知順に依存しない再検証へ使う。 */
  readWorkspaceLease(
    courseId: string,
    workspaceId: string,
  ): Promise<WorkspaceLeaseProof | undefined>;
  /** proof全fieldをCASし、期限内のownerだけlease期限を延長する。 */
  heartbeatWorkspaceLease(
    proof: WorkspaceLeaseProof,
    expiresAt: number,
  ): Promise<WorkspaceLeaseProof>;
  /** proof全fieldをCASし、永続削除に成功したownerだけtrueを返す。 */
  releaseWorkspaceLease(proof: WorkspaceLeaseProof): Promise<boolean>;
  /** open で確保した接続と関連資源を解放する。以後の操作には open の再実行を前提とする。 */
  close(): void;
}
