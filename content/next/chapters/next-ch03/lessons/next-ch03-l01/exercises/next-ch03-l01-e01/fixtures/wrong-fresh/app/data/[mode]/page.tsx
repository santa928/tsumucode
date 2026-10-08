import { connection } from 'next/server';
import { dataUrl } from '../../data-url';

/** pageの再描画とデータの再取得を分けて観察する。 */
export default async function DataPage({ params }: { params: Promise<{ mode: string }> }) {
  await connection();
  const { mode } = await params;
  const options =
    mode === 'fresh'
      ? { cache: 'force-cache' as const }
      : mode === 'cached'
        ? { cache: 'force-cache' as const }
        : { next: { revalidate: 1 } };
  const response = await fetch(dataUrl('sample', mode), options);
  if (!response.ok) throw new Error('教材データの読み込み失敗');
  const data = await response.json();
  return (
    <main>
      <h1 id="message">取得と保持: {mode}</h1>
      <p>
        取得番号: <output id="read-id">{data.readId}</output>
      </p>
      <p id="data-label">{data.label}</p>
    </main>
  );
}
