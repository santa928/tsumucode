import { test } from 'vitest';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { WorkspaceStore } from './workspace-store.mjs';
import { nextWorkspace, NEXT_PROFILE } from './next-project-protocol.mjs';
import { validateFiles } from './project-protocol.mjs';
import {
  DATA_WORKSPACE,
  WEATHER_WORKSPACE,
  nextDataRequest,
  nextPreviewRequest,
} from './next-data-preview.mjs';
import { previewRoute, previewResponseLimit } from './preview-contract.mjs';

const runId = '00000000-0000-4000-8000-000000000134';
const target = { workspaceId: WEATHER_WORKSPACE, runId, profile: NEXT_PROFILE };
const base = `/w/${WEATHER_WORKSPACE}/${runId}/`;
const rootTree = encodeURIComponent(
  JSON.stringify(['', { children: ['__PAGE__', {}, null, null, 4096] }, null, null, 4112]),
);
const headers = { rsc: '1', 'next-router-state-tree': rootTree, 'next-url': '/' };
const request = { method: 'GET', url: base + 'weather/slow?_rsc=64EBvAagmAisvzuu', headers };

test('固定7pageのGET/HEADだけを追加し、内部APIと他Workspaceを公開しない', () => {
  for (const workspaceId of [DATA_WORKSPACE, WEATHER_WORKSPACE]) {
    const current = { ...target, workspaceId };
    const root = `/w/${workspaceId}/${runId}/`;
    for (const page of nextWorkspace(workspaceId).pages) {
      for (const method of ['GET', 'HEAD']) {
        const url = root + page;
        assert.equal(previewRoute(url, current), true);
        assert.ok(nextDataRequest({ method, url, headers: {} }, current));
        assert.equal(previewResponseLimit(url, current), 512 * 1024);
      }
    }
    for (const page of [
      'api/sample',
      'api/weather?control=reset',
      'api/weather?control=inspect',
      'weather/unknown',
      'data/unknown',
      '../data/fresh',
      'data/%66resh',
      'weather/slow?',
      'weather/slow?mode=x',
    ]) {
      assert.equal(previewRoute(root + page, current), false, page);
    }
    const other = workspaceId === DATA_WORKSPACE ? WEATHER_WORKSPACE : DATA_WORKSPACE;
    assert.equal(previewRoute(`/w/${other}/${runId}/`, current), false);
  }
});

test('実測した固定RSCを通し、資格情報は転送しない', () => {
  const policy = nextDataRequest(
    {
      ...request,
      headers: {
        ...headers,
        cookie: 'private',
        authorization: 'private',
        'x-tsumucode-token': 'private',
        forwarded: 'private',
      },
    },
    target,
  );
  assert.equal(previewRoute(request.url, target), true);
  assert.equal(policy.stream, true);
  assert.deepEqual(policy.headers, headers);
  const leaf = ['__PAGE__', {}, null, null, 4096];
  const children = [
    'weather',
    { children: [['state', 'flaky', 'd', null], { children: leaf }, null, null, 4100] },
    null,
    null,
    4104,
  ];
  const retry = {
    rsc: '1',
    'next-router-state-tree': encodeURIComponent(
      JSON.stringify(['', { children }, null, 'refetch', 4120]),
    ),
  };
  assert.ok(
    nextDataRequest(
      { method: 'GET', url: base + 'weather/flaky?_rsc=uhKIZLgrGZG4csjq', headers: retry },
      target,
    ),
  );
});

test('任意tree/query/prefetch/POSTとRSCを装った資源要求を拒否する', () => {
  for (const changed of [
    { method: 'POST' },
    { method: 'HEAD' },
    { url: base + 'weather/slow?_rsc=a&extra=1' },
    { url: base + 'weather/slow?_rsc=a&_rsc=b' },
    { url: base + 'weather/slow?_rsc=%61' },
    { url: base + 'weather/slow?_rsc=' },
    { headers: { ...headers, rsc: '0' } },
    { headers: { ...headers, 'next-router-state-tree': encodeURIComponent('["/api/session"]') } },
    { headers: { ...headers, 'next-url': '/api/session' } },
    { headers: { ...headers, 'next-router-prefetch': '1' } },
  ])
    assert.equal(nextDataRequest({ ...request, ...changed }, target), undefined);
  assert.equal(nextDataRequest({ ...request, url: base + 'weather/slow' }, target), undefined);
  assert.equal(
    nextPreviewRequest({ ...request, url: base + '_next/static/chunks/a.js' }, target),
    undefined,
  );
  assert.equal(nextDataRequest(request, { ...target, runId: 'bad' }), undefined);
});

test('制御APIの変更を保存APIで拒否し、編集可能なpageのCAS・resetを保持する', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'next-data-'));
  try {
    const store = new WorkspaceStore(directory);
    for (const workspaceId of [DATA_WORKSPACE, WEATHER_WORKSPACE]) {
      const contract = nextWorkspace(workspaceId);
      const saved = await store.save(workspaceId, 0, contract.files);
      for (const path of contract.readonlyFiles) {
        assert.throws(
          () =>
            validateFiles(
              { ...contract.files, [path]: contract.files[path] + '\n' },
              NEXT_PROFILE,
              workspaceId,
            ),
          /固定ファイル/u,
        );
      }
      const page =
        workspaceId === DATA_WORKSPACE
          ? 'app/data/[mode]/page.tsx'
          : 'app/weather/[state]/page.tsx';
      const changed = await store.save(workspaceId, 1, {
        ...contract.files,
        [page]: contract.files[page] + '\n',
      });
      assert.notEqual(changed.sourceHash, saved.sourceHash);
      await assert.rejects(store.save(workspaceId, 1, contract.files));
      assert.deepEqual((await store.reset(workspaceId, 2)).files, contract.files);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
