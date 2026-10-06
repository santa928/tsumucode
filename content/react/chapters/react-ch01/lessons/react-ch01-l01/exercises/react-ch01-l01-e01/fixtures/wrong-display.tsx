import { createRoot } from 'react-dom/client';
import { QuestionCard, type Question } from './QuestionCard';

const question: Question = {
  prompt: '問題文をここに書く',
  choices: ['選択肢A', '選択肢B'],
  correctIndex: 0,
};
const container = document.getElementById('root');
if (container === null) throw new Error('表示先がありません');
createRoot(container).render(<QuestionCard question={question} />);
