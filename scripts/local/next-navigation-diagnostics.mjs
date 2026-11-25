import console from 'node:console';
import { URL } from 'node:url';

/** 失敗した操作について、実Previewの対象Documentと固定のルート名だけを記録する。 */
export async function observeNavigation(page, frame, routes, check) {
  const started = globalThis.performance.now();
  const events = [];
  const record = (stage, route, status) => {
    events.push({ ms: Math.round(globalThis.performance.now() - started), stage, route, status });
    if (events.length > 16) events.shift();
  };
  const recordUrl = (stage, url, status) => {
    const target = URL.parse(url);
    if (target?.origin !== 'http://127.0.0.1:4175' || target.username || target.password) return;
    const route = routes.get(target.pathname);
    if (route) record(stage, route, status);
  };
  const documentEvent = (stage, request, status) => {
    if (!request.isNavigationRequest()) return;
    // 初回のDocument要求ではPlaywrightにframeがまだ存在しない場合がある。
    let owner;
    try {
      owner = request.frame();
    } catch {
      return;
    }
    if (owner === frame) recordUrl(stage, request.url(), status);
  };
  const listeners = [
    ['request', (r) => documentEvent('request', r)],
    ['response', (r) => documentEvent('response', r.request(), r.status())],
    ['requestfinished', (r) => documentEvent('finished', r)],
    ['requestfailed', (r) => documentEvent('request-failed', r)],
    [
      'framenavigated',
      (f) => {
        if (f === frame) recordUrl('committed', f.url());
      },
    ],
  ];
  for (const [event, listener] of listeners) page.on(event, listener);
  try {
    await check(record);
  } catch (error) {
    record('check-failed');
    console.error(JSON.stringify({ navigation: events }));
    throw error;
  } finally {
    for (const [event, listener] of listeners) page.off(event, listener);
  }
}
