import { loadQuestions } from './questions.js';

let questions = [];
let questionIndex = 0;
let score = 0;
let answered = false;
const controls = document.querySelector('#controls');
const quiz = document.querySelector('#quiz');
const choices = document.querySelectorAll('#choices button');
const next = document.querySelector('#next');
const result = document.querySelector('#result');
const restart = document.querySelector('#restart');
const status = document.querySelector('#status');

// TODO: stateを戻してもう一度始める

/** 押されたnative buttonの役割に応じてstateを更新し、表示へ接続する。 */
async function handleAction(event) {
  const button = event.currentTarget;
  if (button.id === 'start' || button.id === 'fail-load') {
    controls.disabled = true;
    status.textContent = '読み込み中...';
    try {
      const loaded = await loadQuestions(button.id === 'fail-load');
      questions = loaded;
      questionIndex = 0;
      score = 0;
      answered = false;
      status.textContent = '';
      render();
    } catch (error) {
      status.textContent = '読み込めませんでした。開始でやり直せます';
    } finally {
      controls.disabled = false;
    }
  } else if (button === next) {
    // 回答の工程で作ります
  } else {
    // TODO: 回答と次の問題をつなぐ
  }
}

/** 今の問題、または全問の結果をstateから表示する。 */
function render() {
  const question = questions[questionIndex];
  quiz.hidden = !question;
  result.hidden = true;
  restart.hidden = true;
  // TODO: stateから得点を表示する
  if (question) {
    document.querySelector('#question').textContent = question.text;
    document.querySelector('#feedback').textContent = '';
    choices[0].textContent = question.choices[0];
    choices[1].textContent = question.choices[1];
    next.disabled = true;
    next.textContent = '次の問題';
    choices[0].focus();
  } else {
    // TODO: 最後の問題の後に結果を出す
    // TODO: 全問の結果を表示する
  }
}

document.querySelectorAll('button').forEach((button) => {
  button.addEventListener('click', handleAction);
});
