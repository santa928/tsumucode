interface QuizItem {
  prompt: string;
  choices: Array<string>;
  correctIndex: number;
}
const item: QuizItem = {
  prompt: 'HTMLが受け持つものは？',
  choices: ['内容', '見た目'],
  correctIndex: 1 - 1,
};
console.log(item['choices'].at(item['correctIndex']));
