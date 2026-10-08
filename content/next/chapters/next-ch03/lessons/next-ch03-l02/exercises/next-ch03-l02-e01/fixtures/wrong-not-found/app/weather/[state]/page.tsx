import { connection } from 'next/server';
import { notFound } from 'next/navigation';
import { dataUrl } from '../../data-url';

/** 制御データの状態を、待機・失敗・対象なしの画面へ対応させる。 */
export default async function WeatherPage({ params }: { params: Promise<{ state: string }> }) {
  await connection();
  const { state } = await params;
  const response = await fetch(dataUrl('weather', state), { cache: 'no-store' });
  if (!response.ok) throw new Error('教材データの読み込み失敗');
  const data = await response.json();
  return (
    <main>
      <h1 id="message">天気の記録</h1>
      <p id="weather">{data.label}</p>
    </main>
  );
}
