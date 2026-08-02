import { act, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { PersistenceHealthSnapshot } from '../../core/persistence/ResilientProgressService';
import type { RepositorySnapshot } from '../../core/persistence/contracts';
import { renderWithRouter } from '../../test/renderWithRouter';
import {
  ProgressTransferPanel,
  type ProgressHealthStore,
  type ProgressTransferPort,
} from './ProgressTransferPanel';

const EMPTY_SNAPSHOT: RepositorySnapshot = {
  schemaVersion: 2,
  courses: {},
  drafts: {},
  quarantined: [],
};

interface Deferred<Value> {
  readonly promise: Promise<Value>;
  readonly resolve: (value: Value) => void;
  readonly reject: (reason: unknown) => void;
}

/** 非同期完了をTestから制御するPromiseを作る。 */
function deferred<Value>(): Deferred<Value> {
  let resolve!: (value: Value) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<Value>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

/** health購読をComponent Testから更新できるStoreを作る。 */
function createHealthStore(
  initial: PersistenceHealthSnapshot = {
    kind: 'healthy',
    hasUnsavedChanges: false,
  },
) {
  let snapshot = initial;
  const listeners = new Set<() => void>();
  return {
    store: {
      getHealthSnapshot: () => snapshot,
      subscribeHealth: (listener: () => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    } satisfies ProgressHealthStore,
    publish: (next: PersistenceHealthSnapshot) => {
      snapshot = next;
      for (const listener of listeners) listener();
    },
  };
}

/** Transfer Panelの既定注入値をTest doubleとして作る。 */
function createPorts() {
  const transfer = {
    exportAll: vi.fn(async () => '{}'),
    prepareImport: vi.fn(
      async (): Promise<Awaited<ReturnType<ProgressTransferPort['prepareImport']>>> => ({
        id: 'preview-1',
        exportedAt: '2026-07-10T00:00:00.000Z',
        differences: [
          {
            courseId: 'html-css',
            kind: 'replace' as const,
            completedLessons: 3,
            updatedAt: '2026-07-09T12:00:00.000Z',
          },
        ],
        resetNotices: [
          {
            id: 'reset-1',
            courseId: 'html-css',
            entity: 'exercise' as const,
            sourceId: 'old-exercise',
            reason: '教材更新で旧演習を初期化',
          },
        ],
      }),
    ),
    applyImport: vi.fn(async () => undefined),
    discardImport: vi.fn(() => true),
  } satisfies ProgressTransferPort;
  const repository = {
    snapshot: vi.fn(async () => EMPTY_SNAPSHOT),
    replaceSnapshotWithBackup: vi.fn(async () => ({
      id: 'backup-1',
      reason: 'manual' as const,
      createdAt: '2026-07-10T00:00:00.000Z',
      snapshot: EMPTY_SNAPSHOT,
    })),
  };
  return { transfer, repository };
}

describe('ProgressTransferPanel', () => {
  it('Catalog検証後にImport差分とreset理由を見せ、明示確認までmutationしない', async () => {
    const { transfer, repository } = createPorts();
    const prepareTransferCatalog = vi.fn(async () => undefined);
    const onChanged = vi.fn();
    const health = createHealthStore();
    const { user } = renderWithRouter(
      <ProgressTransferPanel
        transfer={transfer}
        repository={repository}
        progressHealth={health.store}
        prepareTransferCatalog={prepareTransferCatalog}
        ready={Promise.resolve()}
        onChanged={onChanged}
      />,
    );

    await user.upload(
      screen.getByLabelText('進捗Bundleを選ぶ'),
      new File(['{}'], 'progress.json', { type: 'application/json' }),
    );

    expect(await screen.findByText(/html-css：置き換え/u)).toBeInTheDocument();
    expect(screen.getByText(/教材更新で旧演習を初期化/u)).toBeInTheDocument();
    expect(prepareTransferCatalog).toHaveBeenCalledOnce();
    expect(prepareTransferCatalog.mock.invocationCallOrder[0]).toBeLessThan(
      transfer.prepareImport.mock.invocationCallOrder[0]!,
    );
    expect(transfer.applyImport).not.toHaveBeenCalled();
    expect(repository.replaceSnapshotWithBackup).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'この内容を読み込む' }));
    await waitFor(() => {
      expect(transfer.applyImport).toHaveBeenCalledWith('preview-1');
    });
    expect(onChanged).toHaveBeenCalledOnce();
  });

  it('取り消しと次のFile選択でprepared previewを破棄し、同じFileも再選択できる', async () => {
    const { transfer, repository } = createPorts();
    const health = createHealthStore();
    const { user } = renderWithRouter(
      <ProgressTransferPanel
        transfer={transfer}
        repository={repository}
        progressHealth={health.store}
        prepareTransferCatalog={() => Promise.resolve()}
        ready={Promise.resolve()}
      />,
    );
    const input = screen.getByLabelText('進捗Bundleを選ぶ');
    const file = new File(['{}'], 'same.json', { type: 'application/json' });

    await user.upload(input, file);
    expect(await screen.findByRole('region', { name: '読み込み差分' })).toBeInTheDocument();
    expect(input).toHaveValue('');
    await user.click(screen.getByRole('button', { name: '取り消す' }));
    expect(transfer.discardImport).toHaveBeenCalledWith('preview-1');

    await user.upload(input, file);
    await waitFor(() => {
      expect(transfer.prepareImport).toHaveBeenCalledTimes(2);
    });
  });

  it('10MiB超のFileを読まず、安全な説明を表示する', async () => {
    const { transfer, repository } = createPorts();
    const health = createHealthStore();
    const { user } = renderWithRouter(
      <ProgressTransferPanel
        transfer={transfer}
        repository={repository}
        progressHealth={health.store}
        prepareTransferCatalog={() => Promise.resolve()}
        ready={Promise.resolve()}
      />,
    );
    const oversized = new File(['x'], 'large.json', { type: 'application/json' });
    Object.defineProperty(oversized, 'size', { value: 10 * 1024 * 1024 + 1 });

    await user.upload(screen.getByLabelText('進捗Bundleを選ぶ'), oversized);

    expect(await screen.findByRole('alert')).toHaveTextContent('10MiB以下');
    expect(transfer.prepareImport).not.toHaveBeenCalled();
  });

  it('保存障害中もmemory込みExportを有効にし、Importと削除は無効にする', async () => {
    const { transfer, repository } = createPorts();
    const health = createHealthStore({
      kind: 'memory-only',
      cause: 'quota',
      hasUnsavedChanges: true,
    });
    const download = vi.fn();
    const { user } = renderWithRouter(
      <ProgressTransferPanel
        transfer={transfer}
        repository={repository}
        progressHealth={health.store}
        prepareTransferCatalog={() => Promise.resolve()}
        ready={Promise.resolve()}
        download={download}
      />,
    );

    const exportButton = screen.getByRole('button', { name: '全コースの進捗を書き出す' });
    expect(exportButton).toBeEnabled();
    expect(screen.getByLabelText('進捗Bundleを選ぶ')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'この端末の学習データを削除' })).toBeDisabled();

    await user.click(exportButton);
    await waitFor(() => {
      expect(download).toHaveBeenCalledWith('{}');
    });

    act(() => {
      health.publish({ kind: 'healthy', hasUnsavedChanges: false });
    });
    expect(screen.getByLabelText('進捗Bundleを選ぶ')).toBeEnabled();
  });

  it('Snapshotから学習の続きLinkを表示し、backup作成後だけ空Snapshotへ置換する', async () => {
    const { transfer, repository } = createPorts();
    repository.snapshot.mockResolvedValue({
      ...EMPTY_SNAPSHOT,
      courses: {
        'html-css': {
          courseId: 'html-css',
          contentRevision: '2026-07-10.1',
          lessons: {},
          currentLessonId: 'lesson-first-heading',
          currentComplete: false,
          updatedAt: '2026-07-10T00:00:00.000Z',
        },
      },
    });
    const health = createHealthStore();
    const onChanged = vi.fn();
    const { user } = renderWithRouter(
      <ProgressTransferPanel
        transfer={transfer}
        repository={repository}
        progressHealth={health.store}
        prepareTransferCatalog={() => Promise.resolve()}
        ready={Promise.resolve()}
        onChanged={onChanged}
      />,
    );

    expect(
      await screen.findByRole('link', { name: 'html-cssのコースマップから続ける' }),
    ).toHaveAttribute('href', '/courses/html-css');
    await user.click(screen.getByRole('button', { name: 'この端末の学習データを削除' }));
    expect(screen.getByRole('alert')).toHaveTextContent('先に書き出す');
    expect(repository.replaceSnapshotWithBackup).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: '削除を確定する' }));
    await waitFor(() => {
      expect(repository.replaceSnapshotWithBackup).toHaveBeenCalledWith(EMPTY_SNAPSHOT, 'manual');
    });
    expect(onChanged).toHaveBeenCalledOnce();
  });

  it('?focus=device-dataで端末データheadingへfocusする', async () => {
    const { transfer, repository } = createPorts();
    const health = createHealthStore();
    renderWithRouter(
      <ProgressTransferPanel
        transfer={transfer}
        repository={repository}
        progressHealth={health.store}
        prepareTransferCatalog={() => Promise.resolve()}
        ready={Promise.resolve()}
      />,
      { route: '/?focus=device-data' },
    );

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'この端末の学習データ' })).toHaveFocus(),
    );
  });

  it.each([
    { label: '非対応', storageManager: null, expected: ['対応していません'] },
    {
      label: '拒否',
      storageManager: {
        persist: vi.fn(async () => false),
        estimate: vi.fn(async () => ({ usage: 1024, quota: 4096 })),
      },
      expected: ['有効になりませんでした', '保存容量の目安'],
    },
    {
      label: '許可と部分値',
      storageManager: {
        persist: vi.fn(async () => true),
        estimate: vi.fn(async () => ({ usage: 2048 })),
      },
      expected: ['約2 KiBを使用'],
    },
    {
      label: '例外',
      storageManager: {
        persist: vi.fn(async () => {
          throw new Error('secret storage detail');
        }),
        estimate: vi.fn(async () => ({})),
      },
      expected: ['確認できませんでした'],
    },
  ])('Storage APIの$labelを安全な利用者説明へ変換する', async ({ storageManager, expected }) => {
    const { transfer, repository } = createPorts();
    const health = createHealthStore();
    const { user } = renderWithRouter(
      <ProgressTransferPanel
        transfer={transfer}
        repository={repository}
        progressHealth={health.store}
        prepareTransferCatalog={() => Promise.resolve()}
        ready={Promise.resolve()}
        storageManager={storageManager}
      />,
    );

    await user.click(screen.getByRole('button', { name: '端末保存を安定させる' }));

    const status = await screen.findByRole('status');
    for (const text of expected) expect(status).toHaveTextContent(text);
    expect(screen.queryByText(/secret storage detail/u)).not.toBeInTheDocument();
    const originNote = screen.getByText(/公開URLが変わる前/u);
    expect(originNote).toHaveTextContent('OwnerやCustom DomainなどでOriginが変わると');
    expect(originNote).not.toHaveTextContent('Repository名');
  });

  it('unmount後に完了したImport準備を破棄し、状態更新を行わない', async () => {
    const pending = deferred<Awaited<ReturnType<ProgressTransferPort['prepareImport']>>>();
    const { transfer, repository } = createPorts();
    transfer.prepareImport.mockReturnValueOnce(pending.promise);
    const health = createHealthStore();
    const { user, unmount } = renderWithRouter(
      <ProgressTransferPanel
        transfer={transfer}
        repository={repository}
        progressHealth={health.store}
        prepareTransferCatalog={() => Promise.resolve()}
        ready={Promise.resolve()}
      />,
    );
    await user.upload(
      screen.getByLabelText('進捗Bundleを選ぶ'),
      new File(['{}'], 'progress.json', { type: 'application/json' }),
    );

    unmount();
    pending.resolve({
      id: 'late-preview',
      exportedAt: '2026-07-10T00:00:00.000Z',
      differences: [],
      resetNotices: [],
    });

    await waitFor(() => {
      expect(transfer.discardImport).toHaveBeenCalledWith('late-preview');
    });
  });

  it('unmount後にExportが完了してもdownloadしない', async () => {
    const pending = deferred<string>();
    const { transfer, repository } = createPorts();
    transfer.exportAll.mockReturnValueOnce(pending.promise);
    const download = vi.fn();
    const health = createHealthStore();
    const { user, unmount } = renderWithRouter(
      <ProgressTransferPanel
        transfer={transfer}
        repository={repository}
        progressHealth={health.store}
        prepareTransferCatalog={() => Promise.resolve()}
        ready={Promise.resolve()}
        download={download}
      />,
    );

    await user.click(screen.getByRole('button', { name: '全コースの進捗を書き出す' }));
    expect(transfer.exportAll).toHaveBeenCalledOnce();
    unmount();
    await act(async () => {
      pending.resolve('{"late":true}');
      await pending.promise;
    });

    expect(download).not.toHaveBeenCalled();
  });

  it('unmount後にImport適用が完了してもstate通知を行わない', async () => {
    const pending = deferred<undefined>();
    const { transfer, repository } = createPorts();
    transfer.applyImport.mockReturnValueOnce(pending.promise);
    const onChanged = vi.fn();
    const health = createHealthStore();
    const { user, unmount } = renderWithRouter(
      <ProgressTransferPanel
        transfer={transfer}
        repository={repository}
        progressHealth={health.store}
        prepareTransferCatalog={() => Promise.resolve()}
        ready={Promise.resolve()}
        onChanged={onChanged}
      />,
    );
    await user.upload(
      screen.getByLabelText('進捗Bundleを選ぶ'),
      new File(['{}'], 'progress.json', { type: 'application/json' }),
    );
    await user.click(await screen.findByRole('button', { name: 'この内容を読み込む' }));
    expect(transfer.applyImport).toHaveBeenCalledWith('preview-1');

    unmount();
    await act(async () => {
      pending.resolve(undefined);
      await pending.promise;
    });

    expect(onChanged).not.toHaveBeenCalled();
  });

  it.each([
    { phase: 'persist', settlement: 'resolve' },
    { phase: 'persist', settlement: 'reject' },
    { phase: 'estimate', settlement: 'resolve' },
    { phase: 'estimate', settlement: 'reject' },
  ] as const)(
    '古い世代のStorage $phaseが$settlementしてもstatusを更新せず次の操作を妨げない',
    async ({ phase, settlement }) => {
      const pendingPersist = deferred<boolean>();
      const pendingEstimate = deferred<{ readonly usage?: number; readonly quota?: number }>();
      const { transfer, repository } = createPorts();
      const replacementTransfer = { ...transfer } satisfies ProgressTransferPort;
      const storageManager = {
        persist: vi.fn(() =>
          phase === 'persist' ? pendingPersist.promise : Promise.resolve(true),
        ),
        estimate: vi.fn(() =>
          phase === 'estimate'
            ? pendingEstimate.promise
            : Promise.resolve({ usage: 1024, quota: 4096 }),
        ),
      };
      const health = createHealthStore();
      const rendered = renderWithRouter(
        <ProgressTransferPanel
          transfer={transfer}
          repository={repository}
          progressHealth={health.store}
          prepareTransferCatalog={() => Promise.resolve()}
          ready={Promise.resolve()}
          storageManager={storageManager}
        />,
      );

      await rendered.user.click(screen.getByRole('button', { name: '端末保存を安定させる' }));
      expect(storageManager.persist).toHaveBeenCalledOnce();
      if (phase === 'estimate') {
        await waitFor(() => {
          expect(storageManager.estimate).toHaveBeenCalledOnce();
        });
      }
      rendered.rerender(
        <MemoryRouter>
          <ProgressTransferPanel
            transfer={replacementTransfer}
            repository={repository}
            progressHealth={health.store}
            prepareTransferCatalog={() => Promise.resolve()}
            ready={Promise.resolve()}
            storageManager={storageManager}
          />
        </MemoryRouter>,
      );

      await act(async () => {
        if (phase === 'persist') {
          if (settlement === 'resolve') pendingPersist.resolve(true);
          else pendingPersist.reject(new Error('late storage failure'));
          await pendingPersist.promise.catch(() => undefined);
        } else {
          if (settlement === 'resolve') {
            pendingEstimate.resolve({ usage: 1024, quota: 4096 });
          } else {
            pendingEstimate.reject(new Error('late storage failure'));
          }
          await pendingEstimate.promise.catch(() => undefined);
        }
      });

      if (phase === 'persist') expect(storageManager.estimate).not.toHaveBeenCalled();
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: '全コースの進捗を書き出す' })).toBeEnabled();
    },
  );

  it('unmount後も開始済みの削除mutationを完遂し、state通知だけを行わない', async () => {
    const { transfer, repository } = createPorts();
    const pending = deferred<Awaited<ReturnType<typeof repository.replaceSnapshotWithBackup>>>();
    repository.replaceSnapshotWithBackup.mockReturnValueOnce(pending.promise);
    const onChanged = vi.fn();
    const health = createHealthStore();
    const { user, unmount } = renderWithRouter(
      <ProgressTransferPanel
        transfer={transfer}
        repository={repository}
        progressHealth={health.store}
        prepareTransferCatalog={() => Promise.resolve()}
        ready={Promise.resolve()}
        onChanged={onChanged}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'この端末の学習データを削除' }));
    await user.click(screen.getByRole('button', { name: '削除を確定する' }));
    expect(repository.replaceSnapshotWithBackup).toHaveBeenCalledWith(EMPTY_SNAPSHOT, 'manual');

    unmount();
    await act(async () => {
      pending.resolve({
        id: 'late-backup',
        reason: 'manual',
        createdAt: '2026-07-16T00:00:00.000Z',
        snapshot: EMPTY_SNAPSHOT,
      });
      await pending.promise;
    });
    await waitFor(() => {
      expect(repository.replaceSnapshotWithBackup).toHaveBeenCalledWith(EMPTY_SNAPSHOT, 'manual');
    });

    expect(onChanged).not.toHaveBeenCalled();
  });
});
