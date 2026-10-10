import { PYTHON_LIMITS } from './pythonProtocol';

/** opaque frameがWorkerと期限を所有し、停止応答の前に全実行資源を片付ける。 */
function initializePythonFrame(limits: typeof PYTHON_LIMITS): void {
  let worker: Worker | undefined;
  let url: string | undefined;
  let channel: MessageChannel | undefined;
  let done = false;
  let started = false;
  let timer: ReturnType<typeof setTimeout>;
  const finish = (value: unknown): void => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    worker?.terminate();
    channel?.port1.close();
    channel?.port2.close();
    if (url !== undefined) URL.revokeObjectURL(url);
    parent.postMessage(value, '*');
  };
  const failure = (status: string, error: string, reason?: string): void => {
    finish({ type: 'python-result', status, error, reason, stdout: '', stderr: '', rows: [] });
  };
  timer = setTimeout(() => {
    failure('system-error', 'Python初期化が時間内に完了しませんでした。');
  }, limits.initializationMilliseconds);
  addEventListener('message', (event: MessageEvent<unknown>) => {
    if (!event.isTrusted || event.source !== parent || done) return;
    if (event.data === 'python-stop') {
      failure('stopped', '実行を停止しました。採点していません。', 'manual-stop');
      return;
    }
    if (started || typeof event.data !== 'object' || event.data === null) return;
    started = true;
    const data = event.data as Record<string, unknown>;
    if (typeof data.workerSource !== 'string') {
      failure('system-error', 'Python Workerがありません。');
      return;
    }
    try {
      url = URL.createObjectURL(new Blob([data.workerSource], { type: 'text/javascript' }));
      worker = new Worker(url);
      channel = new MessageChannel();
      let ready = false;
      channel.port1.onmessage = (message: MessageEvent<unknown>): void => {
        const value = message.data;
        if (typeof value !== 'object' || value === null || !('type' in value)) return;
        if (value.type === 'python-ready') {
          if (ready) return;
          ready = true;
          clearTimeout(timer);
          timer = setTimeout(() => {
            failure('stopped', '実行時間の上限に達したため停止しました。', 'time-limit');
          }, limits.executionMilliseconds);
          return;
        }
        if (value.type === 'python-result') finish(value);
      };
      worker.onerror = () => {
        failure('system-error', 'Python Workerの起動に失敗しました。');
      };
      worker.postMessage(
        { wasm: data.wasm, stdlib: data.stdlib, lock: data.lock, source: data.source },
        [channel.port2],
      );
    } catch {
      failure('system-error', 'Python実行環境を準備できませんでした。');
    }
  });
  parent.postMessage({ type: 'python-frame-ready' }, '*');
}

/** 本人承認済みのローカルPython専用CSP。親と既存JS/DOM Runnerへは適用しない。 */
export function createPythonFrameSource(nonce: string): string {
  if (!/^[a-zA-Z0-9]+$/u.test(nonce)) throw new Error('Python nonce invalid');
  const script = `(${initializePythonFrame.toString()})(${JSON.stringify(PYTHON_LIMITS)});`;
  return `<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}' 'wasm-unsafe-eval'; worker-src blob:; connect-src 'none';"><script nonce="${nonce}">${script}</script>`;
}
