function answerOf(notice: Event): string {
  const target = notice.currentTarget;
  if (target instanceof HTMLButtonElement) {
    return target.dataset.answer ?? '未指定';
  }
  return '対象が違います';
}
const output = document.querySelector('#output');
const answer = document.querySelector('#answer');
if (output !== null && answer !== null) {
  answer.addEventListener('click', (notice: Event) => {
    output.textContent = answerOf(notice);
  });
}
console.log('準備できました');
