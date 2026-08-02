import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode, useEffect } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type {
  TabLeaseAcquireOptions,
  TabLeaseHandle,
  TabLeaseState,
  TabLeaseWriteFence,
} from '../../core/persistence/TabLeaseCoordinator';
import type { WorkspaceLeaseProof } from '../../core/persistence/contracts';
import {
  WorkspaceLeaseGate,
  type WorkspaceLeaseAccess,
  type WorkspaceLeaseCoordinator,
} from './WorkspaceLeaseGate';

interface Deferred<Value> {
  readonly promise: Promise<Value>;
  readonly resolve: (value: Value) => void;
}

/** takeover完了順をTestから制御できるPromiseを作る。 */
function deferred<Value>(): Deferred<Value> {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}

interface FakeLease {
  readonly handle: TabLeaseHandle;
  readonly setState: (state: TabLeaseState) => void;
  readonly takeover: ReturnType<typeof vi.fn<TabLeaseHandle['takeover']>>;
  readonly runFencedWrite: TabLeaseWriteFence;
  readonly release: ReturnType<typeof vi.fn<TabLeaseHandle['release']>>;
  readonly dispose: ReturnType<typeof vi.fn<TabLeaseHandle['dispose']>>;
}

/** 参照安定snapshotと実購読を持つLease handle test doubleを作る。 */
function createFakeLease(initialState: TabLeaseState): FakeLease {
  let state = Object.freeze({ ...initialState });
  const listeners = new Set<() => void>();
  const takeover = vi.fn<TabLeaseHandle['takeover']>(async () => false);
  const proof: WorkspaceLeaseProof = {
    courseId: 'html-css',
    workspaceId: 'workspace-1',
    ownerId: 'owner-a',
    token: 'lease-token',
    dataEpoch: 0,
    expiresAt: 2_000,
  };
  const runFencedWrite: TabLeaseWriteFence = async <Result,>(
    operation: (token: string, proof: WorkspaceLeaseProof) => Result | Promise<Result>,
  ): Promise<Result> => operation('lease-token', proof);
  const release = vi.fn<TabLeaseHandle['release']>(async () => undefined);
  const dispose = vi.fn<TabLeaseHandle['dispose']>();
  return {
    handle: {
      getSnapshot: () => state,
      subscribe: (listener) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
      takeover,
      runFencedWrite,
      release,
      dispose,
    },
    setState(next) {
      state = Object.freeze({ ...next });
      for (const listener of [...listeners]) listener();
    },
    takeover,
    runFencedWrite,
    release,
    dispose,
  };
}

interface GateHarness {
  readonly coordinator: WorkspaceLeaseCoordinator;
  readonly getAcquireOptions: () => TabLeaseAcquireOptions | undefined;
}

/** Gateが渡すbeforeYieldを観測できるCoordinator portを作る。 */
function coordinatorHarness(handle: TabLeaseHandle): GateHarness {
  let acquireOptions: TabLeaseAcquireOptions | undefined;
  return {
    coordinator: {
      acquire: vi.fn((_courseId: string, _workspaceId: string, options: TabLeaseAcquireOptions) => {
        acquireOptions = options;
        return handle;
      }),
    },
    getAcquireOptions: () => acquireOptions,
  };
}

/** 実Coordinator同様、同一keyの再acquireでは最初のcallbackを保持するHarness。 */
function stickyCoordinatorHarness(handle: TabLeaseHandle): GateHarness {
  let firstAcquireOptions: TabLeaseAcquireOptions | undefined;
  return {
    coordinator: {
      acquire: vi.fn((_courseId: string, _workspaceId: string, options: TabLeaseAcquireOptions) => {
        firstAcquireOptions ??= options;
        return handle;
      }),
    },
    getAcquireOptions: () => firstAcquireOptions,
  };
}

interface RegisteredSessionProps {
  readonly access: WorkspaceLeaseAccess;
  readonly beforeYield: () => Promise<void>;
}

/** mount中だけController相当のflush callbackをGateへ登録する。 */
function RegisteredSession({ access, beforeYield }: RegisteredSessionProps) {
  useEffect(() => access.registerBeforeYield(beforeYield), [access, beforeYield]);
  return <p data-testid="editable-session">編集Session</p>;
}

/** Router内でWorkspaceLeaseGateを描画する。 */
function renderGate(
  coordinator: WorkspaceLeaseCoordinator,
  children: (access: WorkspaceLeaseAccess) => React.ReactNode = () => (
    <p data-testid="editable-session">編集Session</p>
  ),
  showCoordinationWarning = true,
) {
  return render(
    <MemoryRouter>
      <WorkspaceLeaseGate
        courseId="html-css"
        workspaceId="workspace-first-heading"
        coordinator={coordinator}
        showCoordinationWarning={showCoordinationWarning}
      >
        {children}
      </WorkspaceLeaseGate>
    </MemoryRouter>,
  );
}

describe('WorkspaceLeaseGate', () => {
  it('未commitのrenderでは外部Leaseを取得しない', () => {
    const lease = createFakeLease({ status: 'owned', coordination: 'available' });
    const harness = coordinatorHarness(lease.handle);

    renderToString(
      <WorkspaceLeaseGate
        courseId="html-css"
        workspaceId="workspace-first-heading"
        coordinator={harness.coordinator}
      >
        {() => <p>編集Session</p>}
      </WorkspaceLeaseGate>,
    );

    expect(harness.coordinator.acquire).not.toHaveBeenCalled();
  });

  it('claiming中は編集Sessionを作らず、ownedになった後だけmountする', async () => {
    const lease = createFakeLease({ status: 'claiming', coordination: 'available' });
    const { coordinator } = coordinatorHarness(lease.handle);
    renderGate(coordinator);

    expect(screen.getByRole('status')).toHaveTextContent('編集権を確認しています');
    expect(screen.queryByTestId('editable-session')).not.toBeInTheDocument();

    act(() => {
      lease.setState({ status: 'owned', coordination: 'available', ownerId: 'tab-a' });
    });

    expect(await screen.findByTestId('editable-session')).toBeInTheDocument();
  });

  it('read-onlyでは編集Sessionを作らず、明示takeover成功後だけmountする', async () => {
    const lease = createFakeLease({
      status: 'read-only',
      coordination: 'available',
      ownerId: 'tab-other',
    });
    const takeover = deferred<boolean>();
    lease.takeover.mockReturnValueOnce(takeover.promise);
    const { coordinator } = coordinatorHarness(lease.handle);
    const user = userEvent.setup();
    renderGate(coordinator);

    expect(
      await screen.findByRole('heading', { name: '別のタブで編集中です' }),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('editable-session')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'このタブで編集を引き継ぐ' }));
    expect(screen.getByRole('button', { name: '編集を引き継いでいます' })).toBeDisabled();

    act(() => {
      lease.setState({ status: 'owned', coordination: 'available', ownerId: 'tab-a' });
      takeover.resolve(true);
    });

    expect(await screen.findByTestId('editable-session')).toBeInTheDocument();
    expect(lease.takeover).toHaveBeenCalledOnce();
  });

  it('takeover失敗をsafeなalertに変換して再試行を残す', async () => {
    const lease = createFakeLease({
      status: 'read-only',
      coordination: 'available',
      ownerId: 'tab-other',
    });
    lease.takeover.mockResolvedValueOnce(false);
    const { coordinator } = coordinatorHarness(lease.handle);
    const user = userEvent.setup();
    renderGate(coordinator);

    await user.click(await screen.findByRole('button', { name: 'このタブで編集を引き継ぐ' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '編集の引き継ぎを完了できませんでした',
    );
    expect(screen.getByRole('button', { name: 'このタブで編集を引き継ぐ' })).toBeEnabled();
  });

  it('coordination unavailableでも単一tab編集を許し、安全説明と緊急Exportを常設する', async () => {
    const lease = createFakeLease({ status: 'owned', coordination: 'unavailable' });
    const { coordinator } = coordinatorHarness(lease.handle);
    renderGate(coordinator);

    expect(await screen.findByTestId('editable-session')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('複数のタブで同時に開かないでください');
    expect(screen.getByRole('link', { name: '救済用に端末データを書き出す' })).toHaveAttribute(
      'href',
      '/?focus=device-data',
    );
  });

  it('上位の保存Bannerが警告を担う場合はcoordination警告を重複表示しない', async () => {
    const lease = createFakeLease({ status: 'owned', coordination: 'unavailable' });
    const { coordinator } = coordinatorHarness(lease.handle);
    renderGate(coordinator, undefined, false);

    expect(await screen.findByTestId('editable-session')).toBeInTheDocument();
    expect(screen.queryByText(/複数のタブで同時に開かないでください/u)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: '救済用に端末データを書き出す' }),
    ).not.toBeInTheDocument();
  });

  it.each([
    { status: 'yielding' as const, copy: '編集内容を保存して引き継いでいます。' },
    { status: 'released' as const, copy: 'このタブの編集は終了しました。' },
  ])('$statusでは編集Sessionをunmountして救済導線を表示する', async ({ status, copy }) => {
    const lease = createFakeLease({ status: 'owned', coordination: 'available' });
    const { coordinator } = coordinatorHarness(lease.handle);
    renderGate(coordinator);
    expect(await screen.findByTestId('editable-session')).toBeInTheDocument();

    act(() => {
      lease.setState({ status, coordination: 'available' });
    });

    await waitFor(() => {
      expect(screen.queryByTestId('editable-session')).not.toBeInTheDocument();
    });
    expect(screen.getByText(copy)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '救済用に端末データを書き出す' })).toBeInTheDocument();
  });

  it('Controller flushをbeforeYieldへ登録し、unmount時はStrictMode再setupを除いて解放する', async () => {
    const lease = createFakeLease({ status: 'owned', coordination: 'available' });
    const harness = stickyCoordinatorHarness(lease.handle);
    const flush = vi.fn(async () => undefined);
    const rendered = render(
      <StrictMode>
        <MemoryRouter>
          <WorkspaceLeaseGate
            courseId="html-css"
            workspaceId="workspace-first-heading"
            coordinator={harness.coordinator}
          >
            {(access) => <RegisteredSession access={access} beforeYield={flush} />}
          </WorkspaceLeaseGate>
        </MemoryRouter>
      </StrictMode>,
    );

    expect(await screen.findByTestId('editable-session')).toBeInTheDocument();

    await act(async () => {
      await harness.getAcquireOptions()?.beforeYield(lease.runFencedWrite);
    });
    expect(flush).toHaveBeenCalledOnce();

    lease.release.mockImplementationOnce(async () => {
      await harness.getAcquireOptions()?.beforeYield(lease.runFencedWrite);
    });

    rendered.unmount();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(lease.release).toHaveBeenCalledOnce();
    expect(lease.dispose).toHaveBeenCalledOnce();
    expect(flush).toHaveBeenCalledTimes(2);
  });
});
