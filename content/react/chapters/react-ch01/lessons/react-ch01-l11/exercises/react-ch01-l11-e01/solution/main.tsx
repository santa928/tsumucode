import { createRoot } from 'react-dom/client';
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
