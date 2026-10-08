import { Link } from 'react-router';
import { nextWorkspace } from '../../../../scripts/local/next-project-protocol.mjs';
import { LearningViewportShell } from '../layout/LearningViewportShell';
import { LearningToolRail } from '../layout/LearningToolRail';
import type { ExerciseLoaderData } from '../../../app/contentLoaders';
import { exerciseRequirementIds } from '../../../core/content/exerciseRequirementIds';
import {
  recordDraftMutationFromIndex,
  recordValidationFromIndex,
} from '../../../core/persistence/progressUpdates';
import { registerReactEditorLanguage } from '../editor/reactEditorLanguage';
import { registerTypeScriptEditorLanguage } from '../editor/typescriptEditorLanguage';
import { SlideBlocks } from '../components/SlideBlocks';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import {
  LocalWorkspaceClient,
  workspacePreviewUrl,
} from '../../../adapters/runtime/local/LocalWorkspaceClient';
import {
  LOCAL_PROJECT,
  localProjectDescriptor,
} from '../../../core/persistence/localProjectDescriptor';
import { LeaseFenceRejectedError } from '../../../core/persistence/contracts';
import { useEditingCapability } from '../../../shared/device/editingCapability';
import { type WorkspaceLeaseAccess } from '../../progress/WorkspaceLeaseGate';
import { CodeWorkspace } from '../editor/CodeWorkspace';
import { createCodeMirrorEditor } from '../editor/createCodeMirrorEditor';
import { registerHtmlCssEditorLanguages } from '../editor/htmlCssEditorLanguages';
import { registerJavaScriptEditorLanguage } from '../editor/javascriptEditorLanguage';
import { learningRuntimeServices as services } from '../runtimeServices';
import { LocalProjectSession } from './LocalProjectSession';
import {
  projectCourseProgress,
  projectDraft,
  projectIsComplete,
  type ProjectIdentity,
} from './localProjectProgress';

const languages = {
  'index.html': 'html',
  'main.js': 'javascript',
  'message.js': 'javascript',
  'styles.css': 'css',
};
const buttonClass =
  'min-h-11 rounded-workshop-md border-2 border-workshop-ink px-4 py-2 font-bold disabled:opacity-50';
const stateLabels = {
  starting: '起動中',
  ready: '実行可能',
  applying: '変更を反映中',
  stopping: '停止中',
  stopped: '停止済み',
  failed: '実行失敗',
  idle: '操作がなく終了',
};

/** Vite代表課題とNext通常演習を同じ保存・Lease・実行Sessionへ接続する。 */
export function ProjectWorkspace({
  access,
  lessonData,
}: {
  readonly access: WorkspaceLeaseAccess;
  readonly lessonData?: ExerciseLoaderData;
}) {
  const identity = useMemo<ProjectIdentity>(
    () =>
      lessonData
        ? {
            courseId: lessonData.course.id,
            lessonId: lessonData.lesson.id,
            exerciseId: lessonData.exercise.id,
            workspaceId: lessonData.exercise.workspaceId,
            ruleId: lessonData.exercise.validationRules[0]!.id,
            requirementId: exerciseRequirementIds(lessonData.exercise)[0]!,
            revision: lessonData.course.revision,
            selectedFile: 'app/page.tsx',
            profile: 'next-project-v1',
          }
        : LOCAL_PROJECT,
    [lessonData],
  );
  const [session, setSession] = useState<LocalProjectSession>();
  const [loadError, setLoadError] = useState<string>();
  useEffect(() => {
    const abort = new AbortController();
    let current: LocalProjectSession | undefined;
    let unregister: (() => void) | undefined;
    void (async () => {
      await services.ready;
      if (!(await access.waitUntilWritable(abort.signal))) return;
      if (!lessonData)
        await services.contentMigrations.ensureStoredCourseDescriptor(localProjectDescriptor);
      const draft = await services.repository.getDraft(identity.courseId, identity.workspaceId);
      registerHtmlCssEditorLanguages(services.editorLanguageRegistry);
      await registerJavaScriptEditorLanguage(services.editorLanguageRegistry);
      if (lessonData) {
        await registerReactEditorLanguage(services.editorLanguageRegistry);
        await registerTypeScriptEditorLanguage(services.editorLanguageRegistry);
      }
      if (abort.signal.aborted) return;
      current = new LocalProjectSession(
        new LocalWorkspaceClient(identity.workspaceId, identity.profile),
        async (next) => {
          try {
            await access.runFencedWrite(async (_, proof) => {
              await services.runCourseProgressMutation(identity.courseId, async () => {
                const previous = await services.repository.getCourseVersioned(identity.courseId);
                let progress = lessonData
                  ? recordDraftMutationFromIndex(
                      previous.progress,
                      lessonData.course,
                      lessonData.lesson,
                      lessonData.exercise,
                      next,
                    )
                  : projectCourseProgress(next, previous.progress);
                const result = next.validationHistory.at(-1);
                if (lessonData && result?.executionRevision === next.editRevision) {
                  progress = recordValidationFromIndex(
                    progress,
                    lessonData.course,
                    lessonData.lesson,
                    lessonData.exercise,
                    result,
                  );
                }
                progress ??= {
                  courseId: identity.courseId,
                  contentRevision: identity.revision,
                  lessons: {},
                  currentComplete: false,
                  updatedAt: next.updatedAt,
                };
                await services.repository.putDraftAndCourseFenced(
                  next,
                  progress,
                  proof,
                  previous.version,
                );
              });
            });
          } catch (error: unknown) {
            if (error instanceof LeaseFenceRejectedError)
              services.progressService.retainEmergencyDraft(next);
            throw error;
          }
        },
        access.isWritable,
        draft ??
          (lessonData
            ? projectDraft(
                Object.fromEntries(
                  lessonData.exercise.files.map((file) => [file.path, file.content]),
                ),
                identity,
              )
            : undefined),
        identity,
      );
      if (!draft && lessonData) await current.flushDraft();
      abort.signal.throwIfAborted();
      const retained = current;
      unregister = access.registerBeforeYield(({ revalidating }) => {
        return revalidating ? retained.flushDraft() : retained.quiesce();
      });
      setSession(current);
    })().catch((error: unknown) => {
      if (!abort.signal.aborted)
        setLoadError(error instanceof Error ? error.message : '下書きを読み込めません。');
    });
    return () => {
      abort.abort();
      unregister?.();
      if (current) void current.dispose().catch(() => {});
    };
  }, [access, identity, lessonData]);

  if (loadError)
    return (
      <p role="alert">
        下書きを読み込めません。{loadError} 端末データを書き出してから再確認してください。
      </p>
    );
  if (!session) return <p role="status">端末の下書きを準備しています。</p>;
  return (
    <ProjectEditor session={session} access={access} identity={identity} lessonData={lessonData} />
  );
}

function ProjectEditor({
  session,
  access,
  identity,
  lessonData,
}: {
  readonly identity: ProjectIdentity;
  readonly lessonData: ExerciseLoaderData | undefined;
  readonly session: LocalProjectSession;
  readonly access: WorkspaceLeaseAccess;
}) {
  const [previewPath, setPreviewPath] = useState('');
  const previewContract = lessonData ? nextWorkspace(identity.workspaceId) : undefined;
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const adapter = useMemo(() => createCodeMirrorEditor(services.editorLanguageRegistry), []);
  const editing = useEditingCapability() && access.isWritable();
  const { draft, run, saved, busy, connected, error, result } = snapshot;
  const active =
    run !== undefined && ['starting', 'ready', 'applying', 'stopping'].includes(run.state);
  const preview =
    run &&
    ['ready', 'applying'].includes(run.state) &&
    connected &&
    (!lessonData || !['apply', 'stop'].includes(busy ?? ''))
      ? workspacePreviewUrl(run)
      : undefined;
  const disabled = busy !== undefined || !editing;
  const invoke = (operation: () => Promise<void>) => {
    void operation().catch(() => {});
  };

  useEffect(() => {
    // Reload/タブ終了は待機できないため、同じrunだけを停止し、保存は既存debounceも併用する。
    const leave = () => {
      void session.dispose().catch(() => {});
    };
    window.addEventListener('pagehide', leave);
    return () => {
      window.removeEventListener('pagehide', leave);
    };
  }, [session]);

  const workspace = (
    <>
      {lessonData ? (
        <section aria-label="工程票" className="mb-4">
          <h1 className="text-2xl font-black">{lessonData.exercise.title}</h1>
          <SlideBlocks
            blocks={lessonData.exercise.instructions}
            assets={lessonData.exercise.assets}
            baseUrl={import.meta.env.BASE_URL}
          />
          <details className="mt-3">
            <summary>ヒントを見る</summary>
            {lessonData.exercise.hints.map((hint) => (
              <details
                key={hint.id}
                open={draft?.revealedHintIds.includes(hint.id)}
                onToggle={(event) => {
                  if (event.currentTarget.open) session.revealHint(hint.id);
                }}
              >
                <summary>{hint.title}</summary>
                <p>{hint.text}</p>
              </details>
            ))}
          </details>
        </section>
      ) : null}
      {!editing ? (
        <p role="status" className="my-4 font-bold">
          編集と実行には幅1024px以上でマウスを使える画面が必要です。下書きは読み取りできます。
        </p>
      ) : null}
      <div className="my-5 flex flex-wrap gap-3" aria-label="実サーバーの操作">
        <button
          type="button"
          className={buttonClass}
          disabled={disabled}
          onClick={() => {
            invoke(session.connect);
          }}
        >
          {snapshot.conflict ? '保存版を再取得' : connected ? '環境へ再接続' : '環境へ接続'}
        </button>
        <button
          type="button"
          className={buttonClass}
          disabled={disabled || !connected || !draft || snapshot.conflict}
          onClick={() => {
            invoke(session.save);
          }}
        >
          下書きをSourceへ保存
        </button>
        <button
          type="button"
          className={buttonClass}
          disabled={
            disabled || !connected || !draft || active || snapshot.conflict || run?.cleanupPending
          }
          onClick={() => {
            invoke(session.start);
          }}
        >
          保存して起動
        </button>
        <button
          type="button"
          className={buttonClass}
          disabled={disabled || !connected || run?.state !== 'ready' || snapshot.conflict}
          onClick={() => {
            invoke(session.apply);
          }}
        >
          保存して実行へ反映
        </button>
        <button
          type="button"
          className={buttonClass}
          disabled={!editing || !session.canGrade()}
          onClick={() => {
            invoke(session.grade);
          }}
        >
          実サーバーで判定
        </button>
        <button
          type="button"
          className={buttonClass}
          disabled={!editing || busy === 'stop' || (!active && busy !== 'start')}
          onClick={() => {
            invoke(session.stop);
          }}
        >
          停止
        </button>
      </div>
      <div
        role="status"
        aria-live="polite"
        className="mb-4 rounded-workshop-md bg-workshop-raised p-4"
      >
        <p className="font-bold">
          実行状態:{' '}
          {run
            ? lessonData && busy === 'apply'
              ? stateLabels.applying
              : stateLabels[run.state]
            : '未起動'}
          {busy === 'grade' ? '（採点中）' : ''}
          {!connected && error ? '・通信失敗' : ''}
        </p>
        <p>{snapshot.message}</p>
        <p>
          端末の下書き: {snapshot.draftSaved ? '保存済み' : '保存待ち'} / Source保存版:{' '}
          {saved?.sourceRevision ?? '未保存'} / 実行へ反映した版: {run?.sourceRevision ?? 'なし'}
        </p>
        {run ? (
          <p className="break-all text-sm">
            Workspace: {identity.workspaceId} / run: {run.runId}
            {run.reason ? ` / 終了理由: ${run.reason}` : ''}
          </p>
        ) : null}
        {draft && projectIsComplete(draft, identity) ? (
          <p className="font-bold">この下書きの合格記録があります。</p>
        ) : null}
      </div>
      {error ? (
        <div role="alert" className="mb-4 border-2 border-workshop-correction p-4">
          <p>{error}</p>
          <p>
            下書きは自動で置き換えません。通信を確認して環境へ再接続してください。保存の競合時は保存版を再取得してから、下書きを保存・反映してください。
          </p>
          <button
            type="button"
            className={buttonClass}
            onClick={() => {
              invoke(session.flushDraft);
            }}
          >
            端末への保存を再試行
          </button>
        </div>
      ) : null}
      <p className="mb-3 text-sm">
        編集内容・Source保存版・実行への反映版が一致すると判定できます。未反映の編集はPreviewに表示されません。
      </p>
      <div className="grid gap-6 xl:grid-cols-2">
        <section aria-label="Projectのコード">
          {draft ? (
            <CodeWorkspace
              adapter={adapter}
              files={draft.files}
              languages={
                lessonData
                  ? Object.fromEntries(
                      lessonData.exercise.files.map((file) => [
                        file.path,
                        file.path.endsWith('.tsx') ? 'react' : file.language,
                      ]),
                    )
                  : languages
              }
              selectedFile={draft.selectedFile}
              contentRevision={draft.editRevision}
              readOnly={
                !editing ||
                (lessonData !== undefined &&
                  !lessonData.exercise.files.find((file) => file.path === draft.selectedFile)
                    ?.editable)
              }
              cursors={draft.cursors}
              diagnostics={result?.diagnostics ?? []}
              onChange={(path, content) => session.edit(path, content)}
              onCursorChange={(path, cursor) => {
                session.cursor(path, cursor);
              }}
              onSelectedFileChange={(path) => {
                session.select(path);
              }}
            />
          ) : (
            <p>環境へ接続すると、保存済みSourceまたは初期コードを開きます。</p>
          )}
        </section>
        <section aria-labelledby="local-project-preview-title">
          <h2 id="local-project-preview-title" className="mb-3 text-xl font-bold">
            実サーバーのPreview
          </h2>
          {lessonData && preview ? (
            <label className="mb-3 grid gap-2 font-bold">
              表示する応答
              <select
                className="min-h-11 rounded-workshop-sm border-2 border-workshop-ink px-3"
                value={previewPath}
                onChange={(event) => {
                  setPreviewPath(event.currentTarget.value);
                }}
              >
                {previewContract?.pages.map((path, index) => (
                  <option key={path} value={path}>
                    {previewContract.previewLabels[index]}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {preview ? (
            <iframe
              key={lessonData ? `${String(run?.runId)}:${String(run?.sourceRevision)}` : run?.runId}
              title={
                lessonData ? 'Next.jsの実サーバーPreview' : 'Local Vite Projectの実サーバーPreview'
              }
              src={lessonData ? preview + previewPath : preview}
              sandbox="allow-scripts allow-same-origin allow-forms"
              referrerPolicy="no-referrer"
              className="h-96 w-full border-2 border-workshop-ink bg-white"
            />
          ) : (
            <p>起動が完了すると、分離したrun専用originのPreviewを表示します。</p>
          )}
        </section>
      </div>
      {result ? (
        <section
          aria-labelledby="local-project-result"
          className="mt-5 rounded-workshop-md bg-workshop-raised p-4"
        >
          <h2 id="local-project-result" className="text-xl font-bold">
            判定結果:{' '}
            {result.status === 'pass'
              ? '合格'
              : result.status === 'code-error'
                ? 'コードエラー'
                : '未達成'}
          </h2>
          <p>{result.checks[0]?.message}</p>
          <p>期待する表示・応答: {result.checks[0]?.expected}</p>
          <p className="break-words">
            実際の表示: {result.checks[0]?.actual || '見出しを確認できませんでした。'}
          </p>
          {result.diagnostics.map((diagnostic, index) => (
            <p key={index}>{diagnostic.message}</p>
          ))}
        </section>
      ) : null}
    </>
  );
  if (!lessonData) return workspace;
  return (
    <LearningViewportShell
      label="Next.jsコード演習"
      header={
        <LearningToolRail
          coursePath={`/courses/${lessonData.course.id}`}
          lessonTitle={lessonData.lesson.title}
        >
          <span>実サーバーで学習</span>
        </LearningToolRail>
      }
      pager={
        <nav aria-label="演習の移動" className="flex flex-wrap gap-4 p-3 font-bold">
          <Link to="/" className="inline-flex min-h-11 items-center underline">
            学習一覧へ戻る
          </Link>
          <Link
            to={`/courses/${identity.courseId}/lessons/${identity.lessonId}/slides/${lessonData.lesson.slides.at(-1)!.id}`}
            className="inline-flex min-h-11 items-center underline"
          >
            説明を見直す
          </Link>
          {draft && projectIsComplete(draft, identity) ? (
            <Link
              to={`/courses/${identity.courseId}/lessons/${identity.lessonId}/exercises/${identity.exerciseId}/completion`}
              className="inline-flex min-h-11 items-center underline"
            >
              完了を確認する
            </Link>
          ) : null}
        </nav>
      }
    >
      {workspace}
    </LearningViewportShell>
  );
}
