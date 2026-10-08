import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Link } from 'react-router';
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
import { WorkspaceLeaseGate, type WorkspaceLeaseAccess } from '../../progress/WorkspaceLeaseGate';
import { CodeWorkspace } from '../editor/CodeWorkspace';
import { createCodeMirrorEditor } from '../editor/createCodeMirrorEditor';
import { registerHtmlCssEditorLanguages } from '../editor/htmlCssEditorLanguages';
import { registerJavaScriptEditorLanguage } from '../editor/javascriptEditorLanguage';
import { learningRuntimeServices as services } from '../runtimeServices';
import { LocalProjectSession } from './LocalProjectSession';
import { projectCourseProgress, projectIsComplete } from './localProjectProgress';

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

function ProjectWorkspace({ access }: { readonly access: WorkspaceLeaseAccess }) {
  const [session, setSession] = useState<LocalProjectSession>();
  const [loadError, setLoadError] = useState<string>();
  useEffect(() => {
    const abort = new AbortController();
    let current: LocalProjectSession | undefined;
    let unregister: (() => void) | undefined;
    void (async () => {
      await services.ready;
      if (!(await access.waitUntilWritable(abort.signal))) return;
      await services.contentMigrations.ensureStoredCourseDescriptor(localProjectDescriptor);
      const draft = await services.repository.getDraft(
        LOCAL_PROJECT.courseId,
        LOCAL_PROJECT.workspaceId,
      );
      registerHtmlCssEditorLanguages(services.editorLanguageRegistry);
      await registerJavaScriptEditorLanguage(services.editorLanguageRegistry);
      if (abort.signal.aborted) return;
      current = new LocalProjectSession(
        new LocalWorkspaceClient(LOCAL_PROJECT.workspaceId),
        async (next) => {
          try {
            await access.runFencedWrite(async (_, proof) => {
              await services.runCourseProgressMutation(LOCAL_PROJECT.courseId, async () => {
                const previous = await services.repository.getCourseVersioned(
                  LOCAL_PROJECT.courseId,
                );
                await services.repository.putDraftAndCourseFenced(
                  next,
                  projectCourseProgress(next, previous.progress),
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
        draft,
      );
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
  }, [access]);

  if (loadError)
    return (
      <p role="alert">
        下書きを読み込めません。{loadError} 端末データを書き出してから再確認してください。
      </p>
    );
  if (!session) return <p role="status">端末の下書きを準備しています。</p>;
  return <ProjectEditor session={session} access={access} />;
}

function ProjectEditor({
  session,
  access,
}: {
  readonly session: LocalProjectSession;
  readonly access: WorkspaceLeaseAccess;
}) {
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const adapter = useMemo(() => createCodeMirrorEditor(services.editorLanguageRegistry), []);
  const editing = useEditingCapability() && access.isWritable();
  const { draft, run, saved, busy, connected, error, result } = snapshot;
  const active =
    run !== undefined && ['starting', 'ready', 'applying', 'stopping'].includes(run.state);
  const preview =
    run && ['ready', 'applying'].includes(run.state) && connected
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

  return (
    <>
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
          実行状態: {run ? stateLabels[run.state] : '未起動'}
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
            Workspace: {LOCAL_PROJECT.workspaceId} / run: {run.runId}
            {run.reason ? ` / 終了理由: ${run.reason}` : ''}
          </p>
        ) : null}
        {draft && projectIsComplete(draft) ? (
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
              languages={languages}
              selectedFile={draft.selectedFile}
              contentRevision={draft.editRevision}
              readOnly={!editing}
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
          {preview ? (
            <iframe
              key={run?.runId}
              title="Local Vite Projectの実サーバーPreview"
              src={preview}
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
          <p>期待する表示: こんにちは、実サーバー！</p>
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
}

/** Local buildからだけ到達する代表Project。正式Courseの仕様/Catalogは変更しない。 */
export function LocalProjectPage() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string>();
  useEffect(() => {
    let active = true;
    void services.ready.then(
      () => {
        if (active) setReady(true);
      },
      (cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : '端末保存を準備できません。');
      },
    );
    return () => {
      active = false;
    };
  }, []);
  return (
    <section aria-labelledby="local-project-title">
      <Link to="/" className="font-bold underline">
        学習一覧へ戻る
      </Link>
      <h1 id="local-project-title" className="mt-4 text-3xl font-black">
        実サーバーで見出しを変更する
      </h1>
      <p className="mt-3">
        message.js の message を「こんにちは、実サーバー！」に変え、実サーバーの可視 h1#message
        に表示してください。保存して起動し、変更を反映して判定します。
      </p>
      <p className="mt-3 text-sm">
        端末の下書き・進捗はこの画面のoriginに保存されます。controllerのSourceはDocker
        volumeへ別に保存されます。PagesとLocalでは保存先が異なるため、学習一覧の「端末データ」から既存JSONを書き出して移行してください。Pagesではこの実行画面を提供しません。
      </p>
      {error ? (
        <p role="alert">{error}</p>
      ) : !ready ? (
        <p role="status">端末の保存を準備しています。</p>
      ) : (
        <WorkspaceLeaseGate
          courseId={LOCAL_PROJECT.courseId}
          workspaceId={LOCAL_PROJECT.workspaceId}
          coordinator={services.leaseCoordinator}
        >
          {(access) => <ProjectWorkspace access={access} />}
        </WorkspaceLeaseGate>
      )}
    </section>
  );
}
