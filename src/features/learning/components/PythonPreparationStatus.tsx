import type { ExecutionPreparationProgress } from '../../../core/runtime/contracts';

/** 取得量と段階を分け、取消できる待機とコード実行を混同しない案内。 */
export function PythonPreparationStatus({ progress }: { progress: ExecutionPreparationProgress }) {
  if (progress.stage === 'finished') return null;
  const message = {
    download: '固定実行環境を取得中。コードはまだ実行していません。',
    verify: '取得した固定実行環境を確認中。コードはまだ実行していません。',
    initialize: 'Python実行環境を初期化しています。',
    execute: 'Pythonコードを実行しています。',
  }[progress.stage];
  return (
    <section aria-label="Python実行環境の準備">
      <p role="status" aria-atomic="true">
        {message}
      </p>
      {progress.stage === 'download' || progress.stage === 'verify' ? (
        <>
          <progress aria-label="固定実行環境の取得と確認" />
          <p>{(progress.receivedBytes / (1024 * 1024)).toFixed(1)} MiB取得済み</p>
          <p>初回取得は最大90秒です。「実行を停止」で取り消せます。</p>
          <p>同じ演習では取得済み環境を再利用します。画面を開き直すと再取得します。</p>
        </>
      ) : null}
    </section>
  );
}
