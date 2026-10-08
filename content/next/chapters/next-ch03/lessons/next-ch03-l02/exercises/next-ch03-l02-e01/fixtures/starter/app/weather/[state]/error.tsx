'use client';

/** 表示の再描画と、データの再取得を区別する。 */
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main>
      <h1 id="message">読み込み失敗</h1>
      <p>データを取得できませんでした。もう一度試してください。</p>
      <button type="button" onClick={reset}>
        再試行
      </button>
    </main>
  );
}
