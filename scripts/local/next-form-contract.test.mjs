import { URLSearchParams } from 'node:url';
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { PassThrough } from 'node:stream';
import { nextFormBackend } from './next-form-backend.mjs';
import {
  nextFormRequest,
  ACTION_ROOT_TREE,
  FORM_WORKSPACE,
  ACTION_WORKSPACE,
} from './next-form-preview.mjs';
import { previewRoute, previewBase } from './preview-contract.mjs';
import { readPreviewBody } from './preview-body.mjs';

const metadata = {
  workspaceId: FORM_WORKSPACE,
  profile: 'next-project-v1',
  runId: '01234567-89ab-4cde-8123-0123456789ab',
  sourceRevision: 1,
  sourceHash: 'a'.repeat(64),
};
const base = previewBase(metadata.workspaceId, metadata.runId).slice(0, -1);

test('限定2教材の実POST形式とOriginを検査し、内部経路と他教材を開かない', () => {
  for (const workspaceId of [FORM_WORKSPACE, ACTION_WORKSPACE]) {
    const target = { ...metadata, workspaceId };
    const root = previewBase(workspaceId, target.runId).slice(0, -1);
    const action = workspaceId === ACTION_WORKSPACE;
    const req = {
      method: 'POST',
      url: action ? root : `${root}/api/note`,
      headers: {
        host: `${target.runId}.localhost:4175`,
        origin: `http://${target.runId}.localhost:4175`,
        'sec-fetch-site': 'same-origin',
        'sec-fetch-mode': 'cors',
        'sec-fetch-dest': 'empty',
        'content-type': action
          ? 'multipart/form-data; boundary=----WebKitFormBoundary0123456789ABCDEF'
          : 'application/json',
        ...(action
          ? {
              'next-action': 'a'.repeat(42),
              'next-router-state-tree': ACTION_ROOT_TREE,
              accept: 'text/x-component',
            }
          : {}),
      },
    };
    assert.equal(previewRoute(req.url, target), true);
    assert.equal(nextFormRequest(req, target).post, true);
    assert.equal(nextFormRequest(req, { ...target, grading: true }), undefined);
    for (const origin of [undefined, 'null', 'http://other.localhost:4175'])
      assert.equal(
        nextFormRequest({ ...req, headers: { ...req.headers, origin } }, target),
        undefined,
      );
    for (const path of [
      '/api/note-store',
      '/__tsumucode_note',
      '/api/echo',
      '/api/note?x=1',
      '/../api/note',
    ])
      assert.equal(previewRoute(root + path, target), false);
    assert.equal(nextFormRequest({ ...req, method: 'GET' }, target), undefined);
    assert.equal(previewRoute(req.url, { ...target, workspaceId: 'next-ch01-l01-e01' }), false);
    if (action) {
      assert.equal(nextFormRequest({ ...req, url: `${root}/` }, target).post, true);
      assert.ok(nextFormRequest({ method: 'GET', url: `${root}/`, headers: {} }, target));
      for (const key of ['next-action', 'next-router-state-tree', 'accept'])
        assert.equal(
          nextFormRequest({ ...req, headers: { ...req.headers, [key]: 'unknown' } }, target),
          undefined,
        );
    }
  }
});

async function fixture() {
  const backend = nextFormBackend(base, metadata);
  const server = createServer((req, res) => {
    if (req.url === '/public') {
      if (backend.authorizePost(req, res)) res.writeHead(200).end();
    } else if (!backend.handle(req, res)) res.writeHead(404).end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  return {
    backend,
    control: (op, id, extra = {}) =>
      globalThis.fetch(
        `${origin}/__tsumucode_note?${new URLSearchParams({
          op,
          leaseId: id,
          runId: metadata.runId,
          sourceRevision: String(metadata.sourceRevision),
          sourceHash: metadata.sourceHash,
          ...extra,
        })}`,
      ),
    store: (input, id) =>
      globalThis.fetch(`${origin}${base}/api/note-store`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(id ? { 'x-tsumucode-note-lease': id } : {}),
        },
        body: JSON.stringify({ input }),
      }),
    public: (id) =>
      globalThis.fetch(`${origin}/public`, {
        method: 'POST',
        headers: id ? { 'x-tsumucode-note-lease': id } : {},
      }),
    close: () => {
      server.closeAllConnections();
      return new Promise((resolve) => server.close(resolve));
    },
  };
}

test('採点のexact予約をPreview履歴と分離し、古いreleaseと別Source版を拒否する', async () => {
  const f = await fixture();
  const id = randomUUID();
  const next = randomUUID();
  try {
    assert.equal((await f.store('memo-preview')).status, 503);
    assert.equal((await f.control('reserve', id, { memo: 'memo-grade' })).status, 200);
    assert.equal((await f.public()).status, 409);
    assert.equal((await f.public(id)).status, 200);
    assert.equal((await f.store('memo-preview')).status, 200);
    assert.equal((await f.store('memo-grade')).status, 503);
    assert.equal((await f.store('memo-grade', id)).status, 503);
    assert.equal((await f.store('memo-grade', id)).status, 200);
    assert.deepEqual(await (await f.control('inspect', id)).json(), {
      attempts: 2,
      saved: 1,
      invalidCalls: 0,
      previewEntries: 2,
    });
    assert.equal((await f.control('release', id, { sourceRevision: '2' })).status, 409);
    assert.equal((await f.control('release', id)).status, 200);
    assert.equal((await f.control('reserve', next, { memo: 'memo-next' })).status, 200);
    assert.equal((await f.control('release', id)).status, 409);
    assert.equal((await f.store('memo-next', id)).status, 409);
    assert.equal((await f.store('memo-next', next)).status, 503);
    assert.equal((await f.store('memo-preview')).status, 200);
  } finally {
    await f.close();
  }
});

test('切断した旧公開処理の遅延storeを採点カウンタへ混ぜず、予約のvalidationだけを記録する', async () => {
  const f = await fixture();
  const id = randomUUID();
  try {
    assert.equal((await f.public()).status, 200);
    assert.equal((await f.control('reserve', id, { memo: 'memo-grade' })).status, 200);
    // finish/close後に旧Server処理が到達しても、予約IDのない入力はPreviewへ帰属する。
    assert.equal((await f.store('   ')).status, 400);
    assert.equal((await f.store('memo-grade')).status, 503);
    assert.deepEqual(await (await f.control('inspect', id)).json(), {
      attempts: 0,
      saved: 0,
      invalidCalls: 0,
      previewEntries: 1,
    });
    assert.equal((await f.store('   ', id)).status, 400);
    assert.equal((await f.control('inspect', id).then((r) => r.json())).invalidCalls, 1);
  } finally {
    await f.close();
  }
});

test('本文を全量受信し、上限・期限・切断を別々に拒否する', async () => {
  const complete = new PassThrough();
  const received = readPreviewBody(complete, { limit: 4, timeoutMs: 100 });
  complete.end('abcd');
  assert.equal((await received).toString(), 'abcd');
  const oversized = new PassThrough();
  const rejected = assert.rejects(readPreviewBody(oversized, { limit: 4, timeoutMs: 100 }), {
    status: 413,
  });
  oversized.end('abcde');
  await rejected;
  const slow = new PassThrough();
  await assert.rejects(readPreviewBody(slow, { limit: 4, timeoutMs: 10 }), { status: 504 });
  const disconnected = new PassThrough();
  const aborted = assert.rejects(readPreviewBody(disconnected, { limit: 4, timeoutMs: 100 }), {
    status: 408,
  });
  disconnected.emit('aborted');
  await aborted;
});
