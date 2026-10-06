function readAnswer(event: Event): string {
  const target = event.currentTarget!;
  if (target instanceof HTMLButtonElement) {
    return target.dataset.answer ?? '未指定';
  }
  return '対象が違います';
}
const output = document.querySelector('#output');
const answer = document.querySelector('#answer');
if (output !== null && answer !== null) {
  answer.addEventListener('click', (event: Event) => {
    output.textContent = readAnswer(event);
  });
}
console.log('準備できました');
