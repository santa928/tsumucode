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
import { useNavigate } from 'react-router-dom';
import type { exerciseLoader } from '../../../app/contentLoaders';
import type { CourseManifest, Exercise } from '../../../core/content/types';
import { findSlideInCourse } from '../../../core/content/selectors';
import {
  findWorkspaceTargets,
  findWorkspaceValidationTargets,
  recordWorkspaceDraftMutation,
  recordWorkspaceValidation,
} from '../../../core/persistence/progressUpdates';
import { LeaseFenceRejectedError } from '../../../core/persistence/contracts';
import type { ResolvedPreviewAsset } from '../../../core/runtime/contracts';
import { ValidatorRuleEngine } from '../../../core/validation/validatorRuleEngine';
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
import { createCodeMirrorEditor } from '../editor/createCodeMirrorEditor';
import { registerHtmlCssEditorLanguages } from '../editor/htmlCssEditorLanguages';
import { LearningToolRail } from '../layout/LearningToolRail';
import { LearningViewportShell } from '../layout/LearningViewportShell';
import { LearningSessionController, StaleExecutionError, useLearningSession } from '../session';
import { learningRuntimeServices } from '../runtimeServices';

const LazyCodeWorkspace = lazy(() =>
  import('../editor/CodeWorkspace').then((module) => ({ default: module.CodeWorkspace })),
);

type ExerciseLoaderData = Awaited<ReturnType<typeof exerciseLoader>>;
type InitializationState = 'loading' | 'ready' | 'error';
type OperationState = 'idle' | 'preview' | 'validate' | 'reset';

interface ExerciseViewState {
  readonly activeFilePath: string;
  readonly activeStepId: string | undefined;
  readonly drawerMode: 'feedback' | 'hint' | undefined;
  readonly relatedSlideId: string | undefined;
  readonly editorFocusRequestId: number;
}

interface EditableSessionProps extends ExerciseLoaderData {
  readonly lease: WorkspaceLeaseAccess;
  readonly onRetry: () => void;
}

interface EditableExercisePageProps extends ExerciseLoaderData {
  readonly lease: WorkspaceLeaseAccess;
}

/** workspace全ExerciseのAssetをIDでunionし、異なる同一ID定義を拒否する。 */
function resolveWorkspaceAssets(
  course: CourseManifest,
  exercises: readonly Exercise[],
): readonly ResolvedPreviewAsset[] {
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
  const [attempt, setAttempt] = useState(0);
  return (
    <EditableSession
      key={attempt}
      {...data}
      lease={lease}
      onRetry={() => {
        setAttempt((current) => current + 1);
      }}
    />
  );
}

/** 単一attemptのController lifecycleと全学習操作を画面へ接続する。 */
function EditableSession({ course, lesson, exercise, lease, onRetry }: EditableSessionProps) {
  const navigate = useNavigate();
  const [initialization, setInitialization] = useState<InitializationState>('loading');
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
  const allWorkspaceTargets = useMemo(
    () => findWorkspaceTargets(course, exercise.id),
    [course, exercise.id],
  );
  const validationTargets = useMemo(
    () => findWorkspaceValidationTargets(course, exercise.id),
    [course, exercise.id],
  );
  const resolvedWorkspaceAssets = useMemo(
    () =>
      resolveWorkspaceAssets(
        course,
        allWorkspaceTargets.map(({ exercise: target }) => target),
      ),
    [allWorkspaceTargets, course],
  );
  const validator = useMemo(() => {
    if (
      course.validatorId === 'html-css' &&
      !learningRuntimeServices.validatorRegistry.has('html-css')
    ) {
      learningRuntimeServices.validatorRegistry.register(
        'html-css',
        () => new ValidatorRuleEngine(),
      );
    }
    return learningRuntimeServices.validatorRegistry.create(course.validatorId);
  }, [course.validatorId]);
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
                const invalidated = recordWorkspaceDraftMutation(
                  current.progress,
                  course,
                  allWorkspaceTargets,
                  draft,
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
        runner: learningRuntimeServices.runnerRegistry.create(course.runnerId),
        validator,
        now: () => new Date().toISOString(),
      }),
    [
      allWorkspaceTargets,
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
  const editor = useMemo(() => {
    registerHtmlCssEditorLanguages(learningRuntimeServices.editorLanguageRegistry);
    return createCodeMirrorEditor(learningRuntimeServices.editorLanguageRegistry);
  }, []);
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
      : findSlideInCourse(course, viewState.relatedSlideId).slide;

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
    void (async () => {
      try {
        await learningRuntimeServices.ready;
        await controller.initialize();
        if (!abortController.signal.aborted) {
          learningRuntimeServices.notices.dismiss('error:exercise-initialize');
          setInitialization('ready');
        }
      } catch (error: unknown) {
        learningRuntimeServices.notices.reportError('exercise-initialize', error);
        if (!abortController.signal.aborted) setInitialization('error');
      }
    })();
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
    (frame: HTMLIFrameElement, shouldPrepare: boolean): void => {
      const generation = beginOperation();
      setOperation('preview');
      setOperationError(undefined);
      void (async () => {
        try {
          if (shouldPrepare) {
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
              setOperationError(operationErrorMessage('preview'));
            }
          }
        } finally {
          if (isCurrentOperation(generation)) setOperation('idle');
        }
      })();
    },
    [beginOperation, controller, isCurrentOperation],
  );

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
    if (frame === undefined) {
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
              const updated = recordWorkspaceValidation(current.progress, course, progressBatch);
              const draft = await learningRuntimeServices.repository.getDraft(
                course.id,
                exercise.workspaceId,
              );
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
          setOperationError(
            error instanceof StaleExecutionError
              ? '編集中の内容が変わりました。最新のコードでもう一度判定してください。'
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
        if (frame === undefined) {
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
          </div>
        </div>
      }
    >
      <div className="tc-exercise-stage-stack">
        <div className="tc-exercise-workspace">
          <aside className="tc-exercise-instructions" aria-label="工程票" tabIndex={0}>
            <header className="tc-exercise-instruction-title">
              <p>コード演習</p>
              <h1>{exercise.title}</h1>
            </header>
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
                    disabled={!canReset || busy || !lease.isWritable()}
                    className="inline-flex min-h-11 items-center rounded-workshop-sm border border-workshop-border bg-workshop-surface px-3 py-2 text-sm font-black text-workshop-muted transition-colors duration-[var(--tc-motion-fast)] hover:bg-workshop-raised disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() => {
                      if (canReset && !busy && lease.isWritable()) setResetOpen(true);
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
              <PreviewFrame onReady={preparePreview} />
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
          returnFocusRef={statusReturnFocusRef}
          onClose={() => {
            setDrawerMode(undefined);
          }}
          onRevealNextHint={revealNextHint}
          onReviewSlide={review}
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
              <SlideBlocks
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
