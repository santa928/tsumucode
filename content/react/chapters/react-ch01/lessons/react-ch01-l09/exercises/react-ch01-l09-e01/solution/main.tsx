import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import { NameContext } from './nameContext';
import { NameField, NameSummary } from './components';

function App() {
  const [name, setName] = useState('');
  return (
    <section>
      <h1>Contextで共有する名前</h1>
      <NameContext.Provider value={{ value: name, onNameChange: setName }}>
        <NameField />
        <NameSummary />
      </NameContext.Provider>
      <button id="reset" type="button" onClick={() => setName('')}>
        やり直し
      </button>
    </section>
  );
}

const container = document.getElementById('root');
if (!container) throw new Error('表示先が見つかりません');
createRoot(container).render(<App />);
