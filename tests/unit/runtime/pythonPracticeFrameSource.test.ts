import { runInNewContext } from 'node:vm';
import { afterEach, expect, it, vi } from 'vitest';
import { createPythonPracticeFrameSource } from '../../../src/adapters/runtime/python/pythonPracticeFrameSource';

const identity = { runId: 'one', sessionId: 'session', executionRevision: 1, sourceHash: 'hash' };
function frame() {
  vi.useFakeTimers();
  let now = 0;
  let receive!: (event: unknown) => void;
  const posts: { type: string; snapshot?: Record<string, unknown> }[] = [];
  const parent = { postMessage: (value: (typeof posts)[number]) => posts.push(value) };
  const terminate = vi.fn();
  const input = vi.fn();
  const port = {
    onmessage: undefined as ((event: unknown) => void) | undefined,
    close: vi.fn(),
    postMessage: input,
  };
  class Channel {
    port1 = port;
    port2 = { close: vi.fn() };
  }
  class Worker {
    terminate = terminate;
    postMessage = vi.fn();
    onerror = undefined;
  }
  const source = createPythonPracticeFrameSource('testnonce');
  const script = source.slice(
    source.indexOf('<script nonce="testnonce">') + '<script nonce="testnonce">'.length,
    source.indexOf('</script>'),
  );
  runInNewContext(script, {
    parent,
    Worker,
    MessageChannel: Channel,
    TextEncoder,
    Blob,
    URL: { createObjectURL: () => 'blob:test', revokeObjectURL: vi.fn() },
    performance: { now: () => now },
    setTimeout,
    clearTimeout,
    addEventListener: (_: string, callback: typeof receive) => {
      receive = callback;
    },
  });
  const send = (data: unknown) => {
    receive({ isTrusted: true, source: parent, data });
  };
  const deliver = (data: unknown) => {
    port.onmessage?.({ data });
  };
  const last = () => posts.at(-1)?.snapshot;
  send({ identity, workerSource: '', profile: 'input-echo-v1' });
  deliver({ type: 'python-ready' });
  return {
    send,
    deliver,
    last,
    input,
    terminate,
    wait: () => {
      deliver({ type: 'python-practice-wait', sequence: 1, stdout: '', stderr: '' });
    },
    tick: (ms: number) => {
      now += ms;
      vi.advanceTimersByTime(ms);
    },
    clock: (ms: number) => {
      now = ms;
    },
  };
}
afterEach(() => vi.useRealTimers());

it('待機を計算時間に含めず、送信後は残りの計算予算だけで停止する', () => {
  const test = frame();
  test.tick(500);
  test.wait();
  test.tick(1000);
  expect(test.last()?.phase).toBe('waiting-input');
  test.send({ type: 'python-practice-input', identity, sequence: 1, line: '' });
  expect(test.input).toHaveBeenCalledOnce();
  test.tick(999);
  expect(test.last()?.phase).toBe('running');
  test.tick(1);
  expect(test.last()).toMatchObject({
    phase: 'ended',
    reason: 'time-limit',
    activeMs: 1500,
    waitingMs: 1000,
    removed: true,
  });
  expect(test.terminate).toHaveBeenCalledOnce();
});

it.each(['runId', 'sessionId', 'executionRevision', 'sourceHash'] as const)(
  '別identityの入力を拒否する: %s',
  (field) => {
    const test = frame();
    test.wait();
    test.send({
      type: 'python-practice-input',
      identity: { ...identity, [field]: 'old' },
      sequence: 1,
      line: 'late',
    });
    expect(test.input).not.toHaveBeenCalled();
    expect(test.last()?.phase).toBe('waiting-input');
  },
);

it('同一要求の二重送信と停止後の遅延入力を破棄する', () => {
  const test = frame();
  test.wait();
  const packet = { type: 'python-practice-input', identity, sequence: 1, line: 'once' };
  test.send(packet);
  test.send(packet);
  expect(test.input).toHaveBeenCalledOnce();
  test.send('python-stop');
  test.send(packet);
  expect(test.input).toHaveBeenCalledOnce();
  expect(test.last()).toMatchObject({ phase: 'ended', reason: 'cancelled', removed: true });
});

it('計算期限を過ぎた待機申告で期限を延長しない', () => {
  const test = frame();
  test.clock(1501);
  test.wait();
  expect(test.last()).toMatchObject({ phase: 'ended', reason: 'time-limit' });
});

it('待機期限の直前に届いた入力も期限後なら解放しない', () => {
  const test = frame();
  test.wait();
  test.clock(60001);
  test.send({ type: 'python-practice-input', identity, sequence: 1, line: 'late' });
  expect(test.input).not.toHaveBeenCalled();
  expect(test.last()).toMatchObject({ phase: 'ended', reason: 'input-timeout' });
});

it.each(['\n', '\r', '\u0000', '\u007f'])('1回の入力に行区切りや制御文字を通さない: %j', (line) => {
  const test = frame();
  test.wait();
  test.send({ type: 'python-practice-input', identity, sequence: 1, line });
  expect(test.input).not.toHaveBeenCalled();
  expect(test.last()).toMatchObject({ phase: 'waiting-input', inputCount: 0 });
  test.send({ type: 'python-practice-input', identity, sequence: 1, line: '\t' });
  expect(test.input).toHaveBeenCalledOnce();
});
