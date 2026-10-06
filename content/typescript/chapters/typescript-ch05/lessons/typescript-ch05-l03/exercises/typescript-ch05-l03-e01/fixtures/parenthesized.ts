// 式の括弧を保持して別解を確認します。
// prettier-ignore
type LoadMode = 'success' | 'invalid' | 'failure';
// prettier-ignore
async function load(mode: LoadMode): Promise<unknown> {
  if (mode === 'failure') throw new Error('再試行できます');
  if (mode === 'invalid') return { points: 'wrong' };
  return { points: 2 };
}
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
async function show(mode: LoadMode): Promise<void> {
  const output = document.querySelector('#output');
  if (output === null) return;
  try {
    const data: unknown = await (load((mode)));
    output.textContent = formatPoints((data));
  } catch (error: unknown) {
    output.textContent = error instanceof Error ? error.message : '理由が不明です';
  }
}
// prettier-ignore
const success = document.querySelector('#success');
// prettier-ignore
const invalid = document.querySelector('#invalid');
// prettier-ignore
const failure = document.querySelector('#failure');
// prettier-ignore
if (success !== null && invalid !== null && failure !== null) {
  success.addEventListener('click', () => { void show('success'); });
  invalid.addEventListener('click', () => { void show('invalid'); });
  failure.addEventListener('click', () => { void show('failure'); });
}
// prettier-ignore
console.log(('準備できました'));
