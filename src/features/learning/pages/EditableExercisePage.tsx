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
import {
  findWorkspaceTargets,
  findWorkspaceValidationTargets,
  recordWorkspaceDraftMutation,
  recordWorkspaceValidation,
} from '../../../core/persistence/progressUpdates';
import { LeaseFenceRejectedError } from '../../../core/persistence/contracts';
import type { ResolvedPreviewAsset } from '../../../core/runtime/contracts';
import { ValidatorRuleEngine } from '../../../core/validation/validatorRuleEngine';
import { StackedCard } from '../../../design-system/components/StackedCard';
import { WorkshopNotice } from '../../../design-system/components/WorkshopNotice';
import { resolvePublicAsset } from '../../../shared/lib/resolvePublicAsset';
import type { WorkspaceLeaseAccess } from '../../progress/WorkspaceLeaseGate';
import { FeedbackPanel, HintPanel, PreviewFrame, SaveStatus } from '../components';
import { SlideBlocks } from '../components/SlideBlocks';
import {
  createCodeMirrorEditor,
  registerHtmlCssEditorLanguages,
} from '../editor/createCodeMirrorEditor';
import { LearningSessionController, StaleExecutionError, useLearningSession } from '../session';
import { learningRuntimeServices } from '../runtimeServices';

const LazyCodeWorkspace = lazy(() =>
  import('../editor/CodeWorkspace').then((module) => ({ default: module.CodeWorkspace })),
);

type ExerciseLoaderData = Awaited<ReturnType<typeof exerciseLoader>>;
type InitializationState = 'loading' | 'ready' | 'error';
type OperationState = 'idle' | 'preview' | 'validate' | 'review';

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
function operationErrorMessage(operation: Exclude<OperationState, 'idle'>): string {
  switch (operation) {
    case 'preview':
      return 'プレビューを更新できませんでした。少し待ってからもう一度試してください。';
    case 'validate':
      return '判定を完了できませんでした。編集内容は残っています。もう一度試してください。';
    case 'review':
      return 'スライドの見直しを開けませんでした。もう一度試してください。';
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
  const mountedRef = useRef(true);
  const operationGenerationRef = useRef(0);
  const previewFrameRef = useRef<HTMLIFrameElement | undefined>(undefined);
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
  const editor = useMemo(() => {
    registerHtmlCssEditorLanguages(learningRuntimeServices.editorLanguageRegistry);
    return createCodeMirrorEditor(learningRuntimeServices.editorLanguageRegistry);
  }, []);
  const result = state.validationHistory.at(-1);
  const busy = operation !== 'idle';

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      operationGenerationRef.current += 1;
    };
  }, []);

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
    const generation = beginOperation();
    setOperation('validate');
    setOperationError(undefined);
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
        if (
          isCurrentOperation(generation) &&
          nextResult.status === 'pass' &&
          persisted.updated.lessons[lesson.id]?.currentComplete === true
        ) {
          await navigate('completion');
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

  /** 見直し復帰位置を保存してから関連Slideへ移動する。 */
  const review = (slideId: string): void => {
    if (!lease.isWritable()) return;
    const generation = beginOperation();
    setOperation('review');
    setOperationError(undefined);
    void (async () => {
      try {
        controller.openReview(slideId, window.scrollY);
        await controller.flush();
        if (isCurrentOperation(generation)) {
          learningRuntimeServices.notices.dismiss('error:exercise-save');
          await navigate(`review/${slideId}`);
        }
      } catch {
        if (isCurrentOperation(generation)) {
          setOperationError(operationErrorMessage('review'));
        }
      } finally {
        if (isCurrentOperation(generation)) setOperation('idle');
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
    <article className="mx-auto w-full max-w-[var(--tc-content-workspace)]">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-black text-workshop-complete">{lesson.title}</p>
          <h1 className="mt-2 text-3xl font-black md:text-5xl">{exercise.title}</h1>
        </div>
        <SaveStatus status={state.saveStatus} />
      </header>

      {lesson.kind !== 'standard' ? (
        <StackedCard
          as="section"
          aria-labelledby="project-brief-title"
          className="mt-7 bg-workshop-raised"
        >
          <h2 id="project-brief-title" className="text-2xl font-black">
            制作ブリーフ
          </h2>
          <div className="mt-4">
            <SlideBlocks
              blocks={lesson.project.brief}
              assets={exercise.assets}
              baseUrl={import.meta.env.BASE_URL}
            />
          </div>
          <details className="mt-5 rounded-workshop-md bg-workshop-surface p-4">
            <summary className="font-black">工程ガイドを見る</summary>
            <div className="mt-4">
              <SlideBlocks
                blocks={lesson.project.guide}
                assets={exercise.assets}
                baseUrl={import.meta.env.BASE_URL}
              />
            </div>
          </details>
        </StackedCard>
      ) : null}

      <StackedCard className="mt-7 bg-workshop-surface p-5 md:p-7">
        <SlideBlocks
          blocks={exercise.instructions}
          assets={exercise.assets}
          baseUrl={import.meta.env.BASE_URL}
        />
      </StackedCard>

      <section
        aria-label="コードとプレビューの作業台"
        className="mt-7 rounded-workshop-lg bg-workshop-workbench p-3 shadow-[var(--tc-shadow-piece)] md:p-5"
      >
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.08fr)_minmax(24rem,0.92fr)] xl:items-start">
          <div data-testid="code-workspace" className="min-w-0">
            <Suspense fallback={<p role="status">エディターを準備しています</p>}>
              <LazyCodeWorkspace
                adapter={editor}
                files={state.files}
                languages={Object.fromEntries(
                  exercise.files.map(({ path, language }) => [path, language]),
                )}
                selectedFile={state.selectedFile}
                cursors={state.cursors}
                diagnostics={state.diagnostics}
                onChange={(path, content) => {
                  if (!lease.isWritable()) return;
                  controller.edit(path, content);
                }}
                onCursorChange={(path, cursor) => {
                  if (!lease.isWritable()) return;
                  controller.setCursor(path, cursor);
                }}
                onSelectedFileChange={(path) => {
                  if (!lease.isWritable()) return;
                  controller.selectFile(path);
                }}
              />
            </Suspense>
          </div>

          <div className="min-w-0">
            <div data-testid="runtime-preview-frame">
              <PreviewFrame onReady={preparePreview} />
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              <button
                type="button"
                disabled={busy}
                onClick={updatePreview}
                className="inline-flex min-h-11 items-center justify-center rounded-workshop-md border-2 border-workshop-primary bg-workshop-surface px-5 py-3 font-bold text-workshop-primary disabled:opacity-60"
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
                type="button"
                disabled={busy}
                onClick={validate}
                className="inline-flex min-h-11 items-center justify-center rounded-workshop-md bg-workshop-primary px-5 py-3 font-bold text-workshop-on-primary shadow-[var(--tc-shadow-piece)] disabled:opacity-60"
              >
                {operation === 'validate' ? '判定しています' : '判定する'}
              </button>
            </div>
          </div>
        </div>
      </section>
      {operationError !== undefined ? (
        <div role="alert" className="mt-5">
          <WorkshopNotice tone="correction" title="操作を完了できませんでした">
            {operationError}
          </WorkshopNotice>
        </div>
      ) : null}

      <div data-testid="validation-feedback" className="mt-7">
        <FeedbackPanel
          result={result}
          onRevealNextHint={() => {
            if (!lease.isWritable()) return;
            controller.revealNextHint();
          }}
          onReviewSlide={review}
        />
      </div>
      <div className="mt-7">
        <HintPanel
          hints={exercise.hints}
          revealedHintIds={state.revealedHintIds}
          onRevealNext={() => {
            if (!lease.isWritable()) return;
            controller.revealNextHint();
          }}
        />
      </div>
    </article>
  );
}
