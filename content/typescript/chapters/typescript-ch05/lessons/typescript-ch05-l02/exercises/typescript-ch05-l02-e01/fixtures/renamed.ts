function displayOf(input: unknown): string {
  if (
    typeof input === 'object' &&
    input !== null &&
    'points' in input &&
    typeof input.points === 'number'
  ) {
    return String(input.points);
  }
  return '不正なデータ';
}
const output = document.querySelector('#output');
const valid = document.querySelector('#valid');
const invalid = document.querySelector('#invalid');
const missing = document.querySelector('#missing');
if (output !== null && valid !== null && invalid !== null && missing !== null) {
  valid.addEventListener('click', () => {
    output.textContent = displayOf({ points: 2 });
  });
  invalid.addEventListener('click', () => {
    output.textContent = displayOf({ points: 'wrong' });
  });
  missing.addEventListener('click', () => {
    output.textContent = displayOf(null);
  });
}
console.log('準備できました');
