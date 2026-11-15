import { createRoot } from 'react-dom/client';
import { App } from './components';

const container = document.getElementById('root');
if (container === null) throw new Error('表示先がありません');
createRoot(container).render(<App />);
