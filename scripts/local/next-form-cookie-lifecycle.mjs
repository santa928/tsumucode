const networkFailureClasses = new Set([
  'net::ERR_ABORTED',
  'net::ERR_CONTENT_LENGTH_MISMATCH',
  'net::ERR_INCOMPLETE_CHUNKED_ENCODING',
  'net::ERR_CONTENT_DECODING_FAILED',
  'net::ERR_CONNECTION_RESET',
  'net::ERR_CONNECTION_REFUSED',
  'net::ERR_CONNECTION_CLOSED',
  'net::ERR_EMPTY_RESPONSE',
  'net::ERR_FAILED',
  'net::ERR_HTTP2_PROTOCOL_ERROR',
  'net::ERR_INSUFFICIENT_RESOURCES',
  'net::ERR_NETWORK_CHANGED',
]);

/** 任意の例外本文は保存せず、Browser由来の既知分類だけを残す。 */
export function cookieNetworkErrorClass(errorText) {
  return networkFailureClasses.has(errorText) ? errorText : 'other';
}

/** Playwright例外を閉じた分類に写す。URL・Cookie・任意の本文/例外名は転記しない。 */
export function cookieFailureClass(error) {
  if (!(error instanceof Error)) return 'other';
  if (
    [
      'CookieAcceptanceDeadlineError',
      'CookieAcceptanceRequestError',
      'CookieAcceptanceConsumerError',
      'TimeoutError',
    ].includes(error.name)
  )
    return error.name;
  if (error.code === 'ERR_ASSERTION') return 'assertion';
  const network = error.message.match(/\bnet::ERR_[A-Z_]+\b/u)?.[0];
  if (network) return cookieNetworkErrorClass(network);
  if (error.message.includes('Target page, context or browser has been closed'))
    return 'target-closed';
  if (error.message.includes('Page crashed')) return 'page-crashed';
  if (/Navigation to .* is interrupted by another navigation/u.test(error.message))
    return 'navigation-interrupted';
  if (error.message.includes('Execution context was destroyed'))
    return 'execution-context-destroyed';
  return 'other';
}

/** Cookie検査の未完了待機を失敗にする。取消不能な操作は呼出元のcleanupで回収する。 */
export async function withCookieDeadline(operation, timeoutMs, stage) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          const error = new Error(`Cookie acceptance deadline: ${stage}`);
          error.name = 'CookieAcceptanceDeadlineError';
          reject(error);
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 選択したRequestの切断を失敗として伝え、正常時だけ従来のHTTP完了を待つ。
 * Playwrightのfinishedはrequestfailed後も未解決になり得る。詳細本文は例外へ含めない。
 * 失敗済みRequestも照合し、成功・失敗・期限超過の全経路で監視を外す。
 */
export async function finishCookieResponse(context, response, timeoutMs = 30000) {
  const request = response.request();
  const failure = Promise.withResolvers();
  const onFailed = (failedRequest) => {
    if (failedRequest !== request) return;
    const error = new Error('Cookie acceptance request failed');
    error.name = 'CookieAcceptanceRequestError';
    failure.reject(error);
  };
  context.on('requestfailed', onFailed);
  if (request.failure()) onFailed(request);
  try {
    return await withCookieDeadline(
      () => Promise.race([response.finished(), failure.promise]),
      timeoutMs,
      'response-finished',
    );
  } finally {
    context.off('requestfailed', onFailed);
  }
}

/**
 * 作者Actionだけ、同じ元Responseのconsumer EOFを毎回必須にする。
 * ChromiumのERR_ABORTEDはEOF証拠がある場合だけ固定分類として残し、他の失敗は伝える。
 * verifyConsumerは追加readをせず、一意対応・byte数・EOF・例外/cancelなしを検査する。
 */
export async function finishCookieActionResponse(
  context,
  response,
  verifyConsumer,
  timeoutMs = 30000,
) {
  return withCookieDeadline(
    async () => {
      let browserTerminal = 'finished';
      try {
        const result = await finishCookieResponse(context, response, timeoutMs);
        if (result !== null) {
          const error = new Error('Cookie acceptance request failed');
          error.name = 'CookieAcceptanceRequestError';
          throw error;
        }
      } catch (error) {
        if (
          error.name !== 'CookieAcceptanceRequestError' ||
          response.request().failure()?.errorText !== 'net::ERR_ABORTED'
        )
          throw error;
        browserTerminal = 'net::ERR_ABORTED';
      }
      if ((await verifyConsumer()) !== true) {
        const error = new Error('Cookie acceptance consumer did not complete');
        error.name = 'CookieAcceptanceConsumerError';
        throw error;
      }
      return { completed: true, browserTerminal, consumerEof: true };
    },
    timeoutMs,
    'action-consumer-eof',
  );
}

/** 一つの回収失敗で後続を省略せず、この検査が所有する接続だけを閉じる。 */
export async function cleanupCookieAcceptance({
  stop,
  context,
  browser,
  bridges = [],
  closeTimeoutMs = 5000,
  onStage = () => {},
}) {
  const tasks = [
    ...(stop ? [{ stage: 'cleanup-stop', action: stop, timeoutMs: 30000 }] : []),
    ...(context ? [{ stage: 'cleanup-context', action: () => context.close() }] : []),
    ...(browser ? [{ stage: 'cleanup-browser', action: () => browser.close() }] : []),
    ...bridges.map(({ server, sockets }) => ({
      stage: 'cleanup-bridge',
      action: () => {
        // closeAllConnectionsだけではupgrade済みWebSocketを閉じられない。
        for (const socket of sockets) socket.destroy();
        server.closeAllConnections?.();
        return new Promise((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        });
      },
    })),
  ];
  const failures = [];
  for (const { stage, action, timeoutMs = closeTimeoutMs } of tasks) {
    onStage(stage, 'started');
    try {
      await withCookieDeadline(action, timeoutMs, stage);
      onStage(stage, 'completed');
    } catch (error) {
      failures.push({ stage, category: error.name });
      onStage(stage, 'failed');
    }
  }
  return failures;
}
import { clearTimeout, setTimeout } from 'node:timers';
