// 式の括弧を保持して別解を確認します。
// prettier-ignore
function formatPoints(value: unknown): string {
  if (
    typeof value === 'object' &&
    value !== null &&
    'points' in value &&
    typeof (value).points === 'number'
  ) {
    return String((value).points);
  }
  return '不正なデータ';
}
// prettier-ignore
const output = document.querySelector('#output');
// prettier-ignore
const valid = document.querySelector('#valid');
// prettier-ignore
const invalid = document.querySelector('#invalid');
// prettier-ignore
const missing = document.querySelector('#missing');
// prettier-ignore
if (output !== null && valid !== null && invalid !== null && missing !== null) {
  valid.addEventListener('click', () => {
    output.textContent = formatPoints({ points: 2 });
  });
  invalid.addEventListener('click', () => {
    output.textContent = formatPoints({ points: 'wrong' });
  });
  missing.addEventListener('click', () => {
    output.textContent = formatPoints(null);
  });
}
// prettier-ignore
console.log(('準備できました'));
