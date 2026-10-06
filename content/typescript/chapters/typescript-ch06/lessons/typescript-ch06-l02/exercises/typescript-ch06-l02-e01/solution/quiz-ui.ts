import type { LoadMode, LoadResult, Question, QuizState } from './main.js';

interface QuizPorts {
  readonly questions: readonly Question[];
  readonly createState: () => QuizState;
  readonly answer: (state: QuizState, question: Question, choice: string) => QuizState;
  readonly advance: (state: QuizState) => QuizState;
  readonly load: (mode: LoadMode) => Promise<LoadResult>;
  readonly readButton: (event: Event) => HTMLButtonElement | undefined;
}

/** 提供HTMLの要素を確認する。学習者の関数以外へ判断を代行しない。 */
function element(selector: string): HTMLElement {
  const node = document.querySelector(selector);
  if (!(node instanceof HTMLElement)) throw new Error('提供HTMLの要素がありません');
  return node;
}

function button(selector: string): HTMLButtonElement {
  const node = document.querySelector(selector);
  if (!(node instanceof HTMLButtonElement)) throw new Error('提供HTMLのbuttonがありません');
  return node;
}

/** 具体的なtagのquery結果を確認し、callbackにも非nullの参照を渡す。 */
function controlsElement(): HTMLFieldSetElement {
  const controls = document.querySelector('fieldset');
  if (controls === null) throw new Error('提供HTMLの操作欄がありません');
  return controls;
}

function categoryElement(): HTMLSelectElement {
  const category = document.querySelector('select');
  if (category === null) throw new Error('提供HTMLのカテゴリ欄がありません');
  return category;
}

/** 学習者の型付きデータと状態・境界関数を、既存クイズと同じ表示/操作へ接続する。 */
export function mountQuiz(ports: QuizPorts): void {
  const controls = controlsElement();
  const category = categoryElement();
  const quiz = element('#quiz');
  const questionText = element('#question');
  const progress = element('#progress');
  const feedback = element('#feedback');
  const score = element('#score-value');
  const result = element('#result');
  const status = element('#status');
  const next = button('#next');
  const restart = button('#restart');
  const choices = [button('#choice-0'), button('#choice-1')];
  let questions = ports.questions;
  let state = ports.createState();

  /** 状態に対応する実際の問題、回答済みの操作可否と結果を表示する。 */
  function render(): void {
    const question = questions[state.index];
    score.textContent = String(state.score);
    quiz.hidden = question === undefined;
    result.hidden = question !== undefined;
    restart.hidden = question !== undefined;
    if (question !== undefined) {
      questionText.textContent = question.text;
      progress.textContent = '問題' + (state.index + 1) + ' / ' + questions.length;
      feedback.textContent = '';
      choices.forEach((choice, index) => {
        choice.textContent = question.choices[index] ?? '';
        choice.disabled = state.answered;
      });
      next.disabled = !state.answered;
      next.textContent = state.index === questions.length - 1 ? '結果を見る' : '次の問題';
      if (!state.answered) choices[0]?.focus();
    } else {
      result.textContent = questions.length + '問中' + state.score + '問正解';
      restart.focus();
    }
  }

  /** 受け取ったEventの確認を学習者へ渡し、その返した対象だけを扱う。 */
  async function handleAction(event: Event): Promise<void> {
    const target = ports.readButton(event);
    if (target === undefined) return;
    if (
      target.id === 'start' ||
      target === restart ||
      target.id === 'fail-load' ||
      target.id === 'invalid-load'
    ) {
      controls.disabled = true;
      status.textContent = '読み込み中...';
      const mode =
        target.id === 'fail-load'
          ? 'failure'
          : target.id === 'invalid-load'
            ? 'invalid'
            : 'success';
      const loaded = await ports.load(mode);
      controls.disabled = false;
      if (loaded.kind === 'failed') {
        status.textContent = loaded.message;
        return;
      }
      if (loaded.kind === 'invalid') {
        status.textContent = '不正なデータです。開始でやり直せます';
        return;
      }
      questions = loaded.questions.filter((question) => question.category === category.value);
      state = ports.createState();
      status.textContent = '';
      render();
    } else if (target === next) {
      state = ports.advance(state);
      render();
    } else if (choices.includes(target)) {
      const question = questions[state.index];
      if (question === undefined || state.answered) return;
      const selected = target.textContent ?? '';
      state = ports.answer(state, question, selected);
      score.textContent = String(state.score);
      feedback.textContent =
        selected === question.correct ? '正解です' : '正解は ' + question.correct + ' です';
      choices.forEach((choice) => {
        choice.disabled = state.answered;
      });
      next.disabled = !state.answered;
      if (state.answered) next.focus();
    }
  }

  document.querySelectorAll('button').forEach((control) => {
    control.addEventListener('click', handleAction);
  });
}
