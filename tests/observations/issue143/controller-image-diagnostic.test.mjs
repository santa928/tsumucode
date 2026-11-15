import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { probe, formatResult, imageRefs } from './controller-image-diagnostic.mjs';

function fakeRequest(status, body, mode = 'success') {
  let options;
  const request = (value, callback) => {
    options = value;
    const req = new EventEmitter();
    req.destroy = () => req.emit('error', new Error('PRIVATE_MARKER'));
    req.end = () => queueMicrotask(() => {
      if (mode === 'error') return req.emit('error', new Error('PRIVATE_MARKER'));
      if (mode === 'timeout') return;
      const res = new EventEmitter(); res.statusCode = status; res.destroy = () => res.emit('error', new Error('PRIVATE_MARKER'));
      callback(res);
      if (body) res.emit('data', Buffer.from(body));
      res.emit('end');
    });
    return req;
  };
  return { request, options: () => options };
}

test('classifies only fixed image GET response classes without leaking content', async () => {
  for (const [status, body, expected] of [[200, '{"private":"PRIVATE_MARKER"}', 'present'], [200, 'PRIVATE_MARKER', 'invalid-response'], [404, 'PRIVATE_MARKER', 'missing'], [403, 'PRIVATE_MARKER', 'request-rejected'], [503, 'PRIVATE_MARKER', 'daemon-error']]) {
    const f = fakeRequest(status, body);
    assert.equal(await probe(f.request, imageRefs.node, 200), expected);
    assert.deepEqual(f.options(), { socketPath: '/var/run/docker.sock', path: `/v1.47/images/${encodeURIComponent(imageRefs.node)}/json`, method: 'GET' });
  }
});

test('bounds response bytes and classifies socket error and timeout', async () => {
  assert.equal(await probe(fakeRequest(200, 'x'.repeat(2097153)).request, imageRefs.python, 200), 'oversized');
  assert.equal(await probe(fakeRequest(0, '', 'error').request, imageRefs.python, 200), 'unavailable');
  assert.equal(await probe(fakeRequest(0, '', 'timeout').request, imageRefs.python, 5), 'timeout');
});

test('format allows only fixed phase and classes', () => {
  assert.equal(formatResult('before', 'present', 'missing'), 'controller-images phase=before node=present python=missing');
  assert.equal(formatResult('after', 'PRIVATE_MARKER', 'present'), 'controller-images unavailable');
  assert.equal(formatResult('PRIVATE_MARKER', 'present', 'present'), 'controller-images unavailable');
});
