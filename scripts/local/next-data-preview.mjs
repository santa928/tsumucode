// 固定Next16.3.8のWeather navigation/retryだけで使うRSC契約。
export const DATA_WORKSPACE = 'next-ch03-l01-e01';
export const WEATHER_WORKSPACE = 'next-ch03-l02-e01';
const modes = ['fresh', 'cached', 'revalidate'];
const states = ['clear', 'slow', 'flaky', 'missing'];
const pages = new Map([
  [DATA_WORKSPACE, ['', ...modes.map((mode) => `data/${mode}`)]],
  [WEATHER_WORKSPACE, ['', ...states.map((state) => `weather/${state}`)]],
]);
const leaf = ['__PAGE__', {}, null, null, 4096];
const trees = new Set([
  encodeURIComponent(JSON.stringify(['', { children: leaf }, null, null, 4112])),
]);
for (const state of states) {
  const children = [
    'weather',
    { children: [['state', state, 'd', null], { children: leaf }, null, null, 4100] },
    null,
    null,
    4104,
  ];
  for (const [marker, flags] of [
    [null, 4112],
    ['refetch', 4120],
  ]) {
    trees.add(encodeURIComponent(JSON.stringify(['', { children }, null, marker, flags])));
  }
}

/** 固定pageのdocument/RSC要求を分類し、検査したNextヘッダーだけを返す。 */
export function nextDataRequest(req, target) {
  if (!pages.has(target.workspaceId) || !['GET', 'HEAD'].includes(req.method)) return undefined;
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u.test(target.runId))
    return undefined;
  const base = `/w/${target.workspaceId}/${target.runId}/`;
  if (typeof req.url !== 'string' || req.url.length > 512 || !req.url.startsWith(base))
    return undefined;
  const parts = req.url.slice(base.length).split('?');
  if (parts.length > 2 || !pages.get(target.workspaceId).includes(parts[0])) return undefined;
  const headers = req.headers;
  if (parts.length === 1) {
    if (
      ['rsc', 'next-router-state-tree', 'next-url', 'next-router-prefetch'].some(
        (key) => key in headers,
      )
    )
      return undefined;
    return { stream: target.workspaceId === WEATHER_WORKSPACE, headers: {} };
  }
  if (target.workspaceId !== WEATHER_WORKSPACE || req.method !== 'GET') return undefined;
  if (!/^_rsc=[A-Za-z0-9_-]{1,64}$/u.test(parts[1])) return undefined;
  if (headers.rsc !== '1' || !trees.has(headers['next-router-state-tree'])) return undefined;
  if ('next-router-prefetch' in headers) return undefined;
  if (
    'next-url' in headers &&
    !['/', ...states.map((state) => `/weather/${state}`)].includes(headers['next-url'])
  )
    return undefined;
  return {
    stream: true,
    headers: {
      rsc: '1',
      'next-router-state-tree': headers['next-router-state-tree'],
      ...('next-url' in headers ? { 'next-url': headers['next-url'] } : {}),
    },
  };
}

/** 資源経路は従来のまま、限定pageだけに追加の要求検査を適用する。 */
export function nextPreviewRequest(req, target) {
  const fixed = pages.get(target.workspaceId);
  if (!fixed) return { stream: false, headers: {} };
  const base = `/w/${target.workspaceId}/${target.runId}/`;
  const file = req.url.slice(base.length).split('?')[0];
  if (fixed.includes(file)) return nextDataRequest(req, target);
  if (
    ['rsc', 'next-router-state-tree', 'next-url', 'next-router-prefetch'].some(
      (key) => key in req.headers,
    )
  )
    return undefined;
  return { stream: false, headers: {} };
}

/** raw route段階では候補だけを許可し、実ヘッダーはnextPreviewRequestで検査する。 */
export function weatherRscRoute(file, query, workspaceId) {
  return (
    workspaceId === WEATHER_WORKSPACE &&
    pages.get(WEATHER_WORKSPACE).includes(file) &&
    /^_rsc=[A-Za-z0-9_-]{1,64}$/u.test(query)
  );
}
