const quiz = { text: '2 + 3 は？', choices: ['3', '5', '7'] };
const { text: prompt, choices } = quiz;
const [firstChoice] = choices;
console.log(prompt);
console.log(firstChoice);
