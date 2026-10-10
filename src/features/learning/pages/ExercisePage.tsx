/** 端末能力に応じて編集Runtimeまたは閲覧専用画面だけを遅延読込する。 */
import { lazy, Suspense, useSyncExternalStore } from 'react';
import { Link, useLoaderData } from 'react-router';
import type { exerciseLoader } from '../../../app/contentLoaders';
import { WorkspaceLeaseGate } from '../../progress/WorkspaceLeaseGate';
import { WorkshopNotice } from '../../../design-system/components/WorkshopNotice';
import { useEditingCapability } from '../../../shared/device/editingCapability';
import { learningRuntimeServices } from '../runtimeServices';
import { ReadOnlyExercisePage } from './ReadOnlyExercisePage';

const LazyProjectWorkspace = lazy(() =>
  import('../local/ProjectWorkspace').then((module) => ({ default: module.ProjectWorkspace })),
);

const LazyEditableExercisePage = lazy(() =>
  import('./EditableExercisePage').then((module) => ({
    default: module.EditableExercisePage,
  })),
);

/** 編集Runtimeの遅延読込中も、作業内容ではなく画面準備中だと明示する。 */
function ExerciseLoadingNotice() {
  return (
    <div role="status">
      <WorkshopNotice tone="neutral" title="演習画面を準備しています">
        コードエディターとプレビューの作業台を読み込んでいます。
      </WorkshopNotice>
    </div>
  );
}

/** 小画面ではCodeMirror moduleを評価せず、現在進捗に応じた案内を返す。 */
export function ExercisePage() {
  const data = useLoaderData<typeof exerciseLoader>();
  const canEdit = useEditingCapability();
  const persistenceHealth = useSyncExternalStore(
    learningRuntimeServices.progressService.subscribeHealth,
    learningRuntimeServices.progressService.getHealthSnapshot,
    learningRuntimeServices.progressService.getHealthSnapshot,
  );
  const showCoordinationWarning =
    persistenceHealth.kind === 'initializing' || persistenceHealth.kind === 'healthy';
  const sessionKey = `${data.course.id}:${data.course.revision}:${data.exercise.id}:${data.exercise.workspaceId}`;
  if (data.exercise.runtime?.kind === 'next' && import.meta.env.VITE_LOCAL_LEARNING !== '1') {
    return (
      <section className="mx-auto max-w-3xl px-4 py-6">
        <Link to="/" className="inline-flex min-h-11 items-center font-bold underline">
          学習一覧へ戻る
        </Link>
        <h1 className="my-4 text-2xl font-black">{data.exercise.title}</h1>
        <WorkshopNotice tone="neutral" title="この演習はLocal学習環境で実行します">
          Next.jsのpageとRoute
          HandlerはDocker内の実サーバーで確認します。Pagesでは説明と読書を提供し、実行・採点にはLocal学習環境が必要です。
        </WorkshopNotice>
        <ol className="mt-4 list-decimal space-y-3 pl-6">
          <li>
            「学習一覧へ戻る」から「この端末の学習データ」を開き、
            「全コースの進捗と下書きを書き出す」でJSONを保存します。
          </li>
          <li>
            <a
              className="font-bold underline"
              href="https://github.com/santa928/tsumucode#ローカルnodejs学習"
            >
              READMEのLocal起動手順
            </a>
            に沿ってDockerを起動し、リポジトリ直下で <code>./scripts/learn.sh</code>
            を実行します。READMEにある127.0.0.1の4173番のURLを開きます。
          </li>
          <li>
            Localの学習一覧で「書き出した学習データを読み込む」を選び、保存したJSONの
            差分を確認して「この内容を読み込む」を押します。「Next.jsの9教材を開く」から続けます。
          </li>
        </ol>
        <p className="mt-4">
          Source ZIPは制作物の持ち出し用です。進捗移行には端末データJSONを使います。
          Cookie・認証・Cookieによる保存は未対応です。
        </p>
      </section>
    );
  }
  if (!canEdit) {
    return (
      <div data-exercise-mode="read-only">
        <ReadOnlyExercisePage key={sessionKey} {...data} />
      </div>
    );
  }
  return (
    <div data-exercise-mode="editable">
      <WorkspaceLeaseGate
        key={sessionKey}
        courseId={data.course.id}
        workspaceId={data.exercise.workspaceId}
        coordinator={learningRuntimeServices.leaseCoordinator}
        showCoordinationWarning={showCoordinationWarning}
      >
        {(lease) => (
          <Suspense fallback={<ExerciseLoadingNotice />}>
            {data.exercise.runtime?.kind === 'next' ? (
              <LazyProjectWorkspace lessonData={data} access={lease} />
            ) : (
              <LazyEditableExercisePage {...data} lease={lease} />
            )}
          </Suspense>
        )}
      </WorkspaceLeaseGate>
    </div>
  );
}
