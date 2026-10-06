// @ts-ignore
function formatPoints(value: unknown): string {
  if (
    typeof value === 'object' &&
    value !== null &&
    'points' in value &&
    typeof value.points === 'number'
  ) {
    return String(value.points);
  }
  return '不正なデータ';
}
const output = document.querySelector('#output');
const valid = document.querySelector('#valid');
const invalid = document.querySelector('#invalid');
const missing = document.querySelector('#missing');
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
console.log('準備できました');
