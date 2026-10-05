interface Question {
  prompt: string;
  choices: string[];
  correctIndex: number;
}
const question: Question = {
  prompt: 'HTMLが受け持つものは？',
  choices: ['内容', '見た目'],
  correctIndex: -2,
};
console.log(question.choices.at(question.correctIndex));
