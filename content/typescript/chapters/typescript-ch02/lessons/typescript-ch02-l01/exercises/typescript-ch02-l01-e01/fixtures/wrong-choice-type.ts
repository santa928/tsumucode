interface Question {
  prompt: string;
  choices: string[];
  correctIndex: number;
}
const question: Question = {
  prompt: 'HTMLが受け持つものは？',
  choices: 1,
  correctIndex: 0,
};
console.log(question.choices.at(question.correctIndex));
