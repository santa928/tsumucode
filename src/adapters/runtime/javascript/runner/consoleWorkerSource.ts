import { CONSOLE_LIMITS, createConsoleFormatter, type ConsoleLimits } from './consoleFormatter';

/** 学習scriptとは別のscopeでnative参照とportを所有し、認証済み内部通知だけをhandledにする。 */
function initializeWorker(
  formatFactory: typeof createConsoleFormatter,
  limits: ConsoleLimits,
): boolean {
  const root = self as unknown as Record<string, unknown>;
  const apply = Reflect.apply.bind(Reflect);
  const define = Object.defineProperty.bind(Object);
  const prototype = Object.getPrototypeOf.bind(Object);
  const names = Object.getOwnPropertyNames.bind(Object);
  const objectPrototype = Object.prototype;
  const add = EventTarget.prototype.addEventListener.bind(self);
  // eslint-disable-next-line @typescript-eslint/unbound-method -- 捕捉済みreceiverへapplyする。
  const stop = Event.prototype.stopImmediatePropagation;
  // eslint-disable-next-line @typescript-eslint/unbound-method -- 捕捉済みreceiverへapplyする。
  const prevent = Event.prototype.preventDefault;
  // eslint-disable-next-line @typescript-eslint/unbound-method -- private portだけをreceiverにする。
  const post = MessagePort.prototype.postMessage;
  // eslint-disable-next-line @typescript-eslint/unbound-method -- 捕捉したnative関数を固定receiverへapplyする。
  const ports = Object.getOwnPropertyDescriptor(MessageEvent.prototype, 'ports')?.get;
  // eslint-disable-next-line @typescript-eslint/unbound-method -- 捕捉したnative関数を固定receiverへapplyする。
  const promise = Object.getOwnPropertyDescriptor(PromiseRejectionEvent.prototype, 'promise')?.get;
  // eslint-disable-next-line @typescript-eslint/unbound-method -- 捕捉したnative関数を固定receiverへapplyする。
  const errorMessage = Object.getOwnPropertyDescriptor(ErrorEvent.prototype, 'message')?.get;
  // eslint-disable-next-line @typescript-eslint/unbound-method -- 秘密markerだけをreceiverにする。
  const promiseThen = Promise.prototype.then;
  if (ports === undefined || promise === undefined || errorMessage === undefined)
    throw new Error('Worker intrinsic unavailable');

  const push = Array.prototype.push;
  // eslint-disable-next-line @typescript-eslint/unbound-method -- 捕捉したString.sliceをmessageへapplyする。
  const slice = String.prototype.slice;
  const schedule = setTimeout.bind(self);
  const enqueue = queueMicrotask.bind(self);
  const encoder = new TextEncoder();
  const encode = encoder.encode.bind(encoder);
  const format = formatFactory(limits);
  const rows: { level: 'log' | 'info' | 'warn' | 'error'; text: string }[] = [];
  Object.setPrototypeOf(rows, null);
  let port: MessagePort | undefined;
  let settled = false;
  let finished = false;
  let armed = false;
  let total = 0;
  let limited = false;
  let preparationFailed = false;
  let fault: string | undefined;
  let rejectMarker: (reason: unknown) => void = () => {
    throw new Error('Marker unavailable');
  };
  const marker = new Promise((_resolve, reject) => {
    rejectMarker = reject;
  });
  // native thenが学習者のPromise.prototype.constructor/species getterを参照しない。
  void define(marker, 'constructor', { value: undefined, writable: false, configurable: false });
  const send = (): void => {
    if (port === undefined || !finished || settled) return;
    settled = true;
    apply(post, port, [
      {
        type: 'console-result',
        status: preparationFailed
          ? 'system-error'
          : limited
            ? 'stopped'
            : fault === undefined
              ? 'succeeded'
              : 'code-error',
        rows,
        error: limited ? 'Console output limit' : fault,
      },
    ]);
  };
  add(
    'message',
    (event: Event) => {
      if (!event.isTrusted) return;
      apply(stop, event, []);
      const received = apply(ports, event, []) as readonly MessagePort[];
      if (port !== undefined || received.length !== 1) return;
      port = received[0];
      send();
    },
    true,
  );
  add(
    'error',
    (event: Event) => {
      apply(stop, event, []);
      apply(prevent, event, []);
      const message: unknown = apply(errorMessage, event, []);
      fault = typeof message === 'string' ? apply(slice, message, [0, 4096]) : 'Runtime error';
    },
    true,
  );
  add(
    'unhandledrejection',
    (event: Event) => {
      apply(stop, event, []);
      apply(prevent, event, []);
      let rejected: unknown;
      try {
        rejected = apply(promise, event, []);
      } catch {
        return;
      }
      if (armed && rejected === marker && !settled) {
        // 認証した内部通知だけをhandledへする。学習者の拒否は下のfaultに残す。
        void apply(promiseThen, marker, [undefined, () => undefined]);
        finished = true;
        send();
      } else fault = 'Unhandled Promise rejection';
    },
    true,
  );
  add(
    'rejectionhandled',
    (event: Event) => {
      apply(stop, event, []);
      apply(prevent, event, []);
    },
    true,
  );
  const output = (level: 'log' | 'info' | 'warn' | 'error', args: readonly unknown[]): void => {
    if (limited || finished) return;
    const text = format(args);
    const bytes = encode(text).byteLength;
    if (rows.length >= limits.records || total + bytes > limits.totalBytes) {
      limited = true;
      return;
    }
    total += bytes;
    apply(push, rows, [{ level, text }]);
  };
  define(root, 'console', {
    value: Object.freeze({
      log: (...args: unknown[]) => {
        output('log', args);
      },
      info: (...args: unknown[]) => {
        output('info', args);
      },
      warn: (...args: unknown[]) => {
        output('warn', args);
      },
      error: (...args: unknown[]) => {
        output('error', args);
      },
    }),
    writable: false,
    configurable: false,
  });
  define(root, 'queueMicrotask', {
    value: (callback: VoidFunction) => {
      enqueue(callback);
    },
    writable: false,
    configurable: false,
  });
  const allowed = new Set([
    'undefined',
    'NaN',
    'Infinity',
    'Object',
    'Array',
    'String',
    'Number',
    'Boolean',
    'BigInt',
    'Symbol',
    'Math',
    'JSON',
    'RegExp',
    'Date',
    'Map',
    'Set',
    'WeakMap',
    'WeakSet',
    'Promise',
    'Error',
    'EvalError',
    'RangeError',
    'ReferenceError',
    'SyntaxError',
    'TypeError',
    'URIError',
    'AggregateError',
    'Reflect',
    'Proxy',
    'parseInt',
    'parseFloat',
    'isNaN',
    'isFinite',
    'decodeURI',
    'decodeURIComponent',
    'encodeURI',
    'encodeURIComponent',
    'console',
    'queueMicrotask',
  ]);
  try {
    for (
      let object: Record<string, unknown> | null = root;
      object !== null && object !== objectPrototype;
      object = prototype(object) as Record<string, unknown> | null
    ) {
      for (const name of names(object)) {
        if (allowed.has(name)) continue;
        // Browserのnon-configurable WebIDL定数。固定値で能力を持たないものだけ残す。
        const descriptor = Object.getOwnPropertyDescriptor(object, name);
        if (
          descriptor !== undefined &&
          'value' in descriptor &&
          ((name === 'TEMPORARY' && descriptor.value === 0) ||
            (name === 'PERSISTENT' && descriptor.value === 1))
        )
          continue;
        define(object, name, { value: undefined, writable: false, configurable: false });
        if (object[name] !== undefined) throw new Error('Capability remains');
      }
    }
  } catch {
    preparationFailed = true;
    fault = 'Worker capability preparation failed';
    finished = true;
    send();
    return false;
  }
  // 秘密markerを事前にhandledへし、拒否callbackの次taskまで学習者の拒否通知を収集する。
  schedule(() => {
    armed = true;
    void apply(promiseThen, marker, [
      undefined,
      () => {
        schedule(() => {
          finished = true;
          send();
        }, 0);
      },
    ]);
    rejectMarker(null);
  }, 0);
  return true;
}

/** opaque iframeは制御だけを行い、学習者コードを実行しない。期限はWorker外で維持する。 */
function initializeFrame(workerSource: string): void {
  const workerUrl = URL.createObjectURL(new Blob([workerSource], { type: 'text/javascript' }));
  let worker: Worker;
  try {
    worker = new Worker(workerUrl);
  } catch {
    URL.revokeObjectURL(workerUrl);
    parent.postMessage(
      { type: 'console-result', status: 'system-error', rows: [], error: 'Worker unavailable' },
      '*',
    );
    return;
  }
  const channel = new MessageChannel();
  let settled = false;
  const finish = (result: unknown): void => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    worker.terminate();
    channel.port1.close();
    URL.revokeObjectURL(workerUrl);
    parent.postMessage(result, '*');
  };
  const timer = setTimeout(() => {
    finish({
      type: 'console-result',
      status: 'stopped',
      rows: [],
      error: 'Execution time limit',
    });
  }, 1500);
  addEventListener('message', (event: MessageEvent<unknown>) => {
    if (event.source === parent && event.data === 'stop')
      finish({ type: 'console-result', status: 'stopped', rows: [], error: 'Execution stopped' });
  });
  channel.port1.onmessage = (event: MessageEvent<unknown>): void => {
    const value = event.data;
    if (
      typeof value !== 'object' ||
      value === null ||
      !('type' in value) ||
      value.type !== 'console-result' ||
      !('status' in value) ||
      !['succeeded', 'code-error', 'stopped', 'system-error'].includes(String(value.status)) ||
      !('rows' in value) ||
      !Array.isArray(value.rows) ||
      value.rows.length > 100
    )
      return;
    let total = 0;
    for (const row of value.rows as unknown[]) {
      if (
        typeof row !== 'object' ||
        row === null ||
        !('text' in row) ||
        typeof row.text !== 'string' ||
        !('level' in row) ||
        !['log', 'info', 'warn', 'error'].includes(String(row.level))
      )
        return;
      const bytes = new TextEncoder().encode(row.text).byteLength;
      if (bytes > 4096) return;
      total += bytes;
    }
    if (total > 65536) return;
    finish(value);
  };
  // 学習者のerrorはWorkerの先行listenerが処理する。ここは起動・bootstrap障害。
  worker.onerror = () => {
    finish({
      type: 'console-result',
      status: 'system-error',
      rows: [],
      error: 'Worker bootstrap failed',
    });
  };
  worker.postMessage(null, [channel.port2]);
}

/** strict scriptとして検査済みのsourceだけを渡す。varもbootstrapのglobalへhoistさせない。 */
export function createConsoleFrameSource(source: string, nonce: string): string {
  const worker = `"use strict";\nif((${initializeWorker.toString()})(${createConsoleFormatter.toString()},${JSON.stringify(CONSOLE_LIMITS)})){(()=>{\n${source}\n})()}`;
  const bootstrap = `(${initializeFrame.toString()})(${JSON.stringify(worker).replaceAll('<', '\\u003c')});`;
  return `<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; worker-src blob:; connect-src 'none';"><script nonce="${nonce}">${bootstrap}</script>`;
}
