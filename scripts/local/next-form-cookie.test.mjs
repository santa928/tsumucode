import { test } from 'vitest';
import assert from 'node:assert/strict';
import {
  nextFormRequest,
  ACTION_ROOT_TREE,
  FORM_WORKSPACE,
  ACTION_WORKSPACE,
} from './next-form-preview.mjs';
import { lessonThemeRequestHeaders, lessonThemeResponseHeaders } from './next-form-cookie.mjs';

const target = {
  workspaceId: FORM_WORKSPACE,
  profile: 'next-project-v1',
  runId: '01234567-89ab-4cde-8123-0123456789ab',
  sourceRevision: 1,
  sourceHash: 'a'.repeat(64),
  dev: 1,
  ino: 2,
};
const root = `/w/${target.workspaceId}/${target.runId}`;
const req = {
  method: 'POST',
  url: `${root}/api/note`,
  headers: {
    host: `${target.runId}.localhost:4175`,
    origin: `http://${target.runId}.localhost:4175`,
    'content-type': 'application/json',
    'sec-fetch-site': 'same-origin',
    'sec-fetch-mode': 'cors',
    'sec-fetch-dest': 'empty',
  },
};

test('固定2教材の有効POSTはthemeだけを渡し、資格情報を採用しない', () => {
  for (const workspaceId of [FORM_WORKSPACE, ACTION_WORKSPACE]) {
    const action = workspaceId === ACTION_WORKSPACE;
    const request = {
      ...req,
      url: `/w/${workspaceId}/${target.runId}${action ? '' : '/api/note'}`,
      headers: {
        ...req.headers,
        cookie: 'other=private; lesson-theme=light',
        authorization: 'Bearer private',
        'x-tsumucode-token': 'private',
        forwarded: 'host=private',
        ...(action
          ? {
              'content-type':
                'multipart/form-data; boundary=----WebKitFormBoundary0123456789ABCDEF',
              'next-action': 'a'.repeat(42),
              'next-router-state-tree': ACTION_ROOT_TREE,
              accept: 'text/x-component',
            }
          : {}),
      },
    };
    const headers = nextFormRequest(request, { ...target, workspaceId }).headers;
    assert.equal(headers.cookie, 'lesson-theme=light');
    for (const key of ['authorization', 'x-tsumucode-token', 'forwarded'])
      assert.equal(headers[key], undefined);
  }
});

test('同名重複・補正が必要な値・壊れたCookieを転送しない', () => {
  for (const cookie of [
    'lesson-theme=dark; lesson-theme=dark',
    'lesson-theme=light; lesson-theme=dark',
    'lesson-theme="dark"',
    'lesson-theme=%64ark',
    'lesson-theme=Dark',
    'lesson-theme=',
    'lesson-theme=dark, other=x',
    'lesson-theme=dark; broken',
    'lesson-theme=dark\n',
    'Lesson-theme=dark',
    ['lesson-theme=dark'],
    'x'.repeat(4097),
  ])
    assert.deepEqual(
      lessonThemeRequestHeaders({ ...req, headers: { ...req.headers, cookie } }, target),
      {},
    );
  assert.deepEqual(
    lessonThemeRequestHeaders(
      {
        ...req,
        headers: { ...req.headers, cookie: 'lesson-theme=dark' },
        rawHeaders: ['Cookie', 'lesson-theme=dark', 'cookie', 'other=private'],
      },
      target,
    ),
    {},
  );
});

test('別profile・run・教材・静的資産・Origin・採点へ許可を広げない', async () => {
  const headers = { ...req.headers, cookie: 'lesson-theme=dark' };
  for (const patch of [
    { profile: 'web-project-v1' },
    { workspaceId: 'next-ch01-l01-e01' },
    { grading: true },
    { runId: 'old-run' },
  ])
    assert.deepEqual(lessonThemeRequestHeaders({ ...req, headers }, { ...target, ...patch }), {});
  for (const patch of [
    { method: 'GET', url: `${root}/_next/static/chunks/app.js` },
    { url: `${root}/api/note?extra=1` },
    { headers: { ...headers, host: 'other.localhost:4175' } },
    { headers: { ...headers, origin: 'null' } },
  ]) {
    const request = { ...req, headers, ...patch };
    assert.deepEqual(lessonThemeRequestHeaders(request, target), {});
    assert.deepEqual(
      await lessonThemeResponseHeaders(
        request,
        target,
        {
          statusCode: 200,
          headers: { 'set-cookie': ['lesson-theme=dark'] },
        },
        async () => {
          throw new Error('Lookup must not run');
        },
      ),
      {},
    );
  }
});

test('session setとNext epoch deleteだけをhost-only・末尾slashなしのPathへ再生成する', async () => {
  const suffix = `Path=${root}; HttpOnly; SameSite=Strict`;
  for (const [fields, expected] of [
    [['lesson-theme=dark; Path=/'], `lesson-theme=dark; ${suffix}`],
    [
      ['unrelated=private', 'lesson-theme=light; SameSite=Lax; HttpOnly'],
      `lesson-theme=light; ${suffix}`,
    ],
    [
      ['lesson-theme=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT'],
      `lesson-theme=; ${suffix}; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`,
    ],
    [
      ['lesson-theme=; Max-Age=0'],
      `lesson-theme=; ${suffix}; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`,
    ],
  ])
    assert.deepEqual(
      await lessonThemeResponseHeaders(
        req,
        target,
        {
          statusCode: 200,
          headers: { 'set-cookie': fields },
        },
        async () => target,
      ),
      { 'set-cookie': expected },
    );
});

test('不正・重複・永続化・Domain・未知属性・別PathのSet-Cookieを捨てる', async () => {
  for (const fields of [
    ['other=secret'],
    ['lesson-theme=dark', 'lesson-theme=light'],
    ['lesson-theme=dark, lesson-theme=light'],
    ['lesson-theme=dark; Domain=localhost'],
    ['lesson-theme=dark; Path=/admin'],
    ['lesson-theme=dark; Path=/; path=/'],
    ['lesson-theme=dark; Max-Age=3600'],
    ['lesson-theme=dark; Secure'],
    ['lesson-theme=dark; Partitioned'],
    ['lesson-theme=dark; HttpOnly=false'],
    ['lesson-theme=dark; Unknown=1'],
    ['lesson-theme='],
    ['lesson-theme=; Max-Age=1; Expires=Thu, 01 Jan 1970 00:00:00 GMT'],
    ['lesson-theme=; Expires=Wed, 01 Jan 2031 00:00:00 GMT'],
    ['lesson-theme=%64ark'],
    ['lesson-theme=dark\r\nother=x'],
  ])
    assert.deepEqual(
      await lessonThemeResponseHeaders(
        req,
        target,
        {
          statusCode: 200,
          headers: { 'set-cookie': fields },
        },
        async () => {
          throw new Error('Lookup must not run');
        },
      ),
      {},
    );
  for (const statusCode of [302, 400, 500])
    assert.deepEqual(
      await lessonThemeResponseHeaders(
        req,
        target,
        {
          statusCode,
          headers: { 'set-cookie': ['lesson-theme=dark'] },
        },
        async () => target,
      ),
      {},
    );
});

test('run・Source・socket・採点状態の変更とcontrol不通はCookie応答を拒否する', async () => {
  const upstream = { statusCode: 200, headers: { 'set-cookie': ['lesson-theme=dark'] } };
  for (const patch of [
    { runId: 'other' },
    { workspaceId: ACTION_WORKSPACE },
    { profile: 'other' },
    { sourceRevision: 2 },
    { sourceHash: 'b'.repeat(64) },
    { dev: 2 },
    { ino: 3 },
    { grading: true },
  ])
    await assert.rejects(
      lessonThemeResponseHeaders(req, target, upstream, async () => ({ ...target, ...patch })),
    );
  await assert.rejects(
    lessonThemeResponseHeaders(req, target, upstream, async () => {
      throw new Error('Unavailable');
    }),
  );
});
