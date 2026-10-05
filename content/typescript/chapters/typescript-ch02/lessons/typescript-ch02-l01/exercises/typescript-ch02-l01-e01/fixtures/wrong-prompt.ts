interface Question {
  prompt: string;
  choices: string[];
  correctIndex: number;
}
const question: Question = {
  prompt: '別の問題',
  choices: ['内容', '見た目'],
  correctIndex: 0,
};
console.log(question.choices.at(question.correctIndex));
