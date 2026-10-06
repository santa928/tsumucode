import { createRoot } from 'react-dom/client';
import { QuestionCard, type Question } from './QuestionCard';

const question: Question = {
  prompt: 'HTMLが受け持つものは？',
  choices: ['内容', '見た目'],
};
const container = document.getElementById('root');
if (container === null) throw new Error('表示先がありません');
createRoot(container).render(<QuestionCard question={question} />);
