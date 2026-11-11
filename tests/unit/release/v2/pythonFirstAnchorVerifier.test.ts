// @vitest-environment node
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ capture: vi.fn() }));
vi.mock('../../../../scripts/release/v2/captureBaseline', () => ({
  captureBaseline: mocks.capture,
}));
vi.mock('../../../../scripts/release/v2/pythonFirstAnchorIdentity', () => ({
  assertFixedPythonFirstAnchor: vi.fn(),
}));
import { verifyPythonFirstAnchor } from '../../../../scripts/release/v2/pythonFirstAnchorVerifier';
import { hashValue } from '../../../../scripts/release/v2/identity';
import { releaseFixture } from './releaseFixture';
import { z } from 'zod';
const tag = readFileSync('tests/fixtures/release-v2/b930-public-tag.object');
const proof = {
  schemaVersion: 1,
  repository: 'santa928/tsumucode',
  deploymentId: '7699435659',
  sourceCommit: 'b9306eb3414e69a2068603cfdbf2706ebe4e9284',
  workflowHeadCommit: 'b9306eb3414e69a2068603cfdbf2706ebe4e9284',
  runId: '42929117936',
  tag: 'refs/tags/tsumucode-app-42929117936-7699435659',
  tagDigest: '005611a22025a12d925bda0fdfb47c96266cf0d3a57aef984f358528a74ead3b',
  artifactDigest: '7d0374e5807b4fa3c5ba819db1e56513f944577b21ee11b62bb16d2af0a75afa',
  artifactDigestFormat: 'canonical-dist-v1',
  projection: 'authoring',
  inventoryDigest: 'f66bdc9ce5fad39a76a22d79bb0f07b497efe7bdea1114278ecec80c47022310',
  publicContentDigest: '36b593f9e489346671b61c881237bf1e3e04fc8bf0d47e3a3b0c4569af9c6df9',
  publicFiles: 479,
  observedAt: '2026-11-11T03:00:00.000Z',
};
it('rejects failed API, different live parent, changed tag ref and changed declaration (mock capture/API)', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'anchor-verifier-'));
  try {
    execFileSync('git', ['init', '-q', root]);
    execFileSync('git', ['hash-object', '-t', 'tag', '-w', '--stdin'], { cwd: root, input: tag });
    mkdirSync(path.join(root, 'docs/quality'), { recursive: true });
    const declaration = readFileSync('docs/quality/movement-eb2-v2.json');
    const declarationFile = path.join(root, 'docs/quality/movement-eb2-v2.json');
    writeFileSync(declarationFile, declaration);
    const fixture = releaseFixture().capturedBaseline;
    const validProof = { ...proof, inventoryDigest: hashValue(fixture.baseline.inventory) };
    const validBaseline = {
      ...fixture.baseline,
      deploymentId: validProof.deploymentId,
      sourceCommit: validProof.sourceCommit,
      artifactDigest: validProof.artifactDigest,
      sourceRecordDigest: hashValue(validProof),
    };
    mocks.capture.mockResolvedValue({ proof: validProof, baseline: validBaseline });
    const deployment = {
      id: 7699435659,
      sha: proof.sourceCommit,
      ref: 'main',
      environment: 'github-pages',
      created_at: '2026-11-11T02:00:00Z',
    };
    const status = {
      id: 7,
      state: 'success',
      created_at: '2026-11-11T02:01:00Z',
      environment_url: 'https://santa928.github.io/tsumucode/',
      log_url: 'https://github.com/santa928/tsumucode/actions/runs/42929117936/job/1',
    };
    let mode = 'ok',
      refCalls = 0,
      deployCalls = 0,
      statusCalls = 0;
    vi.stubGlobal('fetch', async (url: string) => {
      if (mode === '403') return new Response('', { status: 403 });
      if (mode === '404') return new Response('', { status: 404 });
      if (url.includes('/git/ref/')) {
        refCalls++;
        return Response.json({
          ref: proof.tag,
          object: {
            type: 'tag',
            sha:
              mode === 'ref' && refCalls > 1
                ? 'f'.repeat(40)
                : 'fa87f692442cb3876b07ef33e583e29b438dae31',
          },
        });
      }
      if (url.includes('/statuses')) {
        statusCalls++;
        return Response.json([
          { ...status, ...(mode === 'status' && statusCalls > 1 ? { id: 8 } : {}) },
        ]);
      }
      deployCalls++;
      return Response.json([
        { ...deployment, ...(mode === 'parent' && deployCalls > 1 ? { id: 7699435660 } : {}) },
      ]);
    });
    const reset = (value: string) => {
      mode = value;
      refCalls = 0;
      deployCalls = 0;
      statusCalls = 0;
      mocks.capture.mockClear();
    };
    reset('ok');
    await expect(verifyPythonFirstAnchor(root)).resolves.toMatchObject({
      declarationDigest: '4ce18d583429e685ee951def56982bb5c5b292b7e4ad78e162d5ebd2703da494',
    });
    for (const value of ['403', '404']) {
      reset(value);
      await expect(verifyPythonFirstAnchor(root)).rejects.toThrow(
        'Public anchor observation unavailable',
      );
      expect(mocks.capture).not.toHaveBeenCalled();
    }
    reset('ref');
    await expect(verifyPythonFirstAnchor(root)).rejects.toBeInstanceOf(z.ZodError);
    expect(refCalls).toBe(2);
    expect(mocks.capture).toHaveBeenCalledOnce();
    for (const value of ['parent', 'status']) {
      reset(value);
      await expect(verifyPythonFirstAnchor(root)).rejects.toThrow(
        'Anchor deployment changed during observation',
      );
      expect(deployCalls).toBe(2);
    }
    reset('ok');
    writeFileSync(declarationFile, Buffer.from('{}'));
    await expect(verifyPythonFirstAnchor(root)).rejects.toBeInstanceOf(z.ZodError);
    expect(mocks.capture).not.toHaveBeenCalled();
  } finally {
    vi.unstubAllGlobals();
    rmSync(root, { recursive: true, force: true });
  }
});
