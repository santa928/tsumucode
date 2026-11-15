import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readStages, writeStage } from './probe-stage-lib.mjs';
import { classifyApi, observeApi, responseClass } from './api-observation.mjs';

const base = 'http://127.0.0.1:4173';
test('only exact origin, POST and fixed API paths are classified', () => {
  assert.equal(classifyApi(`${base}/api/session`, 'POST'), 'session');
  assert.equal(classifyApi(`${base}/api/python-capabilities`, 'POST'), 'capability');
  assert.equal(classifyApi(`${base}/api/grades?SECRET=hidden`, 'POST'), 'grade');
  for (const [url, method] of [
    [`${base}/api/grades`, 'GET'],
    ['http://example.test/api/grades', 'POST'],
    [`${base}/api/grades/secret`, 'POST'],
    ['bad SECRET', 'POST'],
  ])
    assert.equal(classifyApi(url, method), undefined);
  assert.equal(responseClass('grade', 202), 'response-202');
  assert.equal(responseClass('grade', 200), 'response-2xx');
  assert.equal(responseClass('session', 202), 'response-2xx');
  assert.equal(responseClass('capability', 302), 'response-3xx');
  assert.equal(responseClass('grade', 401), 'response-4xx');
  assert.equal(responseClass('grade', 503), 'response-5xx');
  assert.equal(responseClass('grade', 0), 'response-other');
});
test('synthetic events expose finite stages once and never access body, headers or failure text', () => {
  const page = new EventEmitter();
  const seen = [];
  observeApi(page, (stage) => seen.push(stage));
  const request = {
    url: () => `${base}/api/grades?TOKEN=secret`,
    method: () => 'POST',
    headers: () => {
      throw Error('read forbidden');
    },
    postData: () => {
      throw Error('read forbidden');
    },
    failure: () => {
      throw Error('read forbidden');
    },
  };
  page.emit('request', request);
  page.emit('request', request);
  page.emit('requestfailed', request);
  page.emit('response', {
    request: () => request,
    status: () => 202,
    body: () => {
      throw Error('read forbidden');
    },
  });
  page.emit('response', { request: () => request, status: () => 500 });
  assert.deepEqual(seen, [
    'api-grade-request',
    'api-grade-network-failure',
    'api-grade-response-202',
    'api-grade-response-5xx',
  ]);
  assert.doesNotMatch(JSON.stringify(seen), /TOKEN|secret|http/u);
  const broken = {
    url: () => {
      throw Error('PRIVATE ERROR');
    },
    method: () => 'POST',
  };
  assert.doesNotThrow(() => page.emit('request', broken));
  assert.doesNotThrow(() => page.emit('requestfailed', broken));
  assert.doesNotThrow(() =>
    page.emit('response', {
      request: () => {
        throw Error('PRIVATE ERROR');
      },
    }),
  );
  assert.equal(seen.length, 4);
});

test('every finite API marker and click-returned are writable and read only as reached', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'api-markers-'));
  try {
    const names = [
      'grade-click-returned',
      'api-grade-response-202',
      ...['session', 'capability', 'grade'].flatMap((route) =>
        [
          'request',
          'network-failure',
          'response-2xx',
          'response-3xx',
          'response-4xx',
          'response-5xx',
          'response-other',
        ].map((event) => `api-${route}-${event}`),
      ),
    ];
    for (const name of names) assert.equal(await writeStage(dir, name), true);
    const values = readStages(dir);
    for (const name of names) assert.equal(values[name], 'reached');
    assert.equal(values['identity-saved'], 'unknown');
    assert.equal(await writeStage(dir, 'api-grade-secret'), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
