/** #rootを前提に、Routerを1個だけ所有してReact treeをStrictModeでDOMへmountする。 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/app/App';
import { createAppRouter } from '@/app/router';
import '@/design-system/base.css';

const root = document.getElementById('root');
if (root === null) throw new Error('TsumuCodeの描画先 #root が見つかりません。');

const router = createAppRouter();
createRoot(root).render(
  <StrictMode>
    <App router={router} />
  </StrictMode>,
);
