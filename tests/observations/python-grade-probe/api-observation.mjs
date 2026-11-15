import { URL } from 'node:url';
// Fixed classifications only: never read or emit headers, payloads, identifiers, URLs or errors.
export function classifyApi(url, method) {
  if (method !== 'POST' || typeof url !== 'string') return undefined;
  try {
    const value = new URL(url);
    if (value.origin !== 'http://127.0.0.1:4173') return undefined;
    return {
      '/api/session': 'session',
      '/api/python-capabilities': 'capability',
      '/api/grades': 'grade',
    }[value.pathname];
  } catch {
    return undefined;
  }
}
export function responseClass(route, status) {
  if (route === 'grade' && status === 202) return 'response-202';
  if (Number.isInteger(status) && status >= 200 && status < 300) return 'response-2xx';
  if (Number.isInteger(status) && status >= 300 && status < 400) return 'response-3xx';
  if (Number.isInteger(status) && status >= 400 && status < 500) return 'response-4xx';
  if (Number.isInteger(status) && status >= 500 && status < 600) return 'response-5xx';
  return 'response-other';
}
// Each category is marked at most once per page. Missing or failed writes remain unknown.
export function observeApi(page, mark) {
  const seen = new Set();
  const emit = (route, suffix) => {
    if (!route) return;
    const stage = `api-${route}-${suffix}`;
    if (seen.has(stage)) return;
    seen.add(stage);
    mark(stage);
  };
  const safely = (observe) => {
    try {
      observe();
    } catch {
      /* observation unavailable */
    }
  };
  page.on('request', (req) => safely(() => emit(classifyApi(req.url(), req.method()), 'request')));
  page.on('requestfailed', (req) =>
    safely(() => emit(classifyApi(req.url(), req.method()), 'network-failure')),
  );
  page.on('response', (reply) =>
    safely(() => {
      const req = reply.request();
      const route = classifyApi(req.url(), req.method());
      if (route) emit(route, responseClass(route, reply.status()));
    }),
  );
}
