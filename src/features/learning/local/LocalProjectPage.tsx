import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { LOCAL_PROJECT } from '../../../core/persistence/localProjectDescriptor';
import { WorkspaceLeaseGate } from '../../progress/WorkspaceLeaseGate';
import { learningRuntimeServices as services } from '../runtimeServices';
import { ProjectWorkspace } from './ProjectWorkspace';

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
