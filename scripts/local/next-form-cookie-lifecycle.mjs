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
