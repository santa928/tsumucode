import { connection } from 'next/server';
import { dataUrl } from '../../data-url';

/** pageの再描画とデータの再取得を分けて観察する。 */
export default async function DataPage({ params }: { params: Promise<{ mode: string }> }) {
  await connection();
  const { mode } = await params;
  const options =
    mode === 'fresh'
      ? { cache: 'no-store' as const }
      : mode === 'cached'
        ? { cache: 'force-cache' as const }
        : { next: { revalidate: 1 } };
  const data = { readId: 1, label: '朝の森' };
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
