import { loadQuestions } from './questions.js';
const start = document.querySelector('#start');
start.addEventListener('click', () => {
  document.querySelector('#quiz').hidden = false;
  document.querySelector('#question').textContent = 'Webページの骨組みを作るのは？';
  document.querySelector('#choice-0').textContent = 'HTML';
  document.querySelector('#choice-1').textContent = 'CSS';
});
