type LoadMode = 'success' | 'invalid' | 'failure';
async function load(mode: LoadMode): Promise<unknown> {
  if (mode === 'failure') throw new Error('再試行できます');
  if (mode === 'invalid') return { points: 'wrong' };
  return { points: 2 };
}
function formatPoints(value: unknown): string {
  if (typeof value !== 'object' || value === null) return '不正なデータ';
  if (!('points' in value)) return '不正なデータ';
  if (typeof value.points !== 'number') return '不正なデータ';
  return String(value.points);
}
async function show(mode: LoadMode): Promise<void> {
  const output = document.querySelector('#output');
  if (output === null) return;
  try {
    const data: unknown = await load(mode);
    output.textContent = formatPoints(data);
  } catch (error: unknown) {
    output.textContent = error instanceof Error ? error.message : '理由が不明です';
  }
}
const success = document.querySelector('#success');
const invalid = document.querySelector('#invalid');
const failure = document.querySelector('#failure');
if (success !== null && invalid !== null && failure !== null) {
  success.addEventListener('click', () => {
    void show('success');
  });
  invalid.addEventListener('click', () => {
    void show('invalid');
  });
  failure.addEventListener('click', () => {
    void show('failure');
  });
}
console.log('準備できました');
