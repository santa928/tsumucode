interface Question {
  prompt: string;
  choices: string[];
  correctIndex: number;
}
const question: Question = {
  prompt: 'HTMLが受け持つものは？',
  choices: ['内容', '見た目'],
  // @ts-ignore
  correctIndex: '0',
};
console.log(question.choices.at(question.correctIndex));
