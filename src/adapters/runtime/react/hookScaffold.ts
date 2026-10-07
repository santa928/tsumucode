import { CONTROLLED_FORM_HTML } from './controlledFormScaffold';
import type { ReactProfile } from './compilerContract';

export const REF_MAIN = `import { createRoot } from 'react-dom/client';
import { App } from './components';
const container = document.getElementById('root');
if (!container) throw new Error('表示先がありません');
createRoot(container).render(<App />);
`;

export const REF_TYPES = `import type { ChangeEvent } from 'react';
export type InputChangeEvent = ChangeEvent<HTMLInputElement>;
`;

export const SOURCE_TYPES = `export type SourceId = 'source-a' | 'source-b';
export interface SourcePanelProps {
  readonly target: SourceId;
}
`;

export const SOURCE_MODULE = `import type { SourceId } from './types';
let active = 0;
let notifications = 0;
function paint() {
  const activeNode = document.getElementById('active');
  const notificationNode = document.getElementById('notifications');
  if (activeNode) activeNode.textContent = String(active);
  if (notificationNode) notificationNode.textContent = String(notifications);
}
/** 固定の外部DOM入力に購読し、同じlistenerを外すcleanupを返す。 */
export function subscribe(target: SourceId, receive: (value: string) => void) {
  const element = document.querySelector<HTMLInputElement>('#' + target);
  if (!element) throw new Error('外部入力がありません');
  active += 1;
  paint();
  const notify = () => {
    notifications += 1;
    paint();
    receive(element.value);
  };
  element.addEventListener('input', notify);
  receive(element.value);
  return () => {
    element.removeEventListener('input', notify);
    active -= 1;
    paint();
  };
}
`;

export const SOURCE_HTML = `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <title>外部入力の同期</title>
  </head>
  <body>
    <h1>外部入力の同期</h1>
    <section aria-label="外部入力">
      <label for="source-a">外部入力A</label><input id="source-a" value="初期A" />
      <label for="source-b">外部入力B</label><input id="source-b" value="初期B" />
      <p>購読中: <span id="active">0</span></p>
      <p>入力通知: <span id="notifications">0</span></p>
    </section>
    <div id="root"></div>
  </body>
</html>
`;

export const EFFECT_MAIN = `import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import { SourcePanel } from './components';
import type { SourceId } from './types';
function App() {
  const [target, setTarget] = useState<SourceId>('source-a');
  const [visible, setVisible] = useState(true);
  return (
    <section>
      <button id="target-a" onClick={() => setTarget('source-a')}>
        Aを選ぶ
      </button>
      <button id="target-b" onClick={() => setTarget('source-b')}>
        Bを選ぶ
      </button>
      <button id="toggle" onClick={() => setVisible((previous) => !previous)}>
        表示を切り替える
      </button>
      {visible && <SourcePanel target={target} />}
    </section>
  );
}
const container = document.getElementById('root');
if (!container) throw new Error('表示先がありません');
createRoot(container).render(<App />);
`;

export const CUSTOM_HOOK_MAIN = `import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import { SourcePanel } from './components';
function App() {
  const [visible, setVisible] = useState(true);
  return (
    <section>
      <button id="toggle" onClick={() => setVisible((previous) => !previous)}>
        Aの表示を切り替える
      </button>
      {visible && <SourcePanel target="source-a" />}
      <SourcePanel target="source-b" />
    </section>
  );
}
const container = document.getElementById('root');
if (!container) throw new Error('表示先がありません');
createRoot(container).render(<App />);
`;

export const CUSTOM_HOOK_COMPONENTS = `import { useSourceValue } from './sourceHook';
import type { SourcePanelProps } from './types';
export function SourcePanel({ target }: SourcePanelProps) {
  const value = useSourceValue(target);
  const isA = target === 'source-a';
  return (
    <section>
      <h2>{isA ? '入力Aの表示' : '入力Bの表示'}</h2>
      <p id={isA ? 'observed-a' : 'observed-b'} role="status">
        {value}
      </p>
      <p id={isA ? 'length-a' : 'length-b'}>{value.length}</p>
    </section>
  );
}
`;

/** 固定購読の実体とState所有者を保護し、課題ごとの編集Fileを1つへ絞る。 */
function contract(profile: ReactProfile) {
  if (profile === 'ref-focus-v1')
    return {
      editable: 'components.tsx',
      html: CONTROLLED_FORM_HTML,
      fixed: { 'main.tsx': REF_MAIN, 'types.ts': REF_TYPES },
    };
  if (profile === 'effect-sync-v1')
    return {
      editable: 'components.tsx',
      html: SOURCE_HTML,
      fixed: { 'main.tsx': EFFECT_MAIN, 'source.ts': SOURCE_MODULE, 'types.ts': SOURCE_TYPES },
    };
  if (profile === 'custom-source-hook-v1')
    return {
      editable: 'sourceHook.ts',
      html: SOURCE_HTML,
      fixed: {
        'main.tsx': CUSTOM_HOOK_MAIN,
        'components.tsx': CUSTOM_HOOK_COMPONENTS,
        'source.ts': SOURCE_MODULE,
        'types.ts': SOURCE_TYPES,
      },
    };
  return undefined;
}

/** CompilerはTS File集合と固定Sourceを同時に照合し、購読観測の偽造を拒否する。 */
export function isHookScaffold(
  files: Readonly<Record<string, string>>,
  profile: ReactProfile,
): boolean {
  const fixed = contract(profile);
  return (
    !!fixed &&
    Object.keys(files).sort().join(',') ===
      [...Object.keys(fixed.fixed), fixed.editable].sort().join(',') &&
    Object.entries(fixed.fixed).every(([file, source]) => files[file]?.trim() === source.trim())
  );
}

/** 保存/Import/採点では固定HTMLも要求し、外部入力と観測用idを保護する。 */
export function isHookWorkspace(
  files: Readonly<Record<string, string>>,
  profile: ReactProfile,
): boolean {
  const fixed = contract(profile);
  if (!fixed || files['index.html']?.trim() !== fixed.html.trim()) return false;
  const { 'index.html': html, ...typed } = files;
  return !!html && isHookScaffold(typed, profile);
}
