import type { Metadata } from 'next';
import Image from 'next/image';
import { projectBase } from './catalog';

export const metadata: Metadata = {
  title: '制作途中',
  description: '残席から選ぶ小さな読書会の案内です。',
};

export default function Page() {
  const base = projectBase();
  return (
    <main>
      <h1 id="message">読書会の案内</h1>
      <p>一覧から気になる項目の詳細を確かめます。</p>
      <Image src={base + '/banner.svg'} width={320} height={160} alt="山と太陽のある読書会のイラスト" unoptimized />
      <p>
        <a href={base + '/events'}>一覧を開く</a>
      </p>
    </main>
  );
}
