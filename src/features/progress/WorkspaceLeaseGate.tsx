import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { Link } from 'react-router';
import type {
  TabLeaseCoordinator,
  TabLeaseHandle,
  TabLeaseWriteFence,
} from '../../core/persistence/TabLeaseCoordinator';
import type { WorkspaceLeaseProof } from '../../core/persistence/contracts';
import { StackedCard } from '../../design-system/components/StackedCard';

type BeforeYield = () => void | Promise<void>;

export type WorkspaceLeaseCoordinator = Pick<TabLeaseCoordinator, 'acquire'>;

export interface WorkspaceLeaseAccess {
  readonly runFencedWrite: TabLeaseHandle['runFencedWrite'];
  readonly isWritable: () => boolean;
  readonly registerBeforeYield: (callback: BeforeYield) => () => void;
}

export interface WorkspaceLeaseGateProps {
  readonly courseId: string;
  readonly workspaceId: string;
  readonly coordinator: WorkspaceLeaseCoordinator;
  readonly showCoordinationWarning?: boolean;
  readonly children: (access: WorkspaceLeaseAccess) => ReactNode;
}

interface WorkspaceLeaseBinding {
  readonly coordinator: WorkspaceLeaseCoordinator;
  readonly courseId: string;
  readonly workspaceId: string;
  readonly session?: WorkspaceLeaseSession;
  readonly acquisitionFailed: boolean;
}

const NO_BEFORE_YIELD: BeforeYield = () => undefined;
const LEASE_SESSIONS = new WeakMap<WorkspaceLeaseCoordinator, Map<string, WorkspaceLeaseSession>>();

/** StrictModeの二重初期化でも同じbeforeYield callbackを保つLease session。 */
class WorkspaceLeaseSession {
  readonly handle: TabLeaseHandle;
  readonly access: WorkspaceLeaseAccess;
  #beforeYield: BeforeYield = NO_BEFORE_YIELD;
  #beforeYieldGeneration = 0;
  #writeFence: TabLeaseWriteFence;
  #retained = 0;
  #releaseStarted = false;
  readonly #released: Promise<void>;
  readonly #resolveReleased: () => void;

  constructor(
    coordinator: WorkspaceLeaseCoordinator,
    courseId: string,
    workspaceId: string,
    private readonly onReleased: () => void,
  ) {
    let resolveReleased!: () => void;
    this.#released = new Promise<void>((resolve) => {
      resolveReleased = resolve;
    });
    this.#resolveReleased = resolveReleased;
    const regularFence: TabLeaseWriteFence = (operation) => this.handle.runFencedWrite(operation);
    this.#writeFence = regularFence;
    const acquired = coordinator.acquire(courseId, workspaceId, {
      beforeYield: async (yieldFence) => {
        this.#writeFence = yieldFence;
        try {
          await this.#beforeYield();
        } finally {
          this.#writeFence = regularFence;
        }
      },
    });
    this.handle = acquired;
    const runFencedWrite: TabLeaseWriteFence = <Result,>(
      operation: (token: string, proof: WorkspaceLeaseProof) => Result | Promise<Result>,
    ): Promise<Result> => this.#writeFence(operation);
    this.access = Object.freeze({
      runFencedWrite,
      isWritable: () => {
        const status = this.handle.getSnapshot().status;
        return status === 'owned' || status === 'local-rescue';
      },
      registerBeforeYield: (callback: BeforeYield) => {
        this.#beforeYieldGeneration += 1;
        const generation = this.#beforeYieldGeneration;
        this.#beforeYield = callback;
        return () => {
          queueMicrotask(() => {
            if (this.#beforeYieldGeneration !== generation || this.#beforeYield !== callback)
              return;
            this.#beforeYield = NO_BEFORE_YIELD;
          });
        };
      },
    });
  }

  /** committed effectごとにSession利用数を増やし、解放開始後の再利用だけを拒否する。 */
  retain(): boolean {
    if (this.#releaseStarted) return false;
    this.#retained += 1;
    return true;
  }

  /** 解放中SessionがCoordinatorと共有Mapから完全に外れるまで待つ。 */
  waitUntilReleased(): Promise<void> {
    return this.#released;
  }

  /** StrictMode再setupを待ち、利用者が0の実unmount時だけleaseを解放する。 */
  releaseAfterCleanup(): void {
    queueMicrotask(() => {
      this.#retained = Math.max(0, this.#retained - 1);
      if (this.#retained > 0 || this.#releaseStarted) return;
      this.#releaseStarted = true;
      void this.handle
        .release()
        .catch(() => undefined)
        .finally(() => {
          this.handle.dispose();
          this.onReleased();
          this.#resolveReleased();
        });
    });
  }
}

/** Coordinator・Course・workspace単位でStrictMode両renderが共有するSessionを返す。 */
function getLeaseSession(
  coordinator: WorkspaceLeaseCoordinator,
  courseId: string,
  workspaceId: string,
): WorkspaceLeaseSession {
  let sessions = LEASE_SESSIONS.get(coordinator);
  if (sessions === undefined) {
    sessions = new Map();
    LEASE_SESSIONS.set(coordinator, sessions);
  }
  const key = JSON.stringify([courseId, workspaceId]);
  const existing = sessions.get(key);
  if (existing !== undefined) return existing;
  const sessionMap = sessions;
  const session = new WorkspaceLeaseSession(coordinator, courseId, workspaceId, () => {
    if (sessionMap.get(key) === session) sessionMap.delete(key);
    if (sessionMap.size === 0) LEASE_SESSIONS.delete(coordinator);
  });
  sessions.set(key, session);
  return session;
}

/** Lease取得完了前に、編集Runtimeを生成せず待機状態を示す。 */
function WorkspaceLeasePreparing() {
  return (
    <StackedCard as="section" className="bg-workshop-raised">
      <p role="status" className="font-bold text-workshop-muted">
        このworkspaceの編集権を確認しています。
      </p>
    </StackedCard>
  );
}

/** Lease取得自体に失敗した場合、編集を開始せず端末データの救済導線を残す。 */
function WorkspaceLeaseAcquisitionError() {
  return (
    <StackedCard as="section" className="border-2 border-workshop-correction bg-workshop-raised">
      <p role="alert" className="font-black text-workshop-correction">
        編集権の確認を開始できませんでした。この画面では編集や保存を開始しません。
      </p>
      <Link
        to="/?focus=device-data"
        className="mt-4 inline-flex min-h-11 items-center font-bold text-workshop-primary underline"
      >
        救済用に端末データを書き出す
      </Link>
    </StackedCard>
  );
}

interface WorkspaceLeaseSessionViewProps {
  readonly session: WorkspaceLeaseSession;
  readonly children: WorkspaceLeaseGateProps['children'];
  readonly showCoordinationWarning: boolean;
}

/** commit後に取得済みのLeaseだけを購読し、状態ごとの編集可否へ変換する。 */
function WorkspaceLeaseSessionView({
  session,
  children,
  showCoordinationWarning,
}: WorkspaceLeaseSessionViewProps) {
  const actionGenerationRef = useRef(0);
  const mountedRef = useRef(false);
  const takeoverPendingRef = useRef(false);
  const [takeoverPending, setTakeoverPending] = useState(false);
  const [takeoverError, setTakeoverError] = useState(false);
  const handle = session.handle;
  const subscribe = useCallback((listener: () => void) => handle.subscribe(listener), [handle]);
  const getSnapshot = useCallback(() => handle.getSnapshot(), [handle]);
  const lease = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      actionGenerationRef.current += 1;
    };
  }, []);

  /** 同時clickを一つへまとめ、失敗詳細を公開せず同じ画面から再試行可能にする。 */
  const takeover = (): void => {
    if (takeoverPendingRef.current) return;
    takeoverPendingRef.current = true;
    setTakeoverPending(true);
    setTakeoverError(false);
    actionGenerationRef.current += 1;
    const generation = actionGenerationRef.current;
    void handle.takeover().then(
      (acquired) => {
        takeoverPendingRef.current = false;
        if (!mountedRef.current || actionGenerationRef.current !== generation) return;
        setTakeoverPending(false);
        setTakeoverError(!acquired);
      },
      () => {
        takeoverPendingRef.current = false;
        if (!mountedRef.current || actionGenerationRef.current !== generation) return;
        setTakeoverPending(false);
        setTakeoverError(true);
      },
    );
  };

  if (lease.status === 'owned' || lease.status === 'local-rescue') {
    return (
      <>
        {lease.coordination === 'unavailable' && showCoordinationWarning ? (
          <StackedCard
            as="aside"
            role="alert"
            className="mb-6 border-2 border-workshop-correction bg-workshop-raised"
          >
            <p className="font-black text-workshop-correction">
              タブ間の編集調整を利用できません。複数のタブで同時に開かないでください。
            </p>
            <Link
              to="/?focus=device-data"
              className="mt-4 inline-flex min-h-11 items-center font-bold text-workshop-primary underline"
            >
              救済用に端末データを書き出す
            </Link>
          </StackedCard>
        ) : null}
        {children(session.access)}
      </>
    );
  }

  if (lease.status === 'claiming') {
    return <WorkspaceLeasePreparing />;
  }

  if (lease.status === 'read-only') {
    return (
      <StackedCard
        as="section"
        aria-labelledby="workspace-lease-conflict-title"
        className="border-2 border-workshop-correction bg-workshop-raised"
      >
        <h1 id="workspace-lease-conflict-title" className="text-3xl font-black">
          別のタブで編集中です
        </h1>
        <p className="mt-4 leading-7 text-workshop-muted">
          同じworkspaceを同時に保存すると学習内容が上書きされるため、このタブでは編集を開始していません。
        </p>
        {takeoverError ? (
          <p role="alert" className="mt-4 font-bold text-workshop-correction">
            編集の引き継ぎを完了できませんでした。元のタブを確認して、もう一度試してください。
          </p>
        ) : null}
        <div className="mt-5 flex flex-wrap gap-4">
          <button
            type="button"
            disabled={takeoverPending}
            onClick={takeover}
            className="inline-flex min-h-11 items-center rounded-workshop-md bg-workshop-primary px-5 py-3 font-bold text-workshop-on-primary disabled:opacity-60"
          >
            {takeoverPending ? '編集を引き継いでいます' : 'このタブで編集を引き継ぐ'}
          </button>
          <Link
            to="/?focus=device-data"
            className="inline-flex min-h-11 items-center font-bold text-workshop-primary underline"
          >
            救済用に端末データを書き出す
          </Link>
        </div>
      </StackedCard>
    );
  }

  return (
    <StackedCard as="section" className="border-2 border-workshop-correction bg-workshop-raised">
      <p
        role={lease.status === 'yielding' ? 'status' : 'alert'}
        className="font-black text-workshop-correction"
      >
        {lease.status === 'yielding'
          ? '編集内容を保存して引き継いでいます。'
          : 'このタブの編集は終了しました。'}
      </p>
      <p className="mt-3 text-workshop-muted">
        この画面では新しい編集や保存を開始しません。必要なら端末データを書き出してください。
      </p>
      <Link
        to="/?focus=device-data"
        className="mt-4 inline-flex min-h-11 items-center font-bold text-workshop-primary underline"
      >
        救済用に端末データを書き出す
      </Link>
    </StackedCard>
  );
}

/** 編集権取得前は学習Runtimeを生成せず、workspace lease状態を救済導線付きUIへ変換する。 */
export function WorkspaceLeaseGate({
  courseId,
  workspaceId,
  coordinator,
  showCoordinationWarning = true,
  children,
}: WorkspaceLeaseGateProps) {
  const [binding, setBinding] = useState<WorkspaceLeaseBinding>();

  useEffect(() => {
    let active = true;
    let session: WorkspaceLeaseSession | undefined;
    /** 解放中の古いSessionを再利用せず、完全解放後に同じworkspaceを再取得する。 */
    const bindSession = async (): Promise<void> => {
      try {
        let candidate = getLeaseSession(coordinator, courseId, workspaceId);
        while (!candidate.retain()) {
          await candidate.waitUntilReleased();
          if (!active) return;
          candidate = getLeaseSession(coordinator, courseId, workspaceId);
        }
        session = candidate;
        const nextBinding: WorkspaceLeaseBinding = {
          coordinator,
          courseId,
          workspaceId,
          session,
          acquisitionFailed: false,
        };
        queueMicrotask(() => {
          if (active) setBinding(nextBinding);
        });
      } catch {
        const failedBinding: WorkspaceLeaseBinding = {
          coordinator,
          courseId,
          workspaceId,
          acquisitionFailed: true,
        };
        queueMicrotask(() => {
          if (active) setBinding(failedBinding);
        });
      }
    };
    void bindSession();

    return () => {
      active = false;
      session?.releaseAfterCleanup();
    };
  }, [coordinator, courseId, workspaceId]);

  const currentBinding =
    binding?.coordinator === coordinator &&
    binding.courseId === courseId &&
    binding.workspaceId === workspaceId
      ? binding
      : undefined;
  if (currentBinding === undefined) return <WorkspaceLeasePreparing />;
  if (currentBinding.acquisitionFailed || currentBinding.session === undefined) {
    return <WorkspaceLeaseAcquisitionError />;
  }
  return (
    <WorkspaceLeaseSessionView
      session={currentBinding.session}
      children={children}
      showCoordinationWarning={showCoordinationWarning}
    />
  );
}
