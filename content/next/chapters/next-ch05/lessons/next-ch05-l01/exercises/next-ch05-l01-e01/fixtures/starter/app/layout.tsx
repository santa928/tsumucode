import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { projectBase } from './catalog';
import './globals.css';

export const metadata: Metadata = {
  title: '小さな旅の案内',
  description: '一覧から詳細へ進む小さな旅の案内です。',
};

/** 共通ナビゲーションと日本語の文書を用意する。 */
export default function RootLayout({ children }: { children: ReactNode }) {
  const base = projectBase();
  return (
    <html lang="ja">
      <body>
        <nav aria-label="サイト内">
          <a href={base + '/'}>入口</a>
          <a href={base + '/trips'}>一覧</a>
        </nav>
        {children}
      </body>
    </html>
  );
}
