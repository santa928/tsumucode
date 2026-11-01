import type { Page, Request, Response, TestInfo } from '@playwright/test';

/** URL・run identity・queryは残さず、有限のAPI分類だけを返す。 */
export function localConsoleRoute(value: string) {
  try {
    const path = new URL(value).pathname;
    if (path === '/api/session') return 'session';
    if (path === '/api/python-capabilities') return 'capabilities';
    if (path === '/api/grades') return 'grade';
    if (path === '/api/runs') return 'preview';
    if (/^\/api\/runs\/[^/]+\/cancel$/u.test(path)) return 'cancel';
    if (/^\/api\/runs\/[^/]+$/u.test(path)) return 'poll';
  } catch {
    // API以外のURLは診断対象にしない。
  }
  return undefined;
}

/** Source・Console・診断文をコピーせず、pollの状態だけを投影する。 */
export function localConsolePollState(input: unknown) {
  if (typeof input !== 'object' || input === null) return { state: 'other' };
  const value = input as Record<string, unknown>;
  if (value.state === 'running') return { state: 'running' };
  if (value.state !== 'completed') return { state: 'other' };
  const result = value.result;
  const status =
    typeof result === 'object' && result !== null
      ? (result as Record<string, unknown>).status
      : undefined;
  return {
    state: 'completed',
    resultStatus:
      typeof status === 'string' &&
      ['succeeded', 'code-error', 'unsupported', 'stopped', 'system-error'].includes(status)
        ? status
        : 'other',
  };
}

/** 失敗時の境界判別用。最大768eventを保持し、認証headerや要求本文を読まない。 */
export function observeLocalConsole(page: Page) {
  const events: unknown[] = [];
  const pending = new WeakMap<Request, { ordinal: number; route: string; startedAt: number }>();
  let ordinal = 0;
  let dropped = 0;
  let listening = true;
  const record = (value: unknown): void => {
    if (!listening) return;
    if (events.length === 768) {
      events.shift();
      dropped += 1;
    }
    events.push(value);
  };
  const request = (input: Request): void => {
    const route = localConsoleRoute(input.url());
    if (route === undefined) return;
    const entry = { ordinal: ++ordinal, route, startedAt: Date.now() };
    pending.set(input, entry);
    record({ event: 'request', ...entry });
  };
  const response = async (reply: Response): Promise<void> => {
    const entry = pending.get(reply.request());
    if (entry === undefined) return;
    record({
      event: 'response-headers',
      ordinal: entry.ordinal,
      route: entry.route,
      status: reply.status(),
      elapsedMs: Date.now() - entry.startedAt,
    });
    if (entry.route === 'poll' || entry.route === 'cancel') {
      const state = await reply
        .json()
        .then(localConsolePollState, () => ({ state: 'unavailable' }));
      record({
        event: 'response-body',
        ordinal: entry.ordinal,
        route: entry.route,
        elapsedMs: Date.now() - entry.startedAt,
        ...state,
      });
    }
  };
  const failed = (input: Request): void => {
    const entry = pending.get(input);
    if (entry !== undefined)
      record({ event: 'request-failed', ...entry, elapsedMs: Date.now() - entry.startedAt });
  };
  const crash = (): void => {
    record({ event: 'page-crash', at: Date.now() });
  };
  const disconnected = (): void => {
    record({ event: 'browser-disconnected', at: Date.now() });
  };
  const browser = page.context().browser();
  page.on('request', request);
  page.on('response', response);
  page.on('requestfailed', failed);
  page.on('crash', crash);
  browser?.on('disconnected', disconnected);
  return {
    stop() {
      listening = false;
      page.off('request', request);
      page.off('response', response);
      page.off('requestfailed', failed);
      page.off('crash', crash);
      browser?.off('disconnected', disconnected);
    },
    async attach(info: TestInfo) {
      await info.attach('local-console-boundary', {
        body: JSON.stringify({ dropped, events }),
        contentType: 'application/json',
      });
    },
  };
}
