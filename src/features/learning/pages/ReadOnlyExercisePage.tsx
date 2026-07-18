/** 編集不能端末向けにPC案内または現在合格済みのsandbox Previewを表示する。 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { CourseManifest, Exercise, Lesson } from '../../../core/content/types';
import type { ExerciseDraft } from '../../../core/persistence/contracts';
import { findWorkspaceTargets } from '../../../core/persistence/progressUpdates';
import type { ReadOnlyPreviewAdapter, ResolvedPreviewAsset } from '../../../core/runtime/contracts';
import { StackedCard } from '../../../design-system/components/StackedCard';
import { WorkshopNotice } from '../../../design-system/components/WorkshopNotice';
import { resolvePublicAsset } from '../../../shared/lib/resolvePublicAsset';
import { PreviewFrame } from '../components';
import { learningRuntimeServices } from '../runtimeServices';

interface ReadOnlyExercisePageProps {
  readonly course: CourseManifest;
  readonly lesson: Lesson;
  readonly exercise: Exercise;
}

type PassingSnapshot = ExerciseDraft['lastPassingSnapshots'][string];
type ReadOnlyState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'guide' }
  | {
      readonly kind: 'preview';
      readonly snapshot: PassingSnapshot;
      readonly preview: ReadOnlyPreviewAdapter;
      readonly generation: number;
    }
  | { readonly kind: 'error' };

type ClipboardState = 'idle' | 'copying' | 'success' | 'error';

/** workspace全工程のAssetをIDで重複排除し、定義衝突を明示的に拒否する。 */
function resolveWorkspaceAssets(
  course: CourseManifest,
  exercise: Exercise,
): readonly ResolvedPreviewAsset[] {
  const byId = new Map<string, ResolvedPreviewAsset>();
  for (const asset of findWorkspaceTargets(course, exercise.id).flatMap(
    ({ exercise: target }) => target.assets,
  )) {
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

/** Clipboard APIの欠落・拒否を呼出側が扱えるPromiseへ正規化する。 */
async function copyCurrentUrl(): Promise<void> {
  const clipboard: unknown = Reflect.get(navigator, 'clipboard');
  if (typeof clipboard !== 'object' || clipboard === null) {
    throw new Error('Clipboard API is unavailable');
  }
  const writeText: unknown = Reflect.get(clipboard, 'writeText');
  if (typeof writeText !== 'function') throw new Error('Clipboard API is unavailable');
  await Reflect.apply(writeText, clipboard, [window.location.href]);
}

/** 小画面ではEditorを起動せず、完了済みDraftだけをread-only Previewへ接続する。 */
export function ReadOnlyExercisePage({ course, lesson, exercise }: ReadOnlyExercisePageProps) {
  const [state, setState] = useState<ReadOnlyState>({ kind: 'loading' });
  const [clipboardState, setClipboardState] = useState<ClipboardState>('idle');
  const [attempt, setAttempt] = useState(0);
  const lifecycleGenerationRef = useRef(0);
  const previewOperationsRef = useRef(new WeakMap<ReadOnlyPreviewAdapter, Promise<void>>());
  const previewDisposalsRef = useRef(new WeakMap<ReadOnlyPreviewAdapter, Promise<void>>());
  const resolvedAssets = useMemo(
    () => resolveWorkspaceAssets(course, exercise),
    [course, exercise],
  );
  const previewViewport = exercise.previewViewports[0];
  const previewViewportId = previewViewport?.id;
  const runWithPreview = useCallback(
    (preview: ReadOnlyPreviewAdapter, operation: () => Promise<void>): Promise<void> => {
      const previous = previewOperationsRef.current.get(preview) ?? Promise.resolve();
      const result = previous.then(operation);
      previewOperationsRef.current.set(
        preview,
        result.then(
          () => undefined,
          () => undefined,
        ),
      );
      return result;
    },
    [],
  );
  const disposePreview = useCallback((preview: ReadOnlyPreviewAdapter): Promise<void> => {
    const current = previewDisposalsRef.current.get(preview);
    if (current !== undefined) return current;
    const pendingOperation = previewOperationsRef.current.get(preview) ?? Promise.resolve();
    const disposal = pendingOperation.then(() => preview.dispose());
    previewDisposalsRef.current.set(preview, disposal);
    return disposal;
  }, []);

  useEffect(() => {
    const abortController = new AbortController();
    lifecycleGenerationRef.current += 1;
    const generation = lifecycleGenerationRef.current;
    let preview: ReadOnlyPreviewAdapter | undefined;
    void (async () => {
      try {
        await learningRuntimeServices.ready;
        const [progress, draft] = await Promise.all([
          learningRuntimeServices.repository.getCourse(course.id),
          learningRuntimeServices.repository.getDraft(course.id, exercise.workspaceId),
        ]);
        const snapshot = draft?.lastPassingSnapshots[exercise.id];
        const completed =
          !learningRuntimeServices.passFreshness.isDirty(
            course.id,
            exercise.workspaceId,
            exercise.id,
          ) &&
          progress?.lessons[lesson.id]?.passedExerciseIds.includes(exercise.id) === true &&
          snapshot?.contentRevision === course.revision &&
          snapshot.editRevision === draft?.editRevision;
        if (abortController.signal.aborted || lifecycleGenerationRef.current !== generation) {
          return;
        }
        if (!completed) {
          setState({ kind: 'guide' });
          return;
        }
        if (previewViewportId === undefined) {
          setState({ kind: 'error' });
          return;
        }
        preview = learningRuntimeServices.readOnlyPreviewRegistry.create(course.runnerId);
        setState({ kind: 'preview', snapshot, preview, generation });
      } catch {
        if (!abortController.signal.aborted && lifecycleGenerationRef.current === generation) {
          setState({ kind: 'error' });
        }
      }
    })();
    return () => {
      abortController.abort();
      if (lifecycleGenerationRef.current === generation) {
        lifecycleGenerationRef.current += 1;
      }
      if (preview !== undefined) void disposePreview(preview).catch(() => undefined);
    };
  }, [
    attempt,
    course.id,
    course.revision,
    course.runnerId,
    disposePreview,
    exercise.id,
    exercise.workspaceId,
    lesson.id,
    previewViewportId,
  ]);

  const handleCopy = useCallback((): void => {
    const generation = lifecycleGenerationRef.current;
    setClipboardState('copying');
    void copyCurrentUrl().then(
      () => {
        if (lifecycleGenerationRef.current !== generation) return;
        setClipboardState('success');
      },
      () => {
        if (lifecycleGenerationRef.current !== generation) return;
        setClipboardState('error');
      },
    );
  }, []);

  if (state.kind === 'error') {
    return (
      <div role="alert">
        <WorkshopNotice tone="correction" title="端末の進捗を読み込めませんでした">
          PC側のBundleから復元できます。元の端末データは変更していません。
        </WorkshopNotice>
        <button
          type="button"
          onClick={() => {
            setState({ kind: 'loading' });
            setClipboardState('idle');
            setAttempt((current) => current + 1);
          }}
          className="mt-4 inline-flex min-h-11 items-center rounded-workshop-md bg-workshop-primary px-5 py-3 font-bold text-workshop-on-primary"
        >
          もう一度確認する
        </button>
      </div>
    );
  }
  const transferGuidance = (
    <>
      <p className="mt-2 leading-7 text-workshop-muted">
        進捗は端末間で自動同期されません。端末データを書き出し、PCで読み込んでください。
      </p>
      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          disabled={clipboardState === 'copying'}
          onClick={handleCopy}
          className="inline-flex min-h-11 items-center rounded-workshop-md bg-workshop-primary px-5 py-3 font-bold text-workshop-on-primary disabled:opacity-60"
        >
          {clipboardState === 'copying' ? 'コピーしています' : 'この演習URLをコピー'}
        </button>
        <Link
          to="/?focus=device-data"
          className="inline-flex min-h-11 items-center rounded-workshop-md border-2 border-workshop-primary px-5 py-3 font-bold text-workshop-primary"
        >
          端末データを書き出す
        </Link>
      </div>
      {clipboardState === 'success' ? (
        <p role="status" className="mt-3 font-bold text-workshop-complete">
          演習URLをコピーしました
        </p>
      ) : null}
      {clipboardState === 'error' ? (
        <p role="alert" className="mt-3 font-bold text-workshop-correction">
          演習URLをコピーできませんでした。ブラウザのアドレス欄からコピーしてください。
        </p>
      ) : null}
    </>
  );

  /** 保存領域待ちの有無だけを変え、PC案内の寸法と主要文言を初回から安定させる。 */
  function renderGuide(checking: boolean) {
    return (
      <StackedCard
        as="article"
        className="mx-auto max-w-[var(--tc-content-reading)] bg-workshop-raised"
      >
        <p className="font-black text-workshop-complete">{exercise.title}</p>
        <h1 className="mt-2 text-3xl font-black">PCで演習を開く</h1>
        <WorkshopNotice tone="learning" title="コード編集はPCから利用できます" className="mt-5">
          <p className="leading-7">
            幅1024px以上で、マウスやトラックパッドを使える環境から開いてください。
          </p>
          <p
            role={checking ? 'status' : undefined}
            className="mt-2 min-h-6 text-sm font-bold text-workshop-muted"
          >
            {checking ? 'この端末の完成状態を確認しています' : null}
          </p>
          {transferGuidance}
        </WorkshopNotice>
      </StackedCard>
    );
  }
  if (state.kind === 'loading' || state.kind === 'guide') {
    return renderGuide(state.kind === 'loading');
  }

  const viewport = previewViewport!;
  const renderPreview = (frame: HTMLIFrameElement): void => {
    const generation = state.generation;
    void runWithPreview(state.preview, async () => {
      await state.preview.prepare(frame);
      if (lifecycleGenerationRef.current !== generation) return;
      await state.preview.render({
        exerciseSessionId: `${course.id}:${exercise.id}:readonly`,
        executionRevision: state.snapshot.editRevision,
        languageId: state.preview.languageId,
        files: state.snapshot.files,
        assets: resolvedAssets,
        viewport,
        options: { readOnly: true },
      });
    }).catch(() => {
      if (lifecycleGenerationRef.current === generation) {
        void disposePreview(state.preview).catch(() => undefined);
        setState({ kind: 'error' });
      }
    });
  };

  return (
    <section className="mx-auto w-full max-w-[var(--tc-content-workspace)]">
      <h1 className="text-3xl font-black">{exercise.title}の完成Preview</h1>
      <div data-testid="runtime-preview-frame" className="mt-6">
        <PreviewFrame sandboxMode="scriptless" onReady={renderPreview} />
      </div>
      <StackedCard as="section" className="mt-6 border-2 border-workshop-learning">
        <h2 className="text-xl font-black">PCで続きを編集する</h2>
        {transferGuidance}
      </StackedCard>
      <Link
        to={`/courses/${course.id}`}
        className="mt-6 inline-flex min-h-11 items-center font-bold underline"
      >
        コースマップへ戻る
      </Link>
    </section>
  );
}
