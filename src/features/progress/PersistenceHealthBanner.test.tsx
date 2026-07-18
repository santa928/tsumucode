import { act, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type {
  PersistenceConflictResolution,
  PersistenceHealthSnapshot,
  PersistenceRetryResult,
} from '../../core/persistence/ResilientProgressService';
import { renderWithRouter } from '../../test/renderWithRouter';
import {
  PersistenceHealthBanner,
  type PersistenceHealthBannerPort,
} from './PersistenceHealthBanner';

/** 復旧とExportの完了順をtestから制御する。 */
function deferred<Value>(): {
  readonly promise: Promise<Value>;
  readonly resolve: (value: Value | PromiseLike<Value>) => void;
} {
  let resolve!: (value: Value | PromiseLike<Value>) => void;
  const promise = new Promise<Value>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}

/** 任意healthをpublishできるBanner portを作る。 */
function createPort(initial: PersistenceHealthSnapshot) {
  let health = initial;
  const listeners = new Set<() => void>();
  const port = {
    getHealthSnapshot: () => health,
    subscribeHealth: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    retryPersistence: vi.fn(async (): Promise<PersistenceRetryResult> => ({ kind: 'recovered' })),
    resolvePersistenceConflict: vi.fn(async (resolution: PersistenceConflictResolution) => {
      void resolution;
    }),
    exportAll: vi.fn(async () => '{}'),
  } satisfies PersistenceHealthBannerPort;
  return {
    port,
    publish: (next: PersistenceHealthSnapshot) => {
      health = next;
      for (const listener of listeners) listener();
    },
  };
}

describe('PersistenceHealthBanner', () => {
  it('initializingとhealthyなら表示せず、memory-onlyは閉じられないalertと安全な原因を表示する', () => {
    const initializing = createPort({ kind: 'initializing', hasUnsavedChanges: false });
    const initializingView = renderWithRouter(<PersistenceHealthBanner port={initializing.port} />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    initializingView.unmount();

    const healthy = createPort({ kind: 'healthy', hasUnsavedChanges: false });
    const { rerender } = renderWithRouter(<PersistenceHealthBanner port={healthy.port} />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    const degraded = createPort({ kind: 'memory-only', cause: 'quota', hasUnsavedChanges: true });
    rerender(<PersistenceHealthBanner port={degraded.port} />);

    expect(screen.getByRole('alert')).toHaveTextContent('保存容量');
    expect(screen.queryByRole('button', { name: /閉じる/u })).not.toBeInTheDocument();
  });

  it('retryingはstatusで伝え、再試行をsingle-flightにする', async () => {
    const retry = new Promise<PersistenceRetryResult>(() => undefined);
    const fake = createPort({ kind: 'memory-only', cause: 'open', hasUnsavedChanges: false });
    fake.port.retryPersistence.mockReturnValue(retry);
    const { user } = renderWithRouter(<PersistenceHealthBanner port={fake.port} />);

    await user.dblClick(screen.getByRole('button', { name: '端末保存を再試行する' }));

    expect(fake.port.retryPersistence).toHaveBeenCalledOnce();
    act(() => {
      fake.publish({ kind: 'retrying', cause: 'open', hasUnsavedChanges: false });
    });
    expect(screen.getByRole('status')).toHaveTextContent('再接続');
  });

  it('retryが完了しなくても緊急Exportは独立single-flightで実行できる', async () => {
    const retry = new Promise<PersistenceRetryResult>(() => undefined);
    const exporting = deferred<string>();
    const fake = createPort({ kind: 'memory-only', cause: 'open', hasUnsavedChanges: true });
    fake.port.retryPersistence.mockReturnValue(retry);
    fake.port.exportAll.mockReturnValue(exporting.promise);
    const download = vi.fn();
    const { user } = renderWithRouter(
      <PersistenceHealthBanner port={fake.port} download={download} />,
    );

    await user.click(screen.getByRole('button', { name: '端末保存を再試行する' }));
    act(() => {
      fake.publish({ kind: 'retrying', cause: 'open', hasUnsavedChanges: true });
    });
    const exportButton = screen.getByRole('button', { name: '救済中データを書き出す' });
    expect(exportButton).toBeEnabled();

    await user.dblClick(exportButton);
    expect(fake.port.exportAll).toHaveBeenCalledOnce();
    expect(exportButton).toBeDisabled();
    exporting.resolve('{"rescued":true}');

    await waitFor(() => {
      expect(download).toHaveBeenCalledWith('{"rescued":true}');
    });
    expect(exportButton).toBeEnabled();
    expect(screen.getByText('救済中データを書き出しました。')).toBeInTheDocument();
  });

  it('memory込み緊急Exportを提供し、内部Errorは表示しない', async () => {
    const fake = createPort({ kind: 'memory-only', cause: 'write', hasUnsavedChanges: true });
    fake.port.exportAll.mockRejectedValue(new Error('secret database path'));
    const download = vi.fn();
    const { user } = renderWithRouter(
      <PersistenceHealthBanner port={fake.port} download={download} />,
    );

    await user.click(screen.getByRole('button', { name: '救済中データを書き出す' }));

    expect(fake.port.exportAll).toHaveBeenCalledOnce();
    expect(download).not.toHaveBeenCalled();
    expect(await screen.findByText(/書き出しを完了できませんでした/u)).toBeInTheDocument();
    expect(screen.queryByText(/secret database path/u)).not.toBeInTheDocument();
  });

  it('conflictは両方の明示解決を提供し、選択した操作だけを呼ぶ', async () => {
    const fake = createPort({ kind: 'conflict', hasUnsavedChanges: true });
    const { user } = renderWithRouter(<PersistenceHealthBanner port={fake.port} />);

    expect(screen.getByRole('alert')).toHaveTextContent('競合');
    await user.click(screen.getByRole('button', { name: '端末側を維持' }));
    await waitFor(() => {
      expect(fake.port.resolvePersistenceConflict).toHaveBeenCalledWith('keep-device');
    });
    await user.click(screen.getByRole('button', { name: '救済中データを反映' }));
    await waitFor(() => {
      expect(fake.port.resolvePersistenceConflict).toHaveBeenCalledWith('use-memory');
    });
  });
});
