import { createRoot } from 'react-dom/client';
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
