import process from 'node:process';
import { Buffer } from 'node:buffer';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { checkImage, formatImageCheck } from './node-image-check.mjs';

function fakeRequest(status, body, mode = 'success') {
  let options;
  const request = (value, callback) => {
    options = value;
    const req = new EventEmitter();
    req.destroy = () => req.emit('error', new Error('PRIVATE_MARKER'));
    req.end = () =>
      process.nextTick(() => {
        if (mode === 'error') return req.emit('error', new Error('PRIVATE_MARKER'));
        if (mode === 'timeout') return;
        const res = new EventEmitter();
        res.statusCode = status;
        res.destroy = () => res.emit('error', new Error('PRIVATE_MARKER'));
        callback(res);
        if (body) res.emit('data', Buffer.from(body));
        res.emit('end');
      });
    return req;
  };
  return { request, options: () => options };
}
test('only one fixed Docker GET yields finite status, with no body output', async () => {
  const image =
    'node:24.18.0-bookworm-slim@sha256:cb4e8f7c443347358b7875e717c29e27bf9befc8f5a26cf18af3c3dec80e58c5';
  const body = JSON.stringify({ Id: `sha256:${'a'.repeat(64)}`, token: 'PRIVATE_MARKER' });
  for (const [status, data, expected] of [
    [200, body, 'present'],
    [200, '{}', 'unknown'],
    [200, 'bad PRIVATE_MARKER', 'unknown'],
    [404, 'PRIVATE_MARKER', 'http-404'],
    [403, 'PRIVATE_MARKER', 'http-4xx'],
    [503, 'PRIVATE_MARKER', 'http-5xx'],
  ]) {
    const f = fakeRequest(status, data);
    const actual = await checkImage(f.request, 200);
    assert.equal(actual, expected);
    assert.deepEqual(f.options(), {
      socketPath: '/var/run/docker.sock',
      path: `/v1.47/images/${encodeURIComponent(image)}/json`,
      method: 'GET',
    });
    assert.doesNotMatch(formatImageCheck('before', actual), /PRIVATE_MARKER|sha256/u);
  }
});
test('overlong, socket failure, timeout and invalid phase fail closed', async () => {
  assert.equal(await checkImage(fakeRequest(200, 'x'.repeat(2097153)).request, 200), 'unknown');
  assert.equal(await checkImage(fakeRequest(0, '', 'error').request, 200), 'unknown');
  assert.equal(await checkImage(fakeRequest(0, '', 'timeout').request, 5), 'unknown');
  assert.equal(formatImageCheck('PRIVATE', 'present'), 'fixed-node-image unknown');
  assert.equal(formatImageCheck('before', 'PRIVATE'), 'fixed-node-image unknown');
});
