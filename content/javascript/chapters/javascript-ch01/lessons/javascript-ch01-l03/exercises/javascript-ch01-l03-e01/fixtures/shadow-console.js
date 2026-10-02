const print = console.log;
const questionCount = 3;
const pointPerQuestion = 10;
const totalScore = questionCount * pointPerQuestion;
{
  const console = { log: (value) => print(30) };
  console.log(totalScore);
}
