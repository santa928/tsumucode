import { loadQuestions as getQuestions } from './questions.js';

/** 1つのクイズの状態を閉包の中へ保持する。 */
function createQuiz() {
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

  /** 押されたnative buttonの役割に応じてstateを更新し、表示へ接続する。 */
  async function handleAction(event) {
    const button = event.currentTarget;
    if (button.id === 'start' || button.id === 'restart' || button.id === 'fail-load') {
      controls.disabled = true;
      status.textContent = '読み込み中...';
      try {
        const loaded = await getQuestions(button.id === 'fail-load');
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
      if (!answered) return;
      questionIndex += 1;
      answered = false;
      render();
    } else {
      const question = questions[questionIndex];
      if (answered || !question) return;
      answered = true;
      const correct = button.textContent === question.correct;
      document.querySelector('#feedback').textContent = correct
        ? '正解です'
        : '正解は ' + question.correct + ' です';
      if (correct) score += 1;
      document.querySelector('#score-value').textContent = score;
      choices.forEach((choice) => {
        choice.disabled = true;
      });
      next.disabled = false;
      next.focus();
    }
  }

  /** 今の問題、または全問の結果をstateから表示する。 */
  function render() {
    const question = questions[questionIndex];
    quiz.hidden = !question;
    result.hidden = !!question;
    restart.hidden = !!question;
    document.querySelector('#score-value').textContent = score;
    if (question) {
      document.querySelector('#question').textContent = question.text;
      document.querySelector('#feedback').textContent = '';
      choices.forEach((choice, index) => {
        choice.textContent = question.choices[index];
        choice.disabled = false;
      });
      next.disabled = true;
      next.textContent = questionIndex === questions.length - 1 ? '結果を見る' : '次の問題';
      choices[0].focus();
    } else {
      result.textContent = questions.length + '問中' + score + '問正解';
      restart.focus();
    }
  }

  document.querySelectorAll('button').forEach((button) => {
    button.addEventListener('click', handleAction);
  });
}
createQuiz();
