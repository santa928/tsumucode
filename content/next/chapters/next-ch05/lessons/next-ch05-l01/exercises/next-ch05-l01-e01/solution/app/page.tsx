import type { Metadata } from 'next';
import Image from 'next/image';
import { projectBase } from './catalog';

export const metadata: Metadata = {
  title: '小さな旅の案内',
  description: '屋外と室内から選ぶ小さな旅の案内です。',
};

export default function Page() {
  const base = projectBase();
  return (
    <main>
      <h1 id="message">小さな旅の案内</h1>
      <p>一覧から気になる項目の詳細を確かめます。</p>
      <Image src={base + '/banner.svg'} width={320} height={160} alt="山と太陽のある旅のイラスト" unoptimized />
      <p>
        <a href={base + '/trips'}>一覧を開く</a>
      </p>
    </main>
  );
}
