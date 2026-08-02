import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ChangeEvent,
} from 'react';
import { Link, useLocation } from 'react-router';
import type { PersistenceHealthSnapshot } from '../../core/persistence/ResilientProgressService';
import {
  CURRENT_PROGRESS_SCHEMA_VERSION,
  type ProgressBackup,
  type RepositorySnapshot,
} from '../../core/persistence/contracts';
import type { ImportPreview } from '../../core/persistence/transferService';
import { StackedCard } from '../../design-system/components/StackedCard';
import { learningRuntimeServices } from '../learning/runtimeServices';
import { downloadProgressJson } from './progressDownload';

export interface ProgressTransferPort {
  exportAll(): Promise<string>;
  prepareImport(raw: string): Promise<ImportPreview>;
  applyImport(previewId: string): Promise<void>;
  discardImport(previewId: string): boolean;
}

export interface ProgressRepositoryPort {
  snapshot(): Promise<RepositorySnapshot>;
  replaceSnapshotWithBackup(
    snapshot: RepositorySnapshot,
    reason: ProgressBackup['reason'],
  ): Promise<ProgressBackup>;
}

export interface ProgressHealthStore {
  readonly getHealthSnapshot: () => PersistenceHealthSnapshot;
  readonly subscribeHealth: (listener: () => void) => () => void;
}

export interface StorageManagerPort {
  persist?(): Promise<boolean>;
  estimate?(): Promise<{ readonly usage?: number; readonly quota?: number }>;
}

interface ProgressTransferPanelProps {
  readonly transfer?: ProgressTransferPort;
  readonly repository?: ProgressRepositoryPort;
  readonly progressHealth?: ProgressHealthStore;
  readonly prepareTransferCatalog?: () => Promise<void>;
  readonly ready?: Promise<void>;
  readonly onChanged?: () => void;
  readonly download?: (json: string) => void;
  readonly storageManager?: StorageManagerPort | null;
}

const MAX_IMPORT_BYTES = 10 * 1024 * 1024;
const DIFFERENCE_LABEL = { add: '追加', replace: '置き換え', remove: '削除' } as const;
const RESET_ENTITY_LABEL = {
  course: 'コース',
  chapter: 'チャプター',
  lesson: 'レッスン',
  exercise: '演習',
  slide: 'スライド',
  hint: 'ヒント',
  rule: '判定ルール',
  checklist: 'チェック項目',
  viewport: '表示幅',
  workspace: '作業スペース',
} as const;
const EMPTY_SNAPSHOT: RepositorySnapshot = {
  schemaVersion: CURRENT_PROGRESS_SCHEMA_VERSION,
  courses: {},
  drafts: {},
  quarantined: [],
};

/** navigator.storageへのaccess自体が拒否されても非対応として継続する。 */
function browserStorageManager(): StorageManagerPort | null {
  try {
    const storage: unknown = Reflect.get(navigator, 'storage');
    return typeof storage === 'object' && storage !== null ? storage : null;
  } catch {
    return null;
  }
}

/** 容量値を利用者向けのおおよそのKiB／MiBへ変換する。 */
function formatBytes(value: number): string {
  if (value >= 1024 * 1024) {
    return `約${Math.round(value / (1024 * 1024)).toString()} MiB`;
  }
  return `約${Math.max(1, Math.round(value / 1024)).toString()} KiB`;
}

/** persist結果と部分的estimateを、機能欠落も含めた安全な説明へ変換する。 */
function storageResultMessage(
  persisted: boolean | undefined,
  estimate: { readonly usage?: number; readonly quota?: number } | undefined,
): string {
  const protection =
    persisted === true
      ? '端末保存の保護を有効にできました。'
      : persisted === false
        ? '端末保存の保護は有効になりませんでした。書き出しを併用してください。'
        : 'このブラウザでは保存保護の切り替えに対応していません。';
  const usage = estimate?.usage;
  const quota = estimate?.quota;
  if (usage !== undefined && quota !== undefined) {
    return `${protection} ${formatBytes(usage)}を使用中（保存容量の目安 ${formatBytes(quota)}）。`;
  }
  if (usage !== undefined) return `${protection} ${formatBytes(usage)}を使用しています。`;
  if (quota !== undefined) return `${protection} 保存容量の目安は${formatBytes(quota)}です。`;
  return `${protection} 使用量の目安は取得できませんでした。`;
}

/** 全Course Export、検証済みImport、backup-first削除を端末の道具箱として提供する。 */
export function ProgressTransferPanel({
  transfer = learningRuntimeServices.transferService,
  repository = learningRuntimeServices.repository,
  progressHealth = learningRuntimeServices.progressService,
  prepareTransferCatalog,
  ready = learningRuntimeServices.ready,
  onChanged = () => {
    window.location.reload();
  },
  download = downloadProgressJson,
  storageManager = browserStorageManager(),
}: ProgressTransferPanelProps) {
  const prepareCatalog =
    prepareTransferCatalog ?? (() => learningRuntimeServices.prepareTransferCatalog());
  const location = useLocation();
  const health = useSyncExternalStore(
    progressHealth.subscribeHealth,
    progressHealth.getHealthSnapshot,
    progressHealth.getHealthSnapshot,
  );
  const [snapshot, setSnapshot] = useState<RepositorySnapshot>();
  const [preview, setPreview] = useState<ImportPreview>();
  const [busy, setBusy] = useState<{
    readonly name: string;
    readonly owner: { readonly transfer: ProgressTransferPort };
  }>();
  const [status, setStatus] = useState<string>();
  const [error, setError] = useState<string>();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const activeRef = useRef(true);
  const generationRef = useRef(0);
  const busyRef = useRef(false);
  const previewRef = useRef<ImportPreview | undefined>(undefined);
  const operationOwner = useMemo(() => ({ transfer }), [transfer]);

  useEffect(() => {
    activeRef.current = true;
    busyRef.current = false;
    return () => {
      activeRef.current = false;
      generationRef.current += 1;
      const prepared = previewRef.current;
      if (prepared !== undefined) transfer.discardImport(prepared.id);
      previewRef.current = undefined;
    };
  }, [transfer]);

  useEffect(() => {
    let active = true;
    void ready
      .then(() => repository.snapshot())
      .then((value) => {
        if (active) setSnapshot(value);
      })
      .catch(() => {
        if (active) setError('端末データの一覧を読み込めませんでした。書き出しは利用できます。');
      });
    return () => {
      active = false;
    };
  }, [ready, repository]);

  useEffect(() => {
    if (new URLSearchParams(location.search).get('focus') === 'device-data') {
      headingRef.current?.focus();
    }
  }, [location.search]);

  /** 非同期操作の完了結果が現在mount中の世代へ属するか判定する。 */
  function isCurrentGeneration(generation: number): boolean {
    return activeRef.current && generation === generationRef.current;
  }

  /** 操作の二重実行を防ぎ、unmount後のstate更新を抑止する。 */
  async function run(
    name: string,
    operation: (generation: number) => Promise<void>,
    failureMessage: string,
  ): Promise<void> {
    if (busyRef.current) return;
    busyRef.current = true;
    const generation = ++generationRef.current;
    setBusy({ name, owner: operationOwner });
    setError(undefined);
    try {
      await operation(generation);
    } catch {
      if (isCurrentGeneration(generation)) setError(failureMessage);
    } finally {
      if (isCurrentGeneration(generation)) {
        busyRef.current = false;
        setBusy(undefined);
      } else if (!activeRef.current) {
        busyRef.current = false;
      }
    }
  }

  /** File選択を10MiBで制限し、Catalog登録後のpreviewだけを現在値にする。 */
  function handleFileChange(event: ChangeEvent<HTMLInputElement>): void {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = '';
    if (file === undefined) return;
    if (file.size > MAX_IMPORT_BYTES) {
      setError('進捗Bundleは10MiB以下のJSONを選んでください。元のデータは変更していません。');
      return;
    }
    const previous = previewRef.current;
    if (previous !== undefined) {
      transfer.discardImport(previous.id);
      previewRef.current = undefined;
      setPreview(undefined);
    }
    void run(
      'import-prepare',
      async (generation) => {
        await prepareCatalog();
        const prepared = await transfer.prepareImport(await file.text());
        if (!activeRef.current || generation !== generationRef.current) {
          transfer.discardImport(prepared.id);
          return;
        }
        previewRef.current = prepared;
        setPreview(prepared);
        setStatus('差分と初期化対象を確認してください。まだ端末データは変更していません。');
      },
      '読み込み準備を完了できませんでした。Bundleと教材の版を確認してください。元のデータは保持されています。',
    );
  }

  /** 現在previewをTransfer Serviceからも明示破棄する。 */
  function cancelPreview(): void {
    const current = previewRef.current;
    if (current !== undefined) transfer.discardImport(current.id);
    previewRef.current = undefined;
    setPreview(undefined);
    setStatus('読み込みを取り消しました。端末データは変更していません。');
  }

  const controlsDisabled = busy !== undefined && busy.owner === operationOwner;
  const mutationDisabled = controlsDisabled || health.kind !== 'healthy';

  return (
    <StackedCard
      as="section"
      aria-labelledby="device-data-title"
      aria-busy={controlsDisabled}
      className="mt-10 bg-workshop-raised"
    >
      <p className="text-sm font-bold text-workshop-complete">端末データの道具箱</p>
      <h2
        ref={headingRef}
        id="device-data-title"
        tabIndex={-1}
        className="mt-1 text-2xl font-black"
      >
        この端末の学習データ
      </h2>
      <p className="mt-3 text-workshop-muted">
        ログインはありません。進捗と下書きはこのブラウザの端末領域へ保存されます。
      </p>
      <p className="mt-3 border-l-4 border-workshop-learning pl-4 font-bold">
        公開URLが変わる前に必ず書き出してください。OwnerやCustom
        DomainなどでOriginが変わると、端末データは自動移行できません。
      </p>

      {snapshot !== undefined && Object.keys(snapshot.courses).length > 0 ? (
        <div className="mt-6">
          <h3 className="text-lg font-black">学習のつづき</h3>
          <ul className="mt-2 space-y-2">
            {Object.values(snapshot.courses).map((course) => {
              const completed = Object.values(course.lessons).filter(
                ({ currentComplete }) => currentComplete,
              ).length;
              return (
                <li key={course.courseId}>
                  <Link className="font-bold underline" to={`/courses/${course.courseId}`}>
                    {course.courseId}のコースマップから続ける
                  </Link>{' '}
                  <span className="text-workshop-muted">（{completed}レッスン完了）</span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          disabled={controlsDisabled}
          onClick={() => {
            void run(
              'export',
              async (generation) => {
                const exported = await transfer.exportAll();
                if (!isCurrentGeneration(generation)) return;
                download(exported);
                if (!isCurrentGeneration(generation)) return;
                setStatus('全コースの進捗と下書きを書き出しました。');
              },
              '書き出しを完了できませんでした。少し待ってからもう一度お試しください。',
            );
          }}
          className="inline-flex min-h-11 items-center rounded-workshop-md bg-workshop-primary px-4 py-2 font-bold text-workshop-on-primary disabled:opacity-60"
        >
          全コースの進捗を書き出す
        </button>
        <label className="inline-flex min-h-11 cursor-pointer items-center rounded-workshop-md border-2 border-workshop-primary px-4 py-2 font-bold focus-within:outline-[var(--tc-focus-width)] focus-within:outline-offset-[var(--tc-focus-offset)] focus-within:outline-[var(--tc-color-focus)] has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60">
          進捗Bundleを選ぶ
          <input
            type="file"
            accept="application/json,.json"
            disabled={mutationDisabled}
            onChange={handleFileChange}
            className="sr-only"
          />
        </label>
      </div>
      {health.kind !== 'healthy' ? (
        <p className="mt-2 text-sm font-bold text-workshop-correction">
          {health.kind === 'initializing'
            ? '端末の保存状態を確認しています。確認後に読み込みと削除を利用できます。'
            : '保存状態を復旧するまで、読み込みと削除は利用できません。書き出しは利用できます。'}
        </p>
      ) : null}

      {preview !== undefined ? (
        <section
          role="region"
          aria-label="読み込み差分"
          className="mt-6 rounded-workshop-md border-2 border-workshop-learning bg-workshop-surface p-4"
        >
          <h3 className="text-lg font-black">読み込み前の差分確認</h3>
          <p className="mt-2">書き出し日時：{preview.exportedAt}</p>
          {preview.differences.length === 0 ? (
            <p className="mt-2">進捗の差分はありません。</p>
          ) : (
            <ul className="mt-2 list-disc pl-5">
              {preview.differences.map((difference) => (
                <li key={difference.courseId}>
                  {difference.courseId}：{DIFFERENCE_LABEL[difference.kind]}・
                  {difference.completedLessons}レッスン完了・更新 {difference.updatedAt}
                </li>
              ))}
            </ul>
          )}
          {preview.resetNotices.length > 0 ? (
            <div className="mt-4">
              <h4 className="font-black">教材更新で初期化する項目</h4>
              <ul className="mt-2 list-disc pl-5">
                {preview.resetNotices.map((notice) => (
                  <li key={notice.id}>
                    {notice.courseId}・{RESET_ENTITY_LABEL[notice.entity]}「{notice.sourceId}」：
                    {notice.reason}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={mutationDisabled}
              onClick={() => {
                void run(
                  'import-apply',
                  async (generation) => {
                    await transfer.applyImport(preview.id);
                    if (!isCurrentGeneration(generation)) return;
                    previewRef.current = undefined;
                    setPreview(undefined);
                    setStatus('読み込みが完了しました。');
                    onChanged();
                  },
                  '読み込みを完了できませんでした。backupから元のデータを保持しています。',
                );
              }}
              className="inline-flex min-h-11 items-center rounded-workshop-md bg-workshop-primary px-4 py-2 font-bold text-workshop-on-primary disabled:opacity-60"
            >
              この内容を読み込む
            </button>
            <button
              type="button"
              disabled={controlsDisabled}
              onClick={cancelPreview}
              className="inline-flex min-h-11 items-center rounded-workshop-md border border-workshop-border px-4 py-2 font-bold disabled:opacity-60"
            >
              取り消す
            </button>
          </div>
        </section>
      ) : null}

      <div className="mt-7 border-t border-workshop-border pt-6">
        <h3 className="text-lg font-black">保存を長持ちさせる</h3>
        <p className="mt-2 text-workshop-muted">
          対応ブラウザでは、この端末の保存保護と使用容量の目安を確認できます。
        </p>
        <button
          type="button"
          disabled={controlsDisabled}
          onClick={() => {
            void run(
              'storage',
              async (generation) => {
                if (
                  storageManager === null ||
                  (storageManager.persist === undefined && storageManager.estimate === undefined)
                ) {
                  if (isCurrentGeneration(generation)) {
                    setStatus(
                      'このブラウザでは保存保護の確認に対応していません。学習と書き出しは利用できます。',
                    );
                  }
                  return;
                }
                try {
                  const persisted = await storageManager.persist?.();
                  if (!isCurrentGeneration(generation)) return;
                  const estimate = await storageManager.estimate?.();
                  if (isCurrentGeneration(generation)) {
                    setStatus(storageResultMessage(persisted, estimate));
                  }
                } catch {
                  if (isCurrentGeneration(generation)) {
                    setStatus(
                      '端末保存の保護状態を確認できませんでした。学習と書き出しはそのまま利用できます。',
                    );
                  }
                }
              },
              '端末保存の保護状態を確認できませんでした。学習と書き出しはそのまま利用できます。',
            );
          }}
          className="mt-3 inline-flex min-h-11 items-center rounded-workshop-md border-2 border-workshop-primary px-4 py-2 font-bold disabled:opacity-60"
        >
          端末保存を安定させる
        </button>
      </div>

      <div className="mt-7 border-t border-workshop-border pt-6">
        {!confirmDelete ? (
          <button
            type="button"
            disabled={mutationDisabled}
            onClick={() => {
              setConfirmDelete(true);
            }}
            className="inline-flex min-h-11 items-center rounded-workshop-md border-2 border-workshop-correction px-4 py-2 font-bold text-workshop-correction disabled:opacity-60"
          >
            この端末の学習データを削除
          </button>
        ) : (
          <div role="alert" className="rounded-workshop-md border-2 border-workshop-correction p-4">
            <p className="font-bold">
              進捗と下書きを削除します。復元できるよう、先に書き出すことをおすすめします。
            </p>
            <div className="mt-3 flex flex-wrap gap-3">
              <button
                type="button"
                disabled={mutationDisabled}
                onClick={() => {
                  void run(
                    'delete',
                    async (generation) => {
                      await repository.replaceSnapshotWithBackup(EMPTY_SNAPSHOT, 'manual');
                      if (!isCurrentGeneration(generation)) return;
                      setSnapshot(EMPTY_SNAPSHOT);
                      setConfirmDelete(false);
                      setStatus('端末データを削除しました。');
                      onChanged();
                    },
                    '削除を完了できませんでした。元のデータは保持されています。',
                  );
                }}
                className="inline-flex min-h-11 items-center rounded-workshop-md bg-workshop-correction px-4 py-2 font-bold text-workshop-on-primary disabled:opacity-60"
              >
                削除を確定する
              </button>
              <button
                type="button"
                disabled={controlsDisabled}
                onClick={() => {
                  setConfirmDelete(false);
                }}
                className="inline-flex min-h-11 items-center rounded-workshop-md border border-workshop-border px-4 py-2 font-bold disabled:opacity-60"
              >
                削除しない
              </button>
            </div>
          </div>
        )}
      </div>

      {status !== undefined ? (
        <p role="status" aria-live="polite" className="mt-5 font-bold text-workshop-complete">
          {status}
        </p>
      ) : null}
      {error !== undefined ? (
        <p role="alert" className="mt-5 font-bold text-workshop-correction">
          {error}
        </p>
      ) : null}
    </StackedCard>
  );
}
