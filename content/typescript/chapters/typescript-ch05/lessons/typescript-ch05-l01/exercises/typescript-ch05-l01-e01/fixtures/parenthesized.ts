// 式の括弧を保持して別解を確認します。
// prettier-ignore
function readAnswer(event: Event): string {
  const target = (event.currentTarget);
  if (target instanceof HTMLButtonElement) {
    return target.dataset.answer ?? '未指定';
  }
  return '対象が違います';
}
// prettier-ignore
const output = document.querySelector('#output');
// prettier-ignore
const answer = document.querySelector('#answer');
// prettier-ignore
if (output !== null && answer !== null) {
  answer.addEventListener('click', (event: Event) => {
    output.textContent = readAnswer((event));
  });
}
// prettier-ignore
console.log(('準備できました'));
