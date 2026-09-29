/** Desktop編集SessionをRepository復元後だけEditor・Preview・判定へ接続する。 */
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useNavigate } from 'react-router';
import type * as BrowserConsoleRuntimeModule from '../browserConsoleRuntime';
import type { exerciseLoader } from '../../../app/contentLoaders';
import type { Exercise } from '../../../core/content/types';
import {
  findWorkspaceValidationTargets,
  recordDraftMutationFromIndex,
  recordValidationFromIndex,
} from '../../../core/persistence/progressUpdates';
import { LeaseFenceRejectedError } from '../../../core/persistence/contracts';
import type { ResolvedPreviewAsset } from '../../../core/runtime/contracts';
import { BrowserExecutionService } from '../../../core/runtime/BrowserExecutionService';
import { localRuntime } from '@/features/learning/localRuntime';
import { RuntimeConsole } from '../components/RuntimeConsole';
import { WorkshopNotice } from '../../../design-system/components/WorkshopNotice';
import { resolvePublicAsset } from '../../../shared/lib/resolvePublicAsset';
import type { WorkspaceLeaseAccess } from '../../progress/WorkspaceLeaseGate';
import {
  ExerciseInstructionPane,
  ExerciseStatusDrawer,
  LearningDrawer,
  PreviewFrame,
  SaveStatus,
} from '../components';
import { SlideBlocks } from '../components/SlideBlocks';
import { SlideCodeReference } from '../components/SlideCodeReference';
import { createCodeMirrorEditor } from '../editor/createCodeMirrorEditor';
import { LearningToolRail } from '../layout/LearningToolRail';
import { LearningViewportShell } from '../layout/LearningViewportShell';
import { LearningSessionController, StaleExecutionError, useLearningSession } from '../session';
import { ExecutionNotGradableError } from '../session/LearningSessionController';
import { learningRuntimeServices } from '../runtimeServices';
import { useAdjacentLessonPrefetch } from '../useAdjacentLessonPrefetch';

const LazyCodeWorkspace = lazy(() =>
  import('../editor/CodeWorkspace').then((module) => ({ default: module.CodeWorkspace })),
);

type ExerciseLoaderData = Awaited<ReturnType<typeof exerciseLoader>>;
type InitializationState = 'loading' | 'ready' | 'error';
type RuntimePreparationState = 'loading' | 'ready' | 'error';
type BrowserConsoleRuntime = typeof BrowserConsoleRuntimeModule;

interface RuntimePreparation {
  readonly consoleRuntime?: BrowserConsoleRuntime;
  readonly key: string;
  readonly state: RuntimePreparationState;
}
type OperationState = 'idle' | 'preview' | 'validate' | 'reset';

interface ExerciseViewState {
  readonly activeFilePath: string;
  readonly activeStepId: string | undefined;
  readonly drawerMode: 'feedback' | 'hint' | undefined;
  readonly relatedSlideId: string | undefined;
  readonly editorFocusRequestId: number;
}

interface EditableSessionProps extends ExerciseLoaderData {
  readonly consoleRuntime: BrowserConsoleRuntime | undefined;
  readonly lease: WorkspaceLeaseAccess;
  readonly onRetry: () => void;
}

interface EditableExercisePageProps extends ExerciseLoaderData {
  readonly lease: WorkspaceLeaseAccess;
}

/** workspace全ExerciseのAssetをIDでunionし、異なる同一ID定義を拒否する。 */
function resolveWorkspaceAssets(exercises: readonly Exercise[]): readonly ResolvedPreviewAsset[] {
  const byId = new Map<string, ResolvedPreviewAsset>();
  for (const asset of exercises.flatMap((item) => item.assets)) {
    const resolved: ResolvedPreviewAsset = {
      id: asset.id,
      mediaType: asset.mediaType,
      url: resolvePublicAsset(import.meta.env.BASE_URL, asset.path),
    };
    const previous = byId.get(asset.id);
    if (
      previous !== undefined &&
      (previous.mediaType !== resolved.mediaType || previous.url !== resolved.url)
    ) {
      throw new Error(`同じAsset IDの定義が一致しません: ${asset.id}`);
    }
    byId.set(asset.id, resolved);
  }
  return [...byId.values()];
}

/** 非同期操作の種別を学習者が次に行える操作へ変換する。 */
function operationErrorMessage(operation: Exclude<OperationState, 'idle' | 'reset'>): string {
  switch (operation) {
    case 'preview':
      return 'プレビューを更新できませんでした。少し待ってからもう一度試してください。';
    case 'validate':
      return '判定を完了できませんでした。編集内容は残っています。もう一度試してください。';
  }
}

/** iframe初期化失敗と描画失敗を区別し、必要な復旧操作を具体的に案内する。 */
function previewPreparationErrorMessage(): string {
  return 'プレビューを準備できませんでした。「プレビューを再準備」を押してください。';
}

/** retryごとにSession全体を再構築し、失敗済み初期化PromiseとRunnerを再利用しない。 */
export function EditableExercisePage({ lease, ...data }: EditableExercisePageProps) {
  useAdjacentLessonPrefetch(data.course, data.lesson.id);
  const [attempt, setAttempt] = useState(0);
  const runtimePreparationKey = JSON.stringify([
    data.course.id,
    data.course.runnerId,
    data.course.validatorId,
    attempt,
  ]);
  const [runtimePreparation, setRuntimePreparation] = useState<RuntimePreparation>({
    key: runtimePreparationKey,
    state: 'loading',
  });
  const currentRuntimePreparation =
    runtimePreparation.key === runtimePreparationKey ? runtimePreparation.state : 'loading';
  const runtimeErrorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const abortController = new AbortController();
    void import('../javascriptRuntimeServices')
      .then(async ({ ensureCourseRuntime }) => {
        await ensureCourseRuntime(data.course, learningRuntimeServices);
        return data.course.id === 'javascript' && localRuntime === undefined
          ? import('../browserConsoleRuntime')
          : undefined;
      })
      .then(
        (consoleRuntime) => {
          if (!abortController.signal.aborted) {
            setRuntimePreparation({
              key: runtimePreparationKey,
              state: 'ready',
              ...(consoleRuntime === undefined ? {} : { consoleRuntime }),
            });
          }
        },
        () => {
          if (!abortController.signal.aborted) {
            setRuntimePreparation({ key: runtimePreparationKey, state: 'error' });
          }
        },
      );
    return () => {
      abortController.abort();
    };
  }, [data.course, runtimePreparationKey]);

  useEffect(() => {
    if (currentRuntimePreparation === 'error') runtimeErrorRef.current?.focus();
  }, [currentRuntimePreparation]);

  if (currentRuntimePreparation === 'loading') {
    return <p role="status">演習環境を読み込んでいます</p>;
  }
  if (currentRuntimePreparation === 'error') {
    return (
      <div ref={runtimeErrorRef} role="alert" tabIndex={-1}>
        <WorkshopNotice tone="correction" title="演習環境を読み込めませんでした">
          <p>通信状態を確認してください。コードや下書きは変更せず、同じ画面で再試行できます。</p>
        </WorkshopNotice>
        <button
          type="button"
          onClick={() => {
            setAttempt((current) => current + 1);
          }}
          className="mt-4 inline-flex min-h-11 items-center rounded-workshop-md bg-workshop-primary px-5 py-3 font-bold text-workshop-on-primary"
        >
          もう一度読み込む
        </button>
      </div>
    );
  }

  return (
    <EditableSession
      key={attempt}
      {...data}
      consoleRuntime={runtimePreparation.consoleRuntime}
      lease={lease}
      onRetry={() => {
        setAttempt((current) => current + 1);
      }}
    />
  );
}

/** 単一attemptのController lifecycleと全学習操作を画面へ接続する。 */
function EditableSession({
  course,
  lesson,
  exercise,
  workspaceLessons,
  lease,
  onRetry,
  consoleRuntime,
}: EditableSessionProps) {
  const navigate = useNavigate();
  const [operation, setOperation] = useState<OperationState>('idle');
  const [operationError, setOperationError] = useState<string>();
  const [previewNeedsPrepare, setPreviewNeedsPrepare] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [activeStepId, setActiveStepId] = useState<string | undefined>(exercise.steps[0]?.id);
  const [drawerMode, setDrawerMode] = useState<'feedback' | 'hint'>();
  const [relatedSlideId, setRelatedSlideId] = useState<string>();
  const [editorFocusRequestId, setEditorFocusRequestId] = useState(0);
  const [restoreEditorFocus, setRestoreEditorFocus] = useState(false);
  const mountedRef = useRef(true);
  const operationGenerationRef = useRef(0);
  const resetInFlightRef = useRef(false);
  const previewFrameRef = useRef<HTMLIFrameElement | undefined>(undefined);
  const hintTriggerRef = useRef<HTMLButtonElement>(null);
  const feedbackTriggerRef = useRef<HTMLButtonElement>(null);
  const validateTriggerRef = useRef<HTMLButtonElement>(null);
  const resetTriggerRef = useRef<HTMLButtonElement>(null);
  const resetCancelRef = useRef<HTMLButtonElement>(null);
  const statusReturnFocusRef = useRef<HTMLElement>(null);
  const validationTargets = useMemo(
    () => findWorkspaceValidationTargets(course, workspaceLessons, exercise.id),
    [course, exercise.id, workspaceLessons],
  );
  const allWorkspaceTargets = validationTargets;
  const resolvedWorkspaceAssets = useMemo(
    () => resolveWorkspaceAssets(allWorkspaceTargets.map(({ exercise: target }) => target)),
    [allWorkspaceTargets],
  );
  const browserConsole = useMemo(
    () =>
      consoleRuntime?.selectBrowserConsoleRuntime(
        exercise,
        validationTargets.map(({ exercise: target }) => target),
      ),
    [consoleRuntime, exercise, validationTargets],
  );
  const validator = useMemo(
    () =>
      localRuntime?.createValidator(exercise) ??
      browserConsole?.createValidator() ??
      learningRuntimeServices.validatorRegistry.create(course.validatorId),
    [course.validatorId, exercise, browserConsole],
  );
  const controller = useMemo(
    () =>
      new LearningSessionController({
        courseId: course.id,
        lessonId: lesson.id,
        exercise,
        contentRevision: course.revision,
        validationExercises: validationTargets.map(({ exercise: target }) => target),
        resolvedAssets: resolvedWorkspaceAssets,
        repository: learningRuntimeServices.repository,
        onDirty: (draft) => {
          learningRuntimeServices.passFreshness.markDirty(
            draft.courseId,
            draft.workspaceId,
            allWorkspaceTargets.map(({ exercise: target }) => target.id),
            draft.editRevision,
          );
        },
        onBackgroundError: (error) => {
          // 未対応・停止の理由は実行状態とEditor診断に表示済み。
          if (error instanceof ExecutionNotGradableError) return;
          learningRuntimeServices.notices.reportError('exercise-preview', error);
        },
        onSaveError: (error) => {
          learningRuntimeServices.notices.reportError('exercise-save', error);
        },
        onSaveRecovered: () => {
          learningRuntimeServices.notices.dismiss('error:exercise-save');
        },
        saveDraft: async (draft) => {
          try {
            await lease.runFencedWrite(async (_token, proof) => {
              await learningRuntimeServices.runCourseProgressMutation(course.id, async () => {
                const current = await learningRuntimeServices.repository.getCourseVersioned(
                  course.id,
                );
                const invalidated = allWorkspaceTargets.reduce(
                  (progress, target) =>
                    recordDraftMutationFromIndex(progress, course, target.lesson, target.exercise, {
                      ...draft,
                      lessonId: target.lesson.id,
                      exerciseId: target.exercise.id,
                    }) ?? progress,
                  current.progress,
                );
                if (invalidated === undefined) {
                  await learningRuntimeServices.repository.putDraftFenced(draft, proof);
                } else {
                  await learningRuntimeServices.repository.putDraftAndCourseFenced(
                    draft,
                    invalidated,
                    proof,
                    current.version,
                  );
                }
              });
            });
          } catch (error: unknown) {
            if (error instanceof LeaseFenceRejectedError) {
              learningRuntimeServices.progressService.retainEmergencyDraft(draft);
            }
            throw error;
          }
          learningRuntimeServices.notices.dismiss('error:exercise-save');
        },
        runner:
          localRuntime?.createExecution(exercise, course.revision) ??
          browserConsole?.createExecution() ??
          new BrowserExecutionService(
            learningRuntimeServices.runnerRegistry.create(course.runnerId),
          ),
        validator,
        now: () => new Date().toISOString(),
      }),
    [
      allWorkspaceTargets,
      browserConsole,
      course,
      exercise,
      lease,
      lesson.id,
      resolvedWorkspaceAssets,
      validationTargets,
      validator,
    ],
  );
  const state = useLearningSession(controller);
  const initializationChain = useRef<
    | {
        controller: LearningSessionController;
        settled: Promise<void>;
      }
    | undefined
  >(undefined);
  // 同じURLのloader再検証でもControllerは交代する。旧Sessionのreadyを引き継がない。
  const [initializedSession, setInitializedSession] = useState<{
    controller: LearningSessionController;
    state: InitializationState;
  }>({ controller, state: 'loading' });
  const initialization =
    initializedSession.controller === controller ? initializedSession.state : 'loading';
  const starterFiles = useMemo(
    () => Object.fromEntries(exercise.files.map(({ path, content }) => [path, content])),
    [exercise.files],
  );
  const canReset = useMemo(() => {
    const currentPaths = Object.keys(state.files);
    const starterPaths = Object.keys(starterFiles);
    return (
      currentPaths.length !== starterPaths.length ||
      starterPaths.some((path) => state.files[path] !== starterFiles[path])
    );
  }, [starterFiles, state.files]);
  const workspaceFiles = useMemo(
    () => (operation === 'reset' ? { ...state.files } : state.files),
    [operation, state.files],
  );
  const editor = useMemo(
    () => createCodeMirrorEditor(learningRuntimeServices.editorLanguageRegistry),
    [],
  );
  const result = state.validationHistory.at(-1);
  const busy = operation !== 'idle';
  const viewState: ExerciseViewState = {
    activeFilePath: state.selectedFile,
    activeStepId,
    drawerMode,
    relatedSlideId,
    editorFocusRequestId,
  };
  const relatedSlide =
    viewState.relatedSlideId === undefined
      ? undefined
      : workspaceLessons
          .flatMap(({ slides }) => slides)
          .find(({ id }) => id === viewState.relatedSlideId);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      operationGenerationRef.current += 1;
    };
  }, []);

  useEffect(() => {
    if (!restoreEditorFocus) return;
    const frame = requestAnimationFrame(() => {
      setEditorFocusRequestId((current) => current + 1);
      setRestoreEditorFocus(false);
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [restoreEditorFocus]);

  /** 画面操作の世代を進め、古いPromise callbackを後続操作から分離する。 */
  const beginOperation = useCallback((): number => {
    operationGenerationRef.current += 1;
    return operationGenerationRef.current;
  }, []);

  /** 現在mount中かつ最新世代の画面操作だけがUI副作用を実行できる。 */
  const isCurrentOperation = useCallback(
    (generation: number): boolean =>
      mountedRef.current && operationGenerationRef.current === generation,
    [],
  );

  useEffect(() => {
    const abortController = new AbortController();
    const predecessor = initializationChain.current;
    /** awaitの前後で離脱状態を読み直し、旧処理による通知・UI更新を防ぐ。 */
    const isActive = (): boolean => !abortController.signal.aborted;
    const settled = (async () => {
      try {
        // 旧Controllerのdebounce保存を新しいDraft読込より先に完了させる。
        // 連続再検証でも直前だけでなく、それ以前の保存待ちを引き継ぐ。
        await predecessor?.settled;
        if (predecessor !== undefined && predecessor.controller !== controller) {
          await predecessor.controller.flush();
        }
        await learningRuntimeServices.ready;
        if (!isActive()) return;
        await controller.initialize();
        if (isActive()) {
          learningRuntimeServices.notices.dismiss('error:exercise-initialize');
          setInitializedSession({ controller, state: 'ready' });
        }
      } catch (error: unknown) {
        if (!isActive() || error instanceof StaleExecutionError) return;
        learningRuntimeServices.notices.reportError('exercise-initialize', error);
        setInitializedSession({ controller, state: 'error' });
      }
    })();
    initializationChain.current = { controller, settled };
    return () => {
      abortController.abort();
    };
  }, [controller]);

  useEffect(() => lease.registerBeforeYield(() => controller.flush()), [controller, lease]);

  useLayoutEffect(() => {
    if (initialization !== 'ready' || state.reviewReturn === undefined) return;
    const { scrollOffset } = state.reviewReturn;
    const frame = requestAnimationFrame(() => {
      window.scrollTo({ top: scrollOffset, behavior: 'auto' });
      controller.closeReview();
      void controller.flush().catch((error: unknown) => {
        learningRuntimeServices.notices.reportError('exercise-save', error);
      });
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [controller, initialization, state.reviewReturn]);

  /** 必要なら同じiframeを再初期化し、描画までを一つのbusy/error境界で実行する。 */
  const executePreview = useCallback(
    (frame: HTMLIFrameElement | undefined, shouldPrepare: boolean): void => {
      const generation = beginOperation();
      setOperation('preview');
      setOperationError(undefined);
      void (async () => {
        try {
          if (shouldPrepare && frame !== undefined) {
            try {
              await controller.prepare(frame);
              if (isCurrentOperation(generation)) setPreviewNeedsPrepare(false);
            } catch (error: unknown) {
              if (isCurrentOperation(generation) && !(error instanceof StaleExecutionError)) {
                setPreviewNeedsPrepare(true);
                setOperationError(previewPreparationErrorMessage());
              }
              return;
            }
          }
          try {
            await controller.previewNow();
            if (isCurrentOperation(generation)) {
              setPreviewNeedsPrepare(false);
              learningRuntimeServices.notices.dismiss('error:exercise-preview');
            }
          } catch (error: unknown) {
            if (isCurrentOperation(generation) && !(error instanceof StaleExecutionError)) {
              setOperationError(
                error instanceof ExecutionNotGradableError
                  ? error.message
                  : operationErrorMessage('preview'),
              );
            }
          }
        } finally {
          if (isCurrentOperation(generation)) setOperation('idle');
        }
      })();
    },
    [beginOperation, controller, isCurrentOperation],
  );

  useEffect(() => {
    if (
      initialization === 'ready' &&
      controller.environment.backend === 'browser' &&
      controller.environment.mode === 'console'
    ) {
      const frame = requestAnimationFrame(() => {
        executePreview(undefined, false);
      });
      return () => {
        cancelAnimationFrame(frame);
      };
    }
  }, [controller, executePreview, initialization]);

  /** 初回frameを保持し、失敗後も同じsandboxへ再prepareできるようにする。 */
  const preparePreview = useCallback(
    (frame: HTMLIFrameElement): void => {
      previewFrameRef.current = frame;
      executePreview(frame, true);
    },
    [executePreview],
  );

  /** 手動Preview更新を未処理rejectionなしで実行する。 */
  const updatePreview = (): void => {
    if (!lease.isWritable()) return;
    const frame = previewFrameRef.current;
    if (frame === undefined && controller.environment.mode !== 'console') {
      setPreviewNeedsPrepare(true);
      setOperationError(previewPreparationErrorMessage());
      return;
    }
    executePreview(frame, previewNeedsPrepare);
  };

  /** 判定batch・最新Draft・進捗を同じrevisionで原子的に保存する。 */
  const validate = (): void => {
    if (!lease.isWritable()) return;
    statusReturnFocusRef.current = validateTriggerRef.current;
    const generation = beginOperation();
    setOperation('validate');
    setOperationError(undefined);
    setDrawerMode(undefined);
    void (async () => {
      try {
        const nextResult = await controller.validateNow();
        const executionRevision = nextResult.executionRevision;
        if (executionRevision === null) throw new Error('判定revisionがありません');
        if (nextResult.status !== 'pass' && isCurrentOperation(generation)) {
          setDrawerMode('feedback');
        }
        let persisted;
        try {
          persisted = await lease.runFencedWrite(async (_token, proof) =>
            learningRuntimeServices.runCourseProgressMutation(course.id, async () => {
              const current = await learningRuntimeServices.repository.getCourseVersioned(
                course.id,
              );
              const resultsById = new Map(
                controller
                  .getLastValidationBatch()
                  .map(({ exercise: target, result: targetResult }) => [target.id, targetResult]),
              );
              const progressBatch = validationTargets.map((target) => {
                const targetResult = resultsById.get(target.exercise.id);
                if (targetResult === undefined) {
                  throw new Error(`Workspace判定結果がありません: ${target.exercise.id}`);
                }
                return {
                  ...target,
                  result: {
                    ...targetResult,
                    executionRevision,
                    evaluatedAt: nextResult.evaluatedAt,
                  },
                };
              });
              const firstTarget = progressBatch[0];
              if (firstTarget === undefined) throw new Error('Workspace判定対象がありません');
              let updated = recordValidationFromIndex(
                current.progress,
                course,
                firstTarget.lesson,
                firstTarget.exercise,
                firstTarget.result,
              );
              for (const target of progressBatch.slice(1)) {
                updated = recordValidationFromIndex(
                  updated,
                  course,
                  target.lesson,
                  target.exercise,
                  target.result,
                );
              }
              const draft = controller.getLastValidationDraft(executionRevision);
              const passedIds = progressBatch
                .filter(({ result: targetResult }) => targetResult.status === 'pass')
                .map(({ exercise: target }) => target.id);
              const snapshotsAreCurrent = passedIds.every((id) => {
                const snapshot = draft?.lastPassingSnapshots[id];
                return (
                  snapshot?.editRevision === executionRevision &&
                  snapshot.contentRevision === course.revision
                );
              });
              if (
                draft === undefined ||
                draft.editRevision !== executionRevision ||
                !snapshotsAreCurrent
              ) {
                throw new StaleExecutionError();
              }
              await learningRuntimeServices.repository.putDraftAndCourseFenced(
                draft,
                updated,
                proof,
                current.version,
              );
              return { updated, passedIds };
            }),
          );
        } catch (error: unknown) {
          if (!(error instanceof StaleExecutionError)) {
            learningRuntimeServices.notices.reportError('exercise-save', error);
          }
          throw error;
        }
        if (isCurrentOperation(generation)) {
          learningRuntimeServices.notices.dismiss('error:exercise-save');
        }
        if (persisted.passedIds.length > 0) {
          learningRuntimeServices.passFreshness.markPassed(
            course.id,
            exercise.workspaceId,
            persisted.passedIds,
            executionRevision,
          );
        }
        if (isCurrentOperation(generation)) {
          if (
            nextResult.status === 'pass' &&
            persisted.updated.lessons[lesson.id]?.currentComplete === true
          ) {
            await navigate('completion');
          } else {
            setDrawerMode('feedback');
          }
        }
      } catch (error: unknown) {
        if (isCurrentOperation(generation)) {
          if (error instanceof StaleExecutionError) setDrawerMode(undefined);
          setOperationError(
            error instanceof StaleExecutionError
              ? '編集中の内容が変わりました。最新のコードでもう一度判定してください。'
              : error instanceof ExecutionNotGradableError
                ? error.message
                : operationErrorMessage('validate'),
          );
        }
      } finally {
        if (isCurrentOperation(generation)) setOperation('idle');
      }
    })();
  };

  /** Feedback Drawerを閉じ、同じ画面の関連Slide Drawerへ切り替える。 */
  const review = (slideId: string): void => {
    if (!lease.isWritable()) return;
    setDrawerMode(undefined);
    setRelatedSlideId(slideId);
  };

  /** 次のHintを開示し、単一Drawer SlotをHintへ切り替える。 */
  const revealNextHint = (): void => {
    if (!lease.isWritable()) return;
    controller.revealNextHint();
    setDrawerMode('hint');
  };

  /** Structured Stepと対象Fileを同じ操作で現在地へ揃える。 */
  const selectStep = (stepId: string): void => {
    if (!lease.isWritable()) return;
    const step = exercise.steps.find(({ id }) => id === stepId);
    if (step === undefined) return;
    setActiveStepId(step.id);
    if (state.selectedFile !== step.file) controller.selectFile(step.file);
  };

  /** 関連Slideを閉じた次frameでEditorへFocusを戻す。 */
  const closeRelatedSlide = (): void => {
    setRelatedSlideId(undefined);
    setRestoreEditorFocus(true);
  };

  /** 全Starter復元を保存・Previewへ直列化し、失敗時も復元済みstateを保持する。 */
  const resetToStarter = (): void => {
    if (!lease.isWritable() || busy || !canReset) return;
    resetInFlightRef.current = true;
    const generation = beginOperation();
    setOperation('reset');
    setOperationError(undefined);
    setDrawerMode(undefined);
    setRelatedSlideId(undefined);
    setActiveStepId(exercise.steps[0]?.id);

    let changed: boolean;
    try {
      changed = controller.resetToStarter();
    } catch (error: unknown) {
      resetInFlightRef.current = false;
      learningRuntimeServices.notices.reportError('exercise-save', error);
      setOperationError('最初のコードに戻せませんでした。編集内容はそのまま残っています。');
      setOperation('idle');
      return;
    }
    if (!changed) {
      resetInFlightRef.current = false;
      setResetOpen(false);
      setOperation('idle');
      return;
    }
    setResetOpen(false);

    void (async () => {
      try {
        let saveFailed = false;
        try {
          await controller.flush();
        } catch {
          saveFailed = true;
          if (isCurrentOperation(generation)) {
            setOperationError('最初のコードには戻りましたが、自動保存を完了できませんでした。');
          }
        }
        if (!isCurrentOperation(generation)) return;

        const frame = previewFrameRef.current;
        if (frame === undefined && controller.environment.mode !== 'console') {
          setPreviewNeedsPrepare(true);
          if (!saveFailed) setOperationError(previewPreparationErrorMessage());
          return;
        }
        try {
          await controller.previewNow();
          if (isCurrentOperation(generation)) {
            setPreviewNeedsPrepare(false);
            learningRuntimeServices.notices.dismiss('error:exercise-preview');
          }
        } catch (error: unknown) {
          if (isCurrentOperation(generation) && !(error instanceof StaleExecutionError)) {
            setPreviewNeedsPrepare(true);
            learningRuntimeServices.notices.reportError('exercise-preview', error);
            if (!saveFailed) {
              setOperationError('最初のコードに戻しました。プレビューだけ更新できませんでした。');
            }
          }
        }
      } finally {
        resetInFlightRef.current = false;
        if (isCurrentOperation(generation)) {
          setOperation('idle');
          setRestoreEditorFocus(true);
        }
      }
    })();
  };

  if (initialization === 'loading') {
    return <p role="status">演習を準備しています</p>;
  }
  if (initialization === 'error') {
    return (
      <div role="alert">
        <WorkshopNotice tone="correction" title="演習を準備できませんでした">
          <p>端末の保存領域を確認して、もう一度試してください。</p>
        </WorkshopNotice>
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 inline-flex min-h-11 items-center rounded-workshop-md bg-workshop-primary px-5 py-3 font-bold text-workshop-on-primary"
        >
          もう一度準備する
        </button>
      </div>
    );
  }

  return (
    <LearningViewportShell
      label="コード演習"
      header={
        <LearningToolRail coursePath={`/courses/${course.id}`} lessonTitle={lesson.title}>
          <SaveStatus status={state.saveStatus} />
        </LearningToolRail>
      }
      pager={
        <div className="tc-exercise-pager">
          {operationError !== undefined ? (
            <p role="alert" className="tc-exercise-operation-error">
              {operationError}
            </p>
          ) : null}
          <div className="tc-exercise-pager-actions">
            <button
              ref={hintTriggerRef}
              type="button"
              disabled={busy}
              onClick={() => {
                statusReturnFocusRef.current = hintTriggerRef.current;
                setDrawerMode('hint');
              }}
              className="tc-exercise-pager-secondary"
            >
              ヒントを見る
            </button>
            {result !== undefined ? (
              <button
                ref={feedbackTriggerRef}
                type="button"
                disabled={busy}
                onClick={() => {
                  statusReturnFocusRef.current = feedbackTriggerRef.current;
                  setDrawerMode('feedback');
                }}
                className="tc-exercise-pager-secondary"
              >
                判定結果を見る
              </button>
            ) : null}
            <button
              type="button"
              disabled={busy}
              onClick={updatePreview}
              className="tc-exercise-pager-secondary"
            >
              {operation === 'preview'
                ? previewNeedsPrepare
                  ? '再準備しています'
                  : '更新しています'
                : previewNeedsPrepare
                  ? 'プレビューを再準備'
                  : 'プレビューを更新'}
            </button>
            <button
              ref={validateTriggerRef}
              type="button"
              disabled={busy}
              onClick={validate}
              className="tc-exercise-pager-primary"
            >
              {operation === 'validate' ? '判定しています' : '判定する'}
            </button>
            {controller.environment.mode === 'console' && busy ? (
              <button
                type="button"
                className="tc-exercise-pager-secondary"
                onClick={() => {
                  const generation = beginOperation();
                  void controller
                    .stop()
                    .then(() => {
                      if (isCurrentOperation(generation))
                        setOperationError('実行を停止しました。採点していません。');
                    })
                    .catch(() => {
                      if (isCurrentOperation(generation))
                        setOperationError(
                          controller.environment.backend === 'local'
                            ? '停止を確認できません。Dockerと学習モードを確認してください。'
                            : '停止を確認できません。編集内容を保存して画面を開き直してください。',
                        );
                    })
                    .finally(() => {
                      if (isCurrentOperation(generation)) setOperation('idle');
                    });
                }}
              >
                実行を停止
              </button>
            ) : null}
          </div>
        </div>
      }
    >
      <div className="tc-exercise-stage-stack">
        <div className="tc-exercise-workspace">
          <aside className="tc-exercise-instructions" aria-label="工程票" tabIndex={0}>
            <header className="tc-exercise-instruction-title">
              <p>コード演習</p>
              <p aria-label="実行環境">
                {controller.environment.backend === 'browser'
                  ? controller.environment.mode === 'console'
                    ? 'ブラウザで実行（Console専用）'
                    : 'ブラウザで実行'
                  : `ローカル Node.js${state.executionResult?.engineVersion ? ` ${state.executionResult.engineVersion}` : ''}で実行`}
              </p>
              {state.executionResult !== undefined &&
              state.executionResult.executionRevision === state.executionRevision ? (
                <p role="status">
                  {state.executionResult.status === 'succeeded'
                    ? '実行できました（合否は「判定する」で確認）'
                    : state.executionResult.status === 'type-error'
                      ? '型を確認してください。まだ実行・採点していません。'
                      : state.executionResult.status === 'unsupported'
                        ? 'この環境では未対応です。採点していません。'
                        : state.executionResult.status === 'stopped'
                          ? '実行を停止しました。採点していません。'
                          : state.executionResult.status === 'system-error'
                            ? '実行環境で問題が起きました。採点していません。'
                            : 'コードのエラーを確認してください。'}
                </p>
              ) : null}
              <h1>{exercise.title}</h1>
            </header>
            {lesson.completion.kind === 'standard' &&
            !lesson.completion.requiredExerciseIds.includes(exercise.id) ? (
              <details open className="tc-exercise-project-brief">
                <summary>追加練習の説明とルール</summary>
                <div>
                  <SlideBlocks
                    blocks={exercise.instructions}
                    assets={exercise.assets}
                    baseUrl={import.meta.env.BASE_URL}
                  />
                </div>
              </details>
            ) : null}
            {lesson.kind !== 'standard' ? (
              <details className="tc-exercise-project-brief">
                <summary>制作ブリーフと工程ガイド</summary>
                <div>
                  <SlideBlocks
                    blocks={lesson.project.brief}
                    assets={exercise.assets}
                    baseUrl={import.meta.env.BASE_URL}
                  />
                  <SlideBlocks
                    blocks={lesson.project.guide}
                    assets={exercise.assets}
                    baseUrl={import.meta.env.BASE_URL}
                  />
                </div>
              </details>
            ) : null}
            <ExerciseInstructionPane
              steps={exercise.steps}
              activeStepId={viewState.activeStepId}
              onStepChange={selectStep}
              fallbackInstructions={exercise.instructions}
              fallbackAssets={exercise.assets}
              baseUrl={import.meta.env.BASE_URL}
            />
          </aside>

          <div
            data-testid="code-workspace"
            className="tc-exercise-editor"
            aria-busy={operation === 'reset'}
            inert={operation === 'reset'}
          >
            <Suspense fallback={<p role="status">エディターを準備しています</p>}>
              <LazyCodeWorkspace
                adapter={editor}
                files={workspaceFiles}
                languages={Object.fromEntries(
                  exercise.files.map(({ path, language }) => [path, language]),
                )}
                selectedFile={viewState.activeFilePath}
                contentRevision={state.executionRevision}
                cursors={state.cursors}
                diagnostics={state.diagnostics}
                editorFocusRequestId={viewState.editorFocusRequestId}
                headerAction={
                  <button
                    ref={resetTriggerRef}
                    type="button"
                    disabled={!canReset || busy}
                    className="inline-flex min-h-11 items-center rounded-workshop-sm border border-workshop-border bg-workshop-surface px-3 py-2 text-sm font-black text-workshop-muted transition-colors duration-[var(--tc-motion-fast)] hover:bg-workshop-raised disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() => {
                      // 確認画面を開く操作は保存しない。実際のResetは再検証後のleaseで囲う。
                      if (canReset && !busy) setResetOpen(true);
                    }}
                  >
                    最初に戻す
                  </button>
                }
                onChange={(path, content) => {
                  if (!lease.isWritable() || resetInFlightRef.current) return undefined;
                  return controller.edit(path, content);
                }}
                onCursorChange={(path, cursor) => {
                  if (!lease.isWritable() || resetInFlightRef.current) return;
                  controller.setCursor(path, cursor);
                }}
                onSelectedFileChange={(path) => {
                  if (!lease.isWritable() || resetInFlightRef.current) return;
                  controller.selectFile(path);
                }}
              />
            </Suspense>
          </div>

          <div className="tc-exercise-preview">
            <div data-testid="runtime-preview-frame">
              {controller.environment.mode === 'console' ? (
                <div>
                  <p>
                    {controller.environment.backend === 'local'
                      ? '編集後に「プレビューを更新」でNode.jsを実行します。Docker切断時は学習モードを再起動し、もう一度実行してください。'
                      : 'script.jsを編集するとConsoleを更新します。配列・オブジェクトの添字と有限のPromise処理に対応します。HTML/CSSの描画・DOM・タイマー・外部通信は使えません。'}
                  </p>
                  <RuntimeConsole
                    records={(state.runtimeOutput?.console ?? []).slice(0, 200)}
                    freshness={state.runtimeOutput?.freshness ?? 'current'}
                  />
                  {(state.runtimeOutput?.console.length ?? 0) > 200 ? (
                    <p>表示は先頭200行までです。出力を減らして再実行してください。</p>
                  ) : null}
                </div>
              ) : (
                <PreviewFrame
                  key={`${course.id}:${exercise.id}`}
                  onReady={preparePreview}
                  consoleEnabled={exercise.runtime?.kind === 'javascript'}
                  primaryOutput={exercise.runtime?.primaryOutput ?? 'preview'}
                  consoleRecords={state.runtimeOutput?.console ?? []}
                  consoleFreshness={state.runtimeOutput?.freshness ?? 'current'}
                  {...(state.runtimeOutput === undefined
                    ? {}
                    : { consoleUpdateSequence: state.runtimeOutput.updateSequence })}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      <div data-testid="validation-feedback">
        <ExerciseStatusDrawer
          mode={viewState.drawerMode}
          result={result}
          hints={exercise.hints}
          revealedHintIds={state.revealedHintIds}
          placement="side"
          busy={busy}
          returnFocusRef={statusReturnFocusRef}
          onClose={() => {
            setDrawerMode(undefined);
          }}
          onRevealNextHint={revealNextHint}
          onReviewSlide={review}
          onResolveCodeError={() => {
            setDrawerMode(undefined);
            setEditorFocusRequestId((current) => current + 1);
          }}
          onRetrySystemError={() => {
            setDrawerMode(undefined);
            validate();
          }}
        />
      </div>

      <LearningDrawer
        open={resetOpen}
        title="最初のコードに戻しますか？"
        placement="bottom"
        initialFocusRef={resetCancelRef}
        returnFocusRef={resetTriggerRef}
        onClose={() => {
          if (!busy) setResetOpen(false);
        }}
      >
        <div className="space-y-4">
          <p className="text-workshop-muted">
            現在の編集内容と全ファイルを演習開始時のコードへ戻します。開示したヒントと判定結果も消えます。
          </p>
          <div className="flex flex-wrap justify-end gap-3">
            <button
              ref={resetCancelRef}
              type="button"
              disabled={busy}
              className="inline-flex min-h-11 items-center justify-center rounded-workshop-sm border border-workshop-border bg-workshop-surface px-4 py-2 font-black text-workshop-muted disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => {
                setResetOpen(false);
              }}
            >
              編集を続ける
            </button>
            <button
              type="button"
              disabled={busy || !canReset || !lease.isWritable()}
              className="inline-flex min-h-11 items-center justify-center rounded-workshop-sm bg-workshop-correction px-4 py-2 font-black text-workshop-on-primary disabled:cursor-not-allowed disabled:opacity-50"
              onClick={resetToStarter}
            >
              最初のコードに戻す
            </button>
          </div>
        </div>
      </LearningDrawer>

      <LearningDrawer
        open={relatedSlide !== undefined}
        title={relatedSlide === undefined ? '関連スライド' : `関連スライド：${relatedSlide.title}`}
        placement="side"
        onClose={closeRelatedSlide}
      >
        {relatedSlide !== undefined ? (
          <div className="tc-exercise-related-slide">
            <p>コードと判定履歴を保ったまま、直前の説明を確認できます。</p>
            <div>
              <SlideCodeReference
                slide={workspaceLessons
                  .find(({ slides }) => slides.some(({ id }) => id === relatedSlide.id))
                  ?.slides.find(({ id }) => id === relatedSlide.codeReferenceSlideId)}
                baseUrl={import.meta.env.BASE_URL}
              />
              <SlideBlocks
                key={relatedSlide.id}
                blocks={relatedSlide.blocks}
                assets={relatedSlide.assets}
                baseUrl={import.meta.env.BASE_URL}
              />
            </div>
            <button type="button" onClick={closeRelatedSlide} className="tc-exercise-pager-primary">
              演習へ戻る
            </button>
          </div>
        ) : null}
      </LearningDrawer>
    </LearningViewportShell>
  );
}
