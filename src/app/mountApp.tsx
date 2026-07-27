/** 選択済みHash Routerを既存の#rootへ1回だけmountするComposition helper。 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import type { createAppRouter } from './router';

/** #rootを検証してTsumuCodeのReact treeをmountする。 */
export function mountApp(router: ReturnType<typeof createAppRouter>): void {
  const root = document.getElementById('root');
  if (root === null) throw new Error('TsumuCodeの描画先 #root が見つかりません。');

  createRoot(root).render(
    <StrictMode>
      <App router={router} />
    </StrictMode>,
  );
}
