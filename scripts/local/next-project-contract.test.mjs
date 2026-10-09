import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorkspaceStore } from './workspace-store.mjs';
import { NEXT_PROFILE, NEXT_WORKSPACE, NEXT_STARTER_FILES } from './next-project-protocol.mjs';
import { STARTER_FILES, validateFiles } from './project-protocol.mjs';
import { projectConfig } from './project-engine.mjs';
import {
  previewBase,
  previewHeaders,
  previewRoute,
  previewResponseLimit,
} from './preview-contract.mjs';

const directories = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});
const target = {
  profile: NEXT_PROFILE,
  workspaceId: NEXT_WORKSPACE,
  runId: '01234567-89ab-4cde-8123-0123456789ab',
};
const base = previewBase(target.workspaceId, target.runId);

describe('Next専用の境界', () => {
  it('固定WorkspaceだけがNext Sourceを保存し、profileや任意設定を混ぜない', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'next-workspace-'));
    directories.push(directory);
    const store = new WorkspaceStore(directory);
    const saved = await store.save(NEXT_WORKSPACE, 0, NEXT_STARTER_FILES);
    expect(saved.profile).toBe(NEXT_PROFILE);
    expect((await store.read(NEXT_WORKSPACE)).files).toEqual(NEXT_STARTER_FILES);
    expect(() => store.save('other-workspace', 0, NEXT_STARTER_FILES)).toThrow();
    expect(() =>
      validateFiles(
        { ...NEXT_STARTER_FILES, 'next.config.mjs': 'export default {}' },
        NEXT_PROFILE,
      ),
    ).toThrow();
    expect(() =>
      validateFiles({ ...NEXT_STARTER_FILES, 'app/page.tsx': 'あ'.repeat(40000) }, NEXT_PROFILE),
    ).toThrow();
    expect(() => store.save(NEXT_WORKSPACE, 1, STARTER_FILES)).toThrow();
  });

  it('Nextだけの資源上限でもnonroot/readonly/network none/CPU/PIDを保つ', () => {
    const record = {
      ...target,
      files: NEXT_STARTER_FILES,
      sourceRevision: 1,
      sourceHash: 'a'.repeat(64),
    };
    const next = projectConfig(record, 'tsumucode-learning-test', target.runId, 'sha256:fixed');
    const vite = projectConfig(
      { ...record, profile: 'vite-project-v1', files: STARTER_FILES },
      'tsumucode-learning-test',
      target.runId,
      'sha256:fixed',
    );
    expect(next.User).toBe('1000:1000');
    expect(next.HostConfig.Init).toBe(true);
    expect(next.HostConfig.NetworkMode).toBe('none');
    expect(next.HostConfig.ReadonlyRootfs).toBe(true);
    expect(next.HostConfig.CapDrop).toEqual(['ALL']);
    expect(next.HostConfig.Memory).toBe(512 * 1024 * 1024);
    expect(next.HostConfig.MemorySwap).toBe(next.HostConfig.Memory);
    expect(next.HostConfig.NanoCpus).toBe(1e9);
    expect(next.HostConfig.PidsLimit).toBe(64);
    expect(next.HostConfig.Mounts ?? []).toEqual([]);
    expect(vite.HostConfig.Memory).toBe(256 * 1024 * 1024);
    expect(vite.HostConfig.Tmpfs['/workspace']).toContain('size=8m');
  });

  it.each([
    [NEXT_WORKSPACE, 512],
    ['next-ch02-l01-e01', 576],
    ['next-ch02-l02-e01', 512],
    ['next-ch03-l01-e01', 576],
    ['next-ch03-l02-e01', 576],
    ['next-ch04-l01-e01', 512],
    ['next-ch04-l02-e01', 512],
  ])('Workspace %s の固定メモリ上限だけを設定する', (workspaceId, memoryMiB) => {
    const config = projectConfig(
      { ...target, workspaceId, files: NEXT_STARTER_FILES },
      'tsumucode-learning-test',
      target.runId,
      'sha256:fixed',
    );
    expect(config.HostConfig.Memory).toBe(memoryMiB * 1024 * 1024);
    expect(config.HostConfig.MemorySwap).toBe(config.HostConfig.Memory);
    expect(config.HostConfig.NanoCpus).toBe(1e9);
    expect(config.HostConfig.PidsLimit).toBe(64);
    expect(config.HostConfig.NetworkMode).toBe('none');
    expect(config.HostConfig.ReadonlyRootfs).toBe(true);
  });

  it.each([
    NEXT_WORKSPACE,
    'next-ch02-l01-e01',
    'next-ch02-l02-e01',
    'next-ch03-l01-e01',
    'next-ch03-l02-e01',
  ])('Workspace %s の内部制御をPreviewへ公開しない', (workspaceId) => {
    const current = { ...target, workspaceId };
    for (const path of ['__tsumucode_ready', '__tsumucode_resources', '__tsumucode_pause']) {
      expect(previewRoute(`${previewBase(workspaceId, target.runId)}${path}`, current)).toBe(false);
    }
  });

  it('unsafe-evalと2MiB応答をNextの固定chunkにだけ限定する', () => {
    expect(previewHeaders(target.runId, NEXT_PROFILE)['content-security-policy']).toContain(
      "'unsafe-eval'",
    );
    expect(previewHeaders(target.runId)['content-security-policy']).not.toContain("'unsafe-eval'");
    expect(previewHeaders(target.runId, NEXT_PROFILE)['content-security-policy']).toContain(
      "worker-src 'none'",
    );
    const chunk = `${base}_next/static/chunks/%5Bturbopack%5D_browser.js`;
    expect(previewResponseLimit(chunk, target)).toBe(2 * 1024 * 1024);
    expect(previewResponseLimit(base, target)).toBe(512 * 1024);
    expect(previewResponseLimit(`${base}api/question`, target)).toBe(512 * 1024);
    expect(previewResponseLimit(chunk, { ...target, profile: 'vite-project-v1' })).toBe(512 * 1024);
  });

  it('必要経路を許可し、内部APIとencoded traversalと未知queryを拒否する', () => {
    for (const path of [
      '',
      'api/question',
      'api/question?mode=second',
      '_next/static/chunks/%40swc_helpers.js',
    ]) {
      expect(previewRoute(base + path, target), path).toBe(true);
    }
    for (const path of [
      'api/question?mode=first',
      'api/question?mode=second&mode=second',
      'api/echo',
      '_next/image',
      '__nextjs_launch-editor',
      '_next/static/chunks/a.js.map',
      '_next/static/chunks/%2Fsecret.js',
      '_next/static/chunks/%252Fsecret.js',
      '_next/static/chunks/%5bturbopack%5d_browser.js',
      '_next/static/chunks/../a.js',
      '_next/static/chunks/a.js?anything=1',
    ])
      expect(previewRoute(base + path, target), path).toBe(false);
    expect(previewRoute(`${base}_next/hmr?id=0.123`, target, true)).toBe(true);
    expect(previewRoute(`${base}_next/hmr?id=0.123&other=1`, target, true)).toBe(false);
    expect(
      previewRoute(`${base}_next/hmr?id=0.123`, { ...target, profile: 'vite-project-v1' }, true),
    ).toBe(false);
  });

  it('ルーティングの固定3経路をそのWorkspaceだけに限定する', () => {
    const routing = { ...target, workspaceId: 'next-ch02-l01-e01' };
    const routingBase = previewBase(routing.workspaceId, routing.runId);
    for (const path of ['trips', 'trips/forest', 'trips/sea']) {
      expect(previewRoute(routingBase + path, routing), path).toBe(true);
      expect(previewResponseLimit(routingBase + path, routing)).toBe(512 * 1024);
      expect(previewRoute(base + path, target), path).toBe(false);
      const boundary = { ...target, workspaceId: 'next-ch02-l02-e01' };
      expect(previewRoute(previewBase(boundary.workspaceId, boundary.runId) + path, boundary)).toBe(
        false,
      );
    }
    for (const path of [
      'trips/',
      'trips/mountain',
      'trips/forest?x=1',
      'trips/forest?',
      'trips/forest?_rsc=abc',
      'trips/sea?mode=second',
      'trips/%66orest',
      'trips/%2e%2e/forest',
      'trips/forest/extra',
      'api/question',
      'api/question?mode=second',
    ])
      expect(previewRoute(routingBase + path, routing), path).toBe(false);
    expect(previewRoute(base + 'trips', routing)).toBe(false);
  });

  it('未知Next Workspaceとquery空マーカーを固定page/chunkにも採用しない', () => {
    const unknown = { ...target, workspaceId: 'toString' };
    for (const path of ['', '_next/static/chunks/a.js', '_next/hmr?id=1']) {
      expect(previewRoute(previewBase(unknown.workspaceId, unknown.runId) + path, unknown)).toBe(
        false,
      );
    }
    expect(previewRoute(base + '?', target)).toBe(false);
    expect(previewRoute(base + '_next/static/chunks/a.js?', target)).toBe(false);
  });
});
