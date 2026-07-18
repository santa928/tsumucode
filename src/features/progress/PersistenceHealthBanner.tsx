import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type {
  PersistenceConflictResolution,
  PersistenceFailureKind,
  PersistenceHealthSnapshot,
  PersistenceRetryResult,
} from '../../core/persistence/ResilientProgressService';
import { StackedCard } from '../../design-system/components/StackedCard';
import { learningRuntimeServices } from '../learning/runtimeServices';
import { downloadProgressJson } from './progressDownload';

export interface PersistenceHealthBannerPort {
  readonly getHealthSnapshot: () => PersistenceHealthSnapshot;
  readonly subscribeHealth: (listener: () => void) => () => void;
  retryPersistence(): Promise<PersistenceRetryResult>;
  resolvePersistenceConflict(resolution: PersistenceConflictResolution): Promise<void>;
  exportAll(): Promise<string>;
}

interface PersistenceHealthBannerProps {
  readonly port?: PersistenceHealthBannerPort;
  readonly download?: (json: string) => void;
}

const FAILURE_MESSAGE: Record<PersistenceFailureKind, string> = {
  open: '端末の保存領域を開けませんでした。',
  read: '端末の保存内容を読み直せませんでした。',
  quota: '端末の保存容量が不足している可能性があります。',
  write: '端末の保存領域へ書き込めませんでした。',
  transaction: '端末保存の一括更新を完了できませんでした。',
};

const DEFAULT_PORT: PersistenceHealthBannerPort = {
  getHealthSnapshot: learningRuntimeServices.progressService.getHealthSnapshot,
  subscribeHealth: learningRuntimeServices.progressService.subscribeHealth,
  retryPersistence: () => learningRuntimeServices.retryPersistence(),
  resolvePersistenceConflict: (resolution) =>
    learningRuntimeServices.resolvePersistenceConflict(resolution),
  exportAll: () => learningRuntimeServices.transferService.exportAll(),
};

/** 保存不能・復旧中・競合を閉じられない常設Bannerとして表示する。 */
export function PersistenceHealthBanner({
  port = DEFAULT_PORT,
  download = downloadProgressJson,
}: PersistenceHealthBannerProps) {
  const health = useSyncExternalStore(
    port.subscribeHealth,
    port.getHealthSnapshot,
    port.getHealthSnapshot,
  );
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const activeRef = useRef(true);
  const recoveryBusyRef = useRef(false);
  const exportBusyRef = useRef(false);
  const recoveryGenerationRef = useRef(0);
  const exportGenerationRef = useRef(0);

  useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
      recoveryGenerationRef.current += 1;
      exportGenerationRef.current += 1;
    };
  }, []);

  /** 再試行と競合解決だけをsingle-flight化し、緊急Exportをブロックしない。 */
  async function runRecovery(
    operation: () => Promise<string | undefined>,
    failure: string,
  ): Promise<void> {
    if (recoveryBusyRef.current) return;
    recoveryBusyRef.current = true;
    const generation = ++recoveryGenerationRef.current;
    setRecoveryBusy(true);
    setMessage(undefined);
    try {
      const next = await operation();
      if (activeRef.current && generation === recoveryGenerationRef.current) setMessage(next);
    } catch {
      if (activeRef.current && generation === recoveryGenerationRef.current) setMessage(failure);
    } finally {
      if (activeRef.current && generation === recoveryGenerationRef.current) {
        recoveryBusyRef.current = false;
        setRecoveryBusy(false);
      } else if (!activeRef.current) {
        recoveryBusyRef.current = false;
      }
    }
  }

  /** memory緊急Exportを復旧と独立single-flight化し、hang中も救済導線を保つ。 */
  async function runExport(
    operation: () => Promise<string | undefined>,
    failure: string,
  ): Promise<void> {
    if (exportBusyRef.current) return;
    exportBusyRef.current = true;
    const generation = ++exportGenerationRef.current;
    setExportBusy(true);
    setMessage(undefined);
    try {
      const next = await operation();
      if (activeRef.current && generation === exportGenerationRef.current) setMessage(next);
    } catch {
      if (activeRef.current && generation === exportGenerationRef.current) setMessage(failure);
    } finally {
      if (activeRef.current && generation === exportGenerationRef.current) {
        exportBusyRef.current = false;
        setExportBusy(false);
      } else if (!activeRef.current) {
        exportBusyRef.current = false;
      }
    }
  }

  if (health.kind === 'initializing' || health.kind === 'healthy') return null;

  const role = health.kind === 'retrying' ? 'status' : 'alert';
  const title =
    health.kind === 'conflict'
      ? '端末データの保存先が競合しています'
      : health.kind === 'retrying'
        ? '端末保存へ再接続しています'
        : 'この端末へ保存できていません';
  const detail =
    health.kind === 'conflict'
      ? '端末側と救済中データの両方を保持しています。内容を確認して、残す側を選んでください。'
      : health.kind === 'retrying'
        ? '再接続とデータの安全確認が終わるまでお待ちください。'
        : `${health.cause === undefined ? '保存処理を完了できませんでした。' : FAILURE_MESSAGE[health.cause]} ${
            health.hasUnsavedChanges
              ? '最新の学習内容は一時的にmemoryへ救済しています。'
              : '学習を始める前に再試行してください。'
          }`;

  return (
    <StackedCard
      as="section"
      role={role}
      aria-labelledby="persistence-health-title"
      aria-busy={recoveryBusy || exportBusy || health.kind === 'retrying'}
      className={`tc-content-frame mx-auto mt-4 w-full max-w-[var(--tc-content-max)] border-2 bg-workshop-raised ${
        health.kind === 'retrying' ? 'border-workshop-complete' : 'border-workshop-correction'
      }`}
    >
      <h2
        id="persistence-health-title"
        className={`text-lg font-black ${
          health.kind === 'retrying' ? 'text-workshop-complete' : 'text-workshop-correction'
        }`}
      >
        {title}
      </h2>
      <p className="mt-2">{detail}</p>
      <div className="mt-3 flex flex-wrap gap-3">
        {health.kind === 'memory-only' ? (
          <button
            type="button"
            disabled={recoveryBusy}
            onClick={() => {
              void runRecovery(async () => {
                const result = await port.retryPersistence();
                return result.kind === 'conflict'
                  ? '端末側の変更を検出しました。残すデータを選んでください。'
                  : '端末保存へ復旧しました。';
              }, '端末保存へ再接続できませんでした。救済中データは保持しています。');
            }}
            className="inline-flex min-h-11 items-center rounded-workshop-md bg-workshop-primary px-4 py-2 font-bold text-workshop-on-primary disabled:opacity-60"
          >
            端末保存を再試行する
          </button>
        ) : null}
        {health.kind === 'conflict' ? (
          <>
            <button
              type="button"
              disabled={recoveryBusy}
              onClick={() => {
                void runRecovery(async () => {
                  await port.resolvePersistenceConflict('keep-device');
                  return '端末側のデータを維持しました。';
                }, '端末側のデータを確定できませんでした。両方のデータを保持しています。');
              }}
              className="inline-flex min-h-11 items-center rounded-workshop-md border-2 border-workshop-primary px-4 py-2 font-bold disabled:opacity-60"
            >
              端末側を維持
            </button>
            <button
              type="button"
              disabled={recoveryBusy}
              onClick={() => {
                void runRecovery(async () => {
                  await port.resolvePersistenceConflict('use-memory');
                  return '救済中データを端末へ反映しました。';
                }, '救済中データを反映できませんでした。両方のデータを保持しています。');
              }}
              className="inline-flex min-h-11 items-center rounded-workshop-md bg-workshop-primary px-4 py-2 font-bold text-workshop-on-primary disabled:opacity-60"
            >
              救済中データを反映
            </button>
          </>
        ) : null}
        <button
          type="button"
          disabled={exportBusy}
          onClick={() => {
            void runExport(async () => {
              download(await port.exportAll());
              return '救済中データを書き出しました。';
            }, '救済中データの書き出しを完了できませんでした。もう一度お試しください。');
          }}
          className="inline-flex min-h-11 items-center rounded-workshop-md border-2 border-workshop-complete px-4 py-2 font-bold disabled:opacity-60"
        >
          救済中データを書き出す
        </button>
      </div>
      {message !== undefined ? (
        <p aria-live="polite" className="mt-3 font-bold">
          {message}
        </p>
      ) : null}
    </StackedCard>
  );
}
