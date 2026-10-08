import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  previewRoute,
  previewHeaders,
  previewOrigin,
  previewRequestOrigin,
} from './preview-contract.mjs';

const target = { workspaceId: 'one', runId: '91a12736-87c5-4f15-b467-8d840bace547' };
const base = `/w/one/${target.runId}/`;

test('Origin:nullは固定echoへの同一origin native formだけに限定する', () => {
  const req = {
    method: 'POST',
    url: `${base}api/echo`,
    headers: {
      origin: 'null',
      'content-type': 'application/x-www-form-urlencoded',
      'sec-fetch-site': 'same-origin',
      'sec-fetch-mode': 'navigate',
      'sec-fetch-dest': 'iframe',
    },
  };
  assert.equal(previewRequestOrigin(req, target), true);
  assert.equal(previewRequestOrigin(req, target, true), false);
  for (const [key, value] of [
    ['origin', 'http://foreign.test'],
    ['sec-fetch-site', 'cross-site'],
    ['sec-fetch-mode', 'cors'],
    ['sec-fetch-dest', 'empty'],
    ['content-type', 'application/json'],
  ]) {
    assert.equal(
      previewRequestOrigin({ ...req, headers: { ...req.headers, [key]: value } }, target),
      false,
    );
  }
  assert.equal(previewRequestOrigin({ ...req, url: `${base}main.js` }, target), false);
  assert.equal(previewRequestOrigin({ ...req, method: 'GET' }, target), false);
  assert.equal(previewRequestOrigin({ ...req, headers: {} }, target), false);
});

test('固定fileとVite HMR経路だけを通し、管理・Source・正規化の迂回を拒否する', () => {
  for (const path of [
    '',
    'main.js',
    'styles.css?direct',
    '@vite/client',
    '@fs/opt/node_modules/vite/dist/client/env.mjs',
  ])
    assert.equal(previewRoute(base + path, target), true);
  for (const path of [
    '/api/session',
    '/api/workspaces/other',
    `${base}../main.js`,
    `${base}%2e%2e/main.js`,
    `${base}%252e%252e/main.js`,
    `${base}%2fmain.js`,
    `${base}main.js?x=1`,
    `${base}main.js?t=1&t=2`,
    `${base}@fs/etc/passwd`,
    `${base}main.js\\other`,
    '/w/other/' + target.runId + '/main.js',
    'http://127.0.0.1:4173/api/session',
  ])
    assert.equal(previewRoute(path, target), false, path);
});

test('HMR token queryと固定WS pathを検査し、別protocol・任意経路を許可しない', () => {
  assert.equal(previewRoute(base + 'hmr?token=valid-token', target, true), true);
  for (const path of [
    'hmr',
    'hmr?token=',
    'hmr?token=valid&token=again',
    'hmr?token=valid&x=1',
    'main.js?token=valid',
    'hmr?token=%2f',
  ])
    assert.equal(previewRoute(base + path, target, true), false);
});

test('直接表示にもsandboxと現在runだけの接続・worker禁止を強制する', () => {
  const headers = previewHeaders(target.runId);
  assert.equal(previewOrigin(target.runId), `http://${target.runId}.localhost:4175`);
  assert.ok(
    headers['content-security-policy'].includes(
      'sandbox allow-scripts allow-same-origin allow-forms',
    ),
  );
  assert.ok(headers['content-security-policy'].includes("worker-src 'none'"));
  assert.ok(headers['content-security-policy'].includes('frame-ancestors http://127.0.0.1:4173'));
  assert.ok(
    headers['content-security-policy'].includes(
      `connect-src 'self' ws://${target.runId}.localhost:4175`,
    ),
  );
  assert.equal(headers['referrer-policy'], 'no-referrer');
});
