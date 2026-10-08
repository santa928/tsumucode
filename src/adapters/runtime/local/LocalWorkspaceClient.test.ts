import { afterEach, expect, it, vi } from 'vitest';
import {
  LocalWorkspaceClient,
  workspaceFilesSchema,
  workspacePreviewUrl,
  type LocalWorkspace,
  type WorkspaceRun,
} from './LocalWorkspaceClient';

const id = 'local-project';
const files = { 'index.html': '', 'main.js': '', 'message.js': '', 'styles.css': '' };
const run: WorkspaceRun = {
  workspaceId: id,
  profile: 'vite-project-v1',
  runId: '91a12736-87c5-4f15-b467-8d840bace547',
  sourceRevision: 1,
  sourceHash: 'a'.repeat(64),
  state: 'ready',
  cleanupPending: false,
};
const workspace: LocalWorkspace = {
  schema: 1,
  profile: 'vite-project-v1',
  workspaceId: id,
  sourceRevision: 2,
  sourceHash: 'b'.repeat(64),
  files,
  lastRun: run,
};

afterEach(() => vi.unstubAllGlobals());

it.each(['workspaceId', 'runId', 'sourceRevision', 'sourceHash'] as const)(
  '別%sの採点応答を採用しない',
  async (key) => {
    const grade = {
      ...run,
      sourceRevision: workspace.sourceRevision,
      sourceHash: workspace.sourceHash,
      status: 'pass',
      actual: 'こんにちは、実サーバー！',
      diagnostics: [],
      engineVersion: '149',
      evaluatedAt: '2026-10-08T00:00:00.000Z',
    };
    const mismatches = {
      workspaceId: 'other',
      runId: '07dd1374-7d58-4009-bc18-537d204e4616',
      sourceRevision: 3,
      sourceHash: 'c'.repeat(64),
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ ...grade, [key]: mismatches[key] }))),
    );
    await expect(new LocalWorkspaceClient(id).grade(run, workspace)).rejects.toThrow(/一致/);
  },
);

it.each([
  'http://127.0.0.1:4173/api/session',
  `http://${run.runId}.localhost:4175/w/other/${run.runId}/`,
  `http://${run.runId}.localhost:4175/w/${id}/${run.runId}/?token=secret`,
  `http://${run.runId}.localhost:4175/w/${id}/${run.runId}/#old`,
])('管理/別Workspace/余分な情報を含むPreview URLを拒否する: %s', (previewUrl) => {
  expect(() => workspacePreviewUrl({ ...run, previewUrl })).toThrow(/一致/);
});

it('未反映の保存版と実行版を同一として返さない', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(workspace))),
  );
  const saved = await new LocalWorkspaceClient(id).save(1, files);
  expect(saved.sourceRevision).toBe(2);
  expect(saved.lastRun?.sourceRevision).toBe(1);
});

it('HTTP成功でも別WorkspaceのSourceを採用しない', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ ...workspace, workspaceId: 'other' }))),
  );
  await expect(new LocalWorkspaceClient(id).status()).rejects.toThrow(/別Workspace/);
});

it('後着した別runの停止応答を停止成功にしない', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            ...workspace,
            lastRun: { ...run, runId: '07dd1374-7d58-4009-bc18-537d204e4616', state: 'stopped' },
          }),
        ),
    ),
  );
  await expect(new LocalWorkspaceClient(id).stop(run)).rejects.toThrow(/古い実行/);
});

it('controller再接続はtokenを更新し、資格情報をURLへ渡さない', async () => {
  let connections = 0;
  const tokens: (string | null)[] = [];
  const paths: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string, init: RequestInit) => {
      paths.push(path);
      if (path === '/api/session') {
        connections++;
        return new Response(
          JSON.stringify({ apiVersion: 1, token: String(connections).repeat(64) }),
        );
      }
      tokens.push(new Headers(init.headers).get('x-tsumucode-token'));
      if (path === '/api/workspaces/capabilities')
        return new Response(
          JSON.stringify({
            apiVersion: 1,
            profile: 'vite-project-v1',
            available: true,
            gradingAvailable: true,
            starterFiles: files,
          }),
        );
      return new Response(JSON.stringify(workspace));
    }),
  );
  const client = new LocalWorkspaceClient(id);
  await client.connect();
  await client.status();
  await client.connect();
  await client.status();
  expect(tokens).toEqual(['1'.repeat(64), '1'.repeat(64), '2'.repeat(64), '2'.repeat(64)]);
  expect(paths.every((path) => !path.includes('?'))).toBe(true);
});

it('未作成404とサーバー障害503を区別して、障害を初期Sourceへ変換しない', async () => {
  let status = 404;
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ error: 'unavailable' }), { status })),
  );
  const client = new LocalWorkspaceClient(id);
  await expect(client.status()).resolves.toBeUndefined();
  status = 503;
  await expect(client.status()).rejects.toMatchObject({ status: 503 });
});

it('未知fileとUTF-8合計上限の迂回をAPI送信前に拒否する', () => {
  expect(workspaceFilesSchema.safeParse({ ...files, '.env': 'secret' }).success).toBe(false);
  expect(
    workspaceFilesSchema.safeParse({ ...files, 'message.js': 'あ'.repeat(40000) }).success,
  ).toBe(false);
});
