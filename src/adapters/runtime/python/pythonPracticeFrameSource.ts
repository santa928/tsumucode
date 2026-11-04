import { PYTHON_LIMITS } from './pythonProtocol';
import { PYTHON_PRACTICE_LIMITS } from './pythonPracticeContract';

/** このframeがWorker、入力の相関、計算/待機時計と回収を所有する。 */
function initializePracticeFrame(
  limits: typeof PYTHON_LIMITS,
  inputLimits: typeof PYTHON_PRACTICE_LIMITS,
): void {
  let worker: Worker | undefined;
  let channel: MessageChannel | undefined;
  let url: string | undefined;
  let started = false;
  let done = false;
  let ready = false;
  let identity: unknown;
  let phase = 'preparing';
  let sequence: number | null = null;
  let lastSequence = 0;
  let inputCount = 0;
  let inputBytes = 0;
  let stdout = '';
  let stderr = '';
  let activeMs = 0;
  let waitingMs = 0;
  let began = performance.now();
  let since = began;
  let timer: ReturnType<typeof setTimeout>;
  let wholeTimer: ReturnType<typeof setTimeout> | undefined;
  const encoder = new TextEncoder();
  const validLine = (value: unknown): value is string => {
    if (typeof value !== 'string') return false;
    // ASCII制御文字だけを調べる。入力のUnicode文字列を分割・変更しない。
    for (let offset = 0; offset < value.length; offset += 1) {
      const code = value.charCodeAt(offset);
      if ((code < 32 && code !== 9) || code === 127) return false;
    }
    return true;
  };
  const account = (): void => {
    const now = performance.now();
    if (ready) {
      if (phase === 'waiting-input') waitingMs += now - since;
      else activeMs += now - since;
    }
    since = now;
  };
  const snapshot = (reason: string | null = null): void => {
    if (identity === undefined) return;
    parent.postMessage(
      {
        type: 'python-practice-snapshot',
        snapshot: {
          purpose: 'practice',
          identity,
          phase,
          reason,
          inputRequestSequence: sequence,
          inputCount,
          inputBytes,
          activeMs: Math.ceil(activeMs),
          waitingMs: Math.ceil(waitingMs),
          elapsedMs: Math.ceil(performance.now() - began),
          stdout,
          stderr,
          removed: done,
          recoveryNeeded: false,
          purged: false,
          exitCode: null,
        },
      },
      '*',
    );
  };
  const finish = (reason: string): void => {
    if (done) return;
    account();
    done = true;
    clearTimeout(timer);
    clearTimeout(wholeTimer);
    worker?.terminate();
    channel?.port1.close();
    channel?.port2.close();
    if (url !== undefined) URL.revokeObjectURL(url);
    phase = 'ended';
    sequence = null;
    snapshot(reason);
  };
  const arm = (): boolean => {
    clearTimeout(timer);
    const waiting = phase === 'waiting-input';
    const remaining = waiting
      ? inputLimits.waitingMilliseconds - waitingMs
      : limits.executionMilliseconds - activeMs;
    if (remaining <= 0) {
      finish(waiting ? 'input-timeout' : 'time-limit');
      return false;
    }
    timer = setTimeout(() => {
      finish(waiting ? 'input-timeout' : 'time-limit');
    }, remaining);
    return true;
  };
  const readOutput = (value: Record<string, unknown>): boolean => {
    if (typeof value.stdout !== 'string' || typeof value.stderr !== 'string') return false;
    if (
      encoder.encode(value.stdout).byteLength + encoder.encode(value.stderr).byteLength >
      limits.outputBytes
    )
      return false;
    stdout = value.stdout;
    stderr = value.stderr;
    return true;
  };
  timer = setTimeout(() => {
    finish('initialization-timeout');
  }, limits.initializationMilliseconds);
  addEventListener('message', (event: MessageEvent<unknown>) => {
    if (!event.isTrusted || event.source !== parent || done) return;
    if (event.data === 'python-stop') {
      finish('cancelled');
      return;
    }
    if (typeof event.data !== 'object' || event.data === null) return;
    const data = event.data as Record<string, unknown>;
    if (started) {
      if (
        data.type !== 'python-practice-input' ||
        phase !== 'waiting-input' ||
        JSON.stringify(data.identity) !== JSON.stringify(identity) ||
        data.sequence !== sequence
      )
        return;
      const eof = data.eof === true;
      if (!eof && !validLine(data.line)) return;
      const bytes = eof
        ? 0
        : encoder.encode(data.line as string).byteLength + (inputCount > 0 ? 1 : 0);
      if (
        !eof &&
        (inputCount >= inputLimits.inputLines || inputBytes + bytes > inputLimits.inputBytes)
      ) {
        finish('input-limit');
        return;
      }
      account();
      if (waitingMs >= inputLimits.waitingMilliseconds) {
        finish('input-timeout');
        return;
      }
      // 入力を解放するより先に、計算時計とその期限を戻す。
      phase = 'running';
      sequence = null;
      if (!eof) {
        inputCount += 1;
        inputBytes += bytes;
      }
      if (!arm()) return;
      snapshot();
      channel?.port1.postMessage({
        type: data.type,
        sequence: data.sequence,
        ...(eof ? { eof: true } : { line: data.line }),
      });
      return;
    }
    started = true;
    identity = data.identity;
    if (typeof data.workerSource !== 'string' || identity === undefined) {
      finish('invalid-request');
      return;
    }
    snapshot();
    try {
      url = URL.createObjectURL(new Blob([data.workerSource], { type: 'text/javascript' }));
      worker = new Worker(url);
      channel = new MessageChannel();
      channel.port1.onmessage = (message: MessageEvent<unknown>): void => {
        if (done || typeof message.data !== 'object' || message.data === null) return;
        const value = message.data as Record<string, unknown>;
        if (value.type === 'python-ready') {
          if (ready) return;
          ready = true;
          began = since = performance.now();
          phase = 'running';
          wholeTimer = setTimeout(() => {
            finish('total-timeout');
          }, limits.executionMilliseconds + inputLimits.waitingMilliseconds);
          if (arm()) snapshot();
        } else if (value.type === 'python-practice-wait') {
          if (
            !ready ||
            phase !== 'running' ||
            value.sequence !== lastSequence + 1 ||
            !readOutput(value)
          ) {
            finish('invalid-runtime');
            return;
          }
          account();
          // taskの遅延や期限直前の申告で、使い切った計算予算を延長しない。
          if (activeMs >= limits.executionMilliseconds) {
            finish('time-limit');
            return;
          }
          if (lastSequence >= inputLimits.inputLines + 1) {
            finish('input-limit');
            return;
          }
          lastSequence += 1;
          sequence = lastSequence;
          phase = 'waiting-input';
          if (arm()) snapshot();
        } else if (value.type === 'python-practice-unavailable') {
          finish('unsupported-runtime');
        } else if (value.type === 'python-result') {
          if (!readOutput(value)) {
            finish('invalid-runtime');
            return;
          }
          if (value.status === 'system-error' && typeof value.error === 'string') {
            // 環境障害の詳細は今回の非永続Consoleだけに表示する。
            const detail = `Python環境: ${value.error.slice(0, 4096)}\n`;
            if (encoder.encode(stdout + stderr + detail).byteLength <= limits.outputBytes)
              stderr += detail;
          }
          finish(
            value.status === 'succeeded'
              ? 'completed'
              : value.status === 'unsupported' &&
                  typeof value.error === 'string' &&
                  value.error.includes('（EOF）')
                ? 'eof'
                : value.reason === 'output-limit'
                  ? 'output-limit'
                  : String(value.status),
          );
        }
      };
      worker.onerror = () => {
        finish('system-error');
      };
      worker.postMessage(
        {
          purpose: 'practice',
          wasm: data.wasm,
          stdlib: data.stdlib,
          lock: data.lock,
          source: data.source,
          files: data.files,
          profile: data.profile,
        },
        [channel.port2],
      );
    } catch {
      finish('system-error');
    }
  });
  parent.postMessage({ type: 'python-frame-ready' }, '*');
}

export function createPythonPracticeFrameSource(nonce: string): string {
  if (!/^[a-zA-Z0-9]+$/u.test(nonce)) throw new Error('Python nonce invalid');
  const script = `(${initializePracticeFrame.toString()})(${JSON.stringify(PYTHON_LIMITS)}, ${JSON.stringify(PYTHON_PRACTICE_LIMITS)});`;
  return `<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}' 'wasm-unsafe-eval'; worker-src blob:; connect-src 'none';"><script nonce="${nonce}">${script}</script>`;
}
