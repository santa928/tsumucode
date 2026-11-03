import { z } from 'zod';
import {
  PYTHON_LESSONS,
  validPythonFiles,
  validPythonInputLines,
  pythonSourceSnapshot,
} from '../../../core/runtime/pythonLessonProfiles.mjs';
import type { PythonCoreLoader } from './PythonExecutionService';
import { PYTHON_LIMITS } from './pythonProtocol';
import { createPythonPracticeFrameSource } from './pythonPracticeFrameSource';
import {
  pythonPracticeIdentitySchema,
  pythonPracticeSnapshotSchema,
  type PythonPracticeClient,
  type PythonPracticeRequest,
  type PythonPracticeSnapshot,
} from './pythonPracticeContract';

export function supportsBrowserPythonPractice(): boolean {
  return (
    typeof Reflect.get(WebAssembly, 'Suspending') === 'function' &&
    typeof Reflect.get(WebAssembly, 'promising') === 'function'
  );
}

interface ActivePractice {
  snapshot?: PythonPracticeSnapshot;
  inputCount: number;
  inputBytes: number;
  stop(): Promise<PythonPracticeSnapshot | undefined>;
  send(value: unknown): void;
}

/** 対話出力は一時snapshotだけ。通常のExecutionService/Validatorへ渡す経路を持たない。 */
export class BrowserPythonPracticeClient implements PythonPracticeClient {
  #generation = 0;
  #abort: AbortController | undefined;
  #active: ActivePractice | undefined;

  constructor(
    private readonly loadCore: PythonCoreLoader,
    private readonly supported = supportsBrowserPythonPractice,
  ) {}

  async start(
    request: PythonPracticeRequest,
    onSnapshot: (value: PythonPracticeSnapshot) => void,
  ): Promise<void> {
    const stopping = this.stop();
    const generation = this.#generation;
    await stopping;
    if (generation !== this.#generation) return;
    if (!this.supported())
      throw new Error(
        'このブラウザはPythonの対話練習に未対応です。事前入力のプレビューを利用してください。',
      );
    const profile = PYTHON_LESSONS[request.exerciseId]?.profile;
    if (
      profile === undefined ||
      !['input-echo-v1', 'age-branch-v1', 'range-loop-v1'].includes(profile) ||
      !validPythonFiles(request.files, profile)
    )
      throw new Error('この教材のBrowser対話練習には未対応です。');
    const files = { ...request.files };
    const abort = new AbortController();
    this.#abort = abort;
    const timeout = setTimeout(() => {
      abort.abort();
    }, PYTHON_LIMITS.downloadMilliseconds);
    try {
      const [core, digest] = await Promise.all([
        this.loadCore(abort.signal),
        crypto.subtle.digest(
          'SHA-256',
          new TextEncoder().encode(pythonSourceSnapshot(files, profile)),
        ),
      ]);
      if (generation !== this.#generation) return;
      if (abort.signal.aborted)
        throw new Error('Python実行環境の準備が時間内に完了しませんでした。未採点です。');
      clearTimeout(timeout);
      const identity = pythonPracticeIdentitySchema.parse({
        runId: crypto.randomUUID(),
        sessionId: request.exerciseSessionId,
        executionRevision: request.executionRevision,
        sourceHash: [...new Uint8Array(digest)]
          .map((byte) => byte.toString(16).padStart(2, '0'))
          .join(''),
      });
      await new Promise<void>((resolve) => {
        const frame = document.createElement('iframe');
        frame.hidden = true;
        frame.title = 'Pythonの対話練習（未採点）';
        frame.sandbox.add('allow-scripts');
        let done = false;
        let ready = false;
        let stopPromise: Promise<PythonPracticeSnapshot | undefined> | undefined;
        let stopResolve: ((value: PythonPracticeSnapshot | undefined) => void) | undefined;
        let stopTimer: ReturnType<typeof setTimeout> | undefined;
        const empty: PythonPracticeSnapshot = {
          purpose: 'practice',
          identity,
          phase: 'preparing',
          reason: null,
          inputRequestSequence: null,
          inputCount: 0,
          inputBytes: 0,
          activeMs: 0,
          waitingMs: 0,
          elapsedMs: 0,
          stdout: '',
          stderr: '',
          removed: false,
          recoveryNeeded: false,
          purged: false,
          exitCode: null,
        };
        const finish = (value: PythonPracticeSnapshot): void => {
          if (done) return;
          done = true;
          clearTimeout(watchdog);
          clearTimeout(stopTimer);
          window.removeEventListener('message', receive);
          // frameが作ったWorkerの所有documentも破棄し、次runへ資源を持ち越さない。
          frame.remove();
          if (this.#active === active) this.#active = undefined;
          active.inputCount = active.inputBytes = 0;
          stopResolve?.({ ...value, stdout: '', stderr: '', purged: true });
          resolve();
          if (generation === this.#generation) onSnapshot(value);
        };
        const receive = (event: MessageEvent<unknown>): void => {
          if (
            !event.isTrusted ||
            event.source !== frame.contentWindow ||
            event.origin !== 'null' ||
            done
          )
            return;
          const message = z
            .object({ type: z.string(), snapshot: z.unknown().optional() })
            .safeParse(event.data);
          if (!message.success) return;
          if (!ready && message.data.type === 'python-frame-ready') {
            ready = true;
            frame.contentWindow?.postMessage(
              { ...core, identity, files, source: files['main.py'], profile },
              '*',
            );
            if (stopPromise !== undefined) frame.contentWindow?.postMessage('python-stop', '*');
            return;
          }
          if (!ready || message.data.type !== 'python-practice-snapshot') return;
          const parsed = pythonPracticeSnapshotSchema.safeParse(message.data.snapshot);
          if (!parsed.success || JSON.stringify(parsed.data.identity) !== JSON.stringify(identity))
            return;
          const value = parsed.data;
          if (
            new TextEncoder().encode(value.stdout).byteLength +
              new TextEncoder().encode(value.stderr).byteLength >
            PYTHON_LIMITS.outputBytes
          )
            return;
          active.snapshot = value;
          if (value.phase === 'ended' && value.removed) finish(value);
          else if (generation === this.#generation) onSnapshot(value);
        };
        const active: ActivePractice = {
          snapshot: empty,
          inputCount: 0,
          inputBytes: 0,
          send: (value: unknown) => frame.contentWindow?.postMessage(value, '*'),
          stop: () => {
            stopPromise ??= new Promise((doneStopping) => {
              stopResolve = doneStopping;
              if (ready) frame.contentWindow?.postMessage('python-stop', '*');
              stopTimer = setTimeout(() => {
                finish({ ...empty, phase: 'ended', reason: 'cancelled', removed: true });
              }, 2000);
            });
            return stopPromise;
          },
        };
        const watchdog = setTimeout(
          () => {
            finish({ ...empty, phase: 'ended', reason: 'system-error', removed: true });
          },
          PYTHON_LIMITS.initializationMilliseconds + PYTHON_LIMITS.executionMilliseconds + 65_000,
        );
        this.#active = active;
        window.addEventListener('message', receive);
        frame.srcdoc = createPythonPracticeFrameSource(crypto.randomUUID().replaceAll('-', ''));
        document.body.append(frame);
      });
    } finally {
      clearTimeout(timeout);
      if (this.#abort === abort) this.#abort = undefined;
    }
  }

  async send(sequence: number, line?: string, eof = false): Promise<void> {
    const active = this.#active;
    const snapshot = active?.snapshot;
    if (
      active === undefined ||
      snapshot?.phase !== 'waiting-input' ||
      snapshot.inputRequestSequence !== sequence
    )
      throw new Error('現在の入力待機と一致しません。古い入力は送信できません。');
    const bytes =
      typeof line === 'string'
        ? new TextEncoder().encode(line).byteLength + (active.inputCount > 0 ? 1 : 0)
        : 0;
    if (
      !eof &&
      (typeof line !== 'string' ||
        !validPythonInputLines([line]) ||
        active.inputCount >= 16 ||
        active.inputBytes + bytes > 1024)
    )
      throw new Error('入力は16行・UTF-8で1 KiB以内にしてください。');
    if (!eof) {
      active.inputCount += 1;
      active.inputBytes += bytes;
    }
    active.snapshot = { ...snapshot, phase: 'resuming', inputRequestSequence: null };
    active.send({
      type: 'python-practice-input',
      identity: snapshot.identity,
      sequence,
      ...(eof ? { eof: true } : { line }),
    });
  }

  async stop(): Promise<PythonPracticeSnapshot | undefined> {
    this.#generation += 1;
    this.#abort?.abort();
    return this.#active?.stop();
  }
}
