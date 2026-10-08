import Link from 'next/link';

/** prefetchを使わず、移動後の待機・結果・再試行を観察する。 */
export default function Page() {
  return (
    <main>
      <h1 id="message">待機・失敗・対象なし</h1>
      <Link prefetch={false} href="/weather/clear">
        正常な応答
      </Link>
      <Link prefetch={false} href="/weather/slow">
        遅い応答
      </Link>
      <Link prefetch={false} href="/weather/flaky">
        一度失敗
      </Link>
      <Link prefetch={false} href="/weather/missing">
        対象なし
      </Link>
    </main>
  );
}
