// @vitest-environment node
import { expect, it } from 'vitest';
import { runInNewContext } from 'node:vm';
import { inspectPythonFirstHistory } from '../../../../scripts/release/v2/pythonFirstHistory';
import { releaseFixture } from './releaseFixture';

const bytes = (value: unknown) => Buffer.from(JSON.stringify(value));

it('rejects a synthetic predecessor rather than allowing a self-hash to replace the fixed tag', () => {
  const captured = releaseFixture().capturedBaseline;
  const tag = Buffer.from('synthetic annotated tag');
  const history = bytes({ proof: captured.proof, tagObject: tag.toString('utf8'), qualification: {}, bundle: {} });
  expect(() => inspectPythonFirstHistory(bytes(captured), tag, history)).toThrow('Historical anchor evidence invalid');
});

it('rejects missing, oversized, non-byte and shared input without leaking error contents', () => {
  const shared = new Uint8Array(runInNewContext('new SharedArrayBuffer(1)') as SharedArrayBuffer);
  const invalid = [new Uint8Array(0), new Uint8Array(16 * 1024 * 1024 + 1), shared,
    new DataView(new ArrayBuffer(1)), new Proxy(new Uint8Array(1), {})];
  for (const value of invalid) {
    expect(() => inspectPythonFirstHistory(value as Uint8Array, Buffer.from('tag'), Buffer.from('{}')))
      .toThrow('Historical anchor evidence invalid');
  }
  expect(() => inspectPythonFirstHistory(Buffer.from('synthetic-secret-marker'), Buffer.from('tag'), Buffer.from('{}')))
    .toThrow('Historical anchor evidence invalid');
  for (const position of [0, 1, 2]) {
    const args = [Buffer.from('{}'), Buffer.from('tag'), Buffer.from('{}')];
    args[position] = Buffer.alloc(position === 1 ? 16 * 1024 + 1 : 16 * 1024 * 1024 + 1);
    expect(() => inspectPythonFirstHistory(args[0]!, args[1]!, args[2]!)).toThrow('Historical anchor evidence invalid');
  }
});

it('does not invoke an untrusted byte getter while rejecting invalid evidence', () => {
  const value = new Uint8Array([123,125]);
  let getterCalls = 0;
  Object.defineProperty(value, 'buffer', { get() { getterCalls += 1; throw Error('synthetic-secret-marker'); } });
  expect(() => inspectPythonFirstHistory(value, Buffer.from('tag'), Buffer.from('{}')))
    .toThrow('Historical anchor evidence invalid');
  expect(getterCalls).toBe(0);
});
