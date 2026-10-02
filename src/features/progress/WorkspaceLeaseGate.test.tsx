import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode, useEffect } from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { EditorView } from '@codemirror/view';
import { CodeWorkspace } from '../learning/editor/CodeWorkspace';
import { createCodeMirrorEditor } from '../learning/editor/createCodeMirrorEditor';
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
  readonly onRegistered?: () => void;
}

/** mount中だけController相当のflush callbackをGateへ登録する。 */
function RegisteredSession({ access, beforeYield, onRegistered }: RegisteredSessionProps) {
  useEffect(() => {
    const unregister = access.registerBeforeYield(beforeYield);
    onRegistered?.();
    return unregister;
  }, [access, beforeYield, onRegistered]);
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
  it.each(['owned', 'read-only', 'abort', 'unmount'] as const)(
    '再確認待ちは%sで確定し、後の再取得へ持ち越さない',
    async (outcome) => {
      const lease = createFakeLease({ status: 'owned', coordination: 'available' });
      const { coordinator } = coordinatorHarness(lease.handle);
      let access!: WorkspaceLeaseAccess;
      const view = renderGate(coordinator, (current) => {
        access = current;
        return <p>編集画面</p>;
      });
      await screen.findByText('編集画面');
      act(() => {
        lease.setState({ status: 'yielding', revalidating: true, coordination: 'available' });
      });
      const abort = new AbortController();
      const completed = vi.fn();
      const pending = access.waitUntilWritable(abort.signal).then(completed);
      act(() => {
        lease.setState({ status: 'claiming', revalidating: true, coordination: 'available' });
      });
      await Promise.resolve();
      expect(completed).not.toHaveBeenCalled();
      act(() => {
        if (outcome === 'abort') abort.abort();
        else if (outcome === 'unmount') view.unmount();
        else lease.setState({ status: outcome, coordination: 'available' });
      });
      await pending;
      expect(completed).toHaveBeenCalledExactlyOnceWith(outcome === 'owned');
      act(() => {
        lease.setState({ status: 'owned', coordination: 'available' });
      });
      expect(completed).toHaveBeenCalledTimes(1);
    },
  );

  it('self再確認中は同じCodeMirrorを読み取り専用にし、所有権復帰で入力を再開する', async () => {
    const lease = createFakeLease({ status: 'owned', coordination: 'available' });
    const { coordinator } = coordinatorHarness(lease.handle);
    const adapter = createCodeMirrorEditor();
    const changes = vi.fn<(path: string, content: string) => number | undefined>(() => 1);
    let access!: WorkspaceLeaseAccess;
    renderGate(coordinator, (current) => {
      access = current;
      return (
        <CodeWorkspace
          adapter={adapter}
          files={{ 'main.js': 'const value = 1;' }}
          languages={{ 'main.js': 'text' }}
          selectedFile="main.js"
          contentRevision={0}
          cursors={{}}
          diagnostics={[]}
          readOnly={!current.isWritable()}
          onChange={(path, content) => (current.isWritable() ? changes(path, content) : undefined)}
          onCursorChange={() => undefined}
          onSelectedFileChange={() => undefined}
        />
      );
    });
    const original = await screen.findByRole('textbox');
    expect(original).toHaveAttribute('contenteditable', 'true');
    const cm = original.closest<HTMLElement>('.cm-editor');
    const view = cm === null ? null : EditorView.findFromDOM(cm);
    expect(view).not.toBeNull();
    for (const status of ['yielding', 'claiming'] as const) {
      act(() => {
        lease.setState({ status, revalidating: true, coordination: 'available' });
      });
      expect(screen.getByRole('textbox')).toBe(original);
      expect(access.isWritable()).toBe(false);
      expect(original).toHaveAttribute('contenteditable', 'false');
      expect(original).toHaveAttribute('aria-readonly', 'true');
      expect(view!.state.readOnly).toBe(true);
      expect(original).toHaveTextContent('const value = 1;');
      expect(original).toHaveAttribute('tabindex', '0');
    }
    expect(changes).not.toHaveBeenCalled();
    act(() => {
      lease.setState({ status: 'owned', coordination: 'available' });
    });
    expect(screen.getByRole('textbox')).toBe(original);
    expect(original).toHaveAttribute('contenteditable', 'true');
    expect(original).toHaveAttribute('aria-readonly', 'false');
    expect(view!.state.readOnly).toBe(false);
    act(() => {
      view!.dispatch({ changes: { from: view!.state.doc.length, insert: '!' } });
    });
    expect(changes).toHaveBeenLastCalledWith('main.js', 'const value = 1;!');
  });

  it('self再検証の両phaseで同じRuntimeを保持し、所有権喪失時だけ破棄する', async () => {
    const lease = createFakeLease({ status: 'owned', coordination: 'available' });
    const { coordinator } = coordinatorHarness(lease.handle);
    let access!: WorkspaceLeaseAccess;
    renderGate(coordinator, (current) => {
      access = current;
      return <input aria-label="編集中の内容" defaultValue="保持する" />;
    });
    const original = await screen.findByRole('textbox');
    for (const status of ['yielding', 'claiming'] as const) {
      act(() => {
        lease.setState({ status, revalidating: true, coordination: 'available' });
      });
      expect(await screen.findByRole('status')).toHaveTextContent('編集権を再確認しています');
      expect(screen.getByRole('textbox')).toBe(original);
      expect(access.isWritable()).toBe(false);
    }
    act(() => {
      lease.setState({ status: 'owned', coordination: 'available' });
    });
    await waitFor(() => {
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });
    expect(screen.getByRole('textbox')).toBe(original);
    expect(access.isWritable()).toBe(true);
    act(() => {
      lease.setState({ status: 'read-only', coordination: 'available' });
    });
    await waitFor(() => {
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    });
    expect(access.isWritable()).toBe(false);
  });

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
    const registered = vi.fn();
    const rendered = render(
      <StrictMode>
        <MemoryRouter>
          <WorkspaceLeaseGate
            courseId="html-css"
            workspaceId="workspace-first-heading"
            coordinator={harness.coordinator}
          >
            {(access) => (
              <RegisteredSession access={access} beforeYield={flush} onRegistered={registered} />
            )}
          </WorkspaceLeaseGate>
        </MemoryRouter>
      </StrictMode>,
    );

    expect(await screen.findByTestId('editable-session')).toBeInTheDocument();
    await waitFor(() => {
      expect(registered).toHaveBeenCalled();
    });

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

  it('解放中に同じworkspaceへ戻ると解放完了後に新しいLeaseを取得する', async () => {
    const firstLease = createFakeLease({ status: 'owned', coordination: 'available' });
    const secondLease = createFakeLease({ status: 'owned', coordination: 'available' });
    const released = deferred<undefined>();
    let useSecondLease = false;
    firstLease.release.mockImplementationOnce(async () => {
      firstLease.setState({ status: 'yielding', coordination: 'available' });
      await released.promise;
      firstLease.setState({ status: 'released', coordination: 'available' });
    });
    const coordinator: WorkspaceLeaseCoordinator = {
      acquire: vi.fn(() => (useSecondLease ? secondLease.handle : firstLease.handle)),
    };

    const initial = renderGate(coordinator);
    expect(await screen.findByTestId('editable-session')).toBeInTheDocument();
    initial.unmount();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(firstLease.release).toHaveBeenCalledOnce();

    const resumed = renderGate(coordinator);
    useSecondLease = true;
    released.resolve(undefined);

    expect(await screen.findByTestId('editable-session')).toBeInTheDocument();
    expect(coordinator.acquire).toHaveBeenCalledTimes(2);
    resumed.unmount();
  });
});
