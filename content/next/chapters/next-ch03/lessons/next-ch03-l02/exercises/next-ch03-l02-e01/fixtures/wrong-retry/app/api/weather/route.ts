type State = 'clear' | 'slow' | 'flaky' | 'missing';
let attempts = 0;
const history: Array<{ state: State; status: number }> = [];

/** 固定の遅延・初回失敗・対象なし。controlはBrowser Previewで公開しない。 */
export async function GET(request: Request): Promise<Response> {
  const parameters = new URL(request.url).searchParams;
  const control = parameters.get('control');
  if (control === 'reset') {
    attempts = 0;
    history.length = 0;
    return Response.json({ reset: true });
  }
  if (control === 'inspect') return Response.json({ history });
  const state = parameters.get('state') as State;
  if (!['clear', 'slow', 'flaky', 'missing'].includes(state)) {
    return Response.json({ error: '対象なし' }, { status: 404 });
  }
  if (state === 'slow') await new Promise((resolve) => setTimeout(resolve, 1500));
  const status = state === 'missing' ? 404 : state === 'flaky' && ++attempts === 1 ? 503 : 200;
  history.push({ state, status });
  if (history.length > 32) history.shift();
  if (status !== 200) return Response.json({ error: '教材データの読み込み失敗' }, { status });
  return Response.json({
    label: state === 'slow' ? '遅延後の晴れ' : state === 'flaky' ? '再試行後の晴れ' : '晴れ',
  });
}
