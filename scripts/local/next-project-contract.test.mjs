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
});
