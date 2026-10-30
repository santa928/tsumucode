// @vitest-environment node
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { hashArtifact } from '../../../../scripts/release/v2/identity';
const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
const source = '1'.repeat(40),
  head = '2'.repeat(40),
  dist = '3'.repeat(64);
const message = `source=${source} head=${head} dist=${dist} workflow=101-1 page_url=https://owner.github.io/site/`;
describe('actual deployed baseline binding', () => {
  it('retains different historical product and workflow sources', async () => {
    const { parseLegacyBinding } = await import('../../../../scripts/release/v2/baseline');
    expect(parseLegacyBinding(message, source, head, '101')).toMatchObject({
      sourceCommit: source,
      workflowHeadCommit: head,
      runId: '101',
      artifactDigest: dist,
      projection: 'authoring',
    });
  });
  it('accepts a successful actual Pages deployment with its own workflow Source', async () => {
    const { parseActualDeployment } = await import('../../../../scripts/release/v2/baseline');
    expect(
      parseActualDeployment(
        { id: 501, sha: head, ref: 'main', environment: 'github-pages' },
        {
          state: 'success',
          environment_url: 'https://owner.github.io/site/',
          log_url: 'https://github.com/owner/site/actions/runs/101/job/201',
        },
        'owner/site',
        'https://owner.github.io/site/',
      ),
    ).toMatchObject({ deploymentId: '501', workflowHeadCommit: head, runId: '101' });
  });
  it.each(['duplicate', 'source', 'head', 'run', 'malformed'])(
    'refuses %s legacy binding',
    async (failure) => {
      const { parseLegacyBinding } = await import('../../../../scripts/release/v2/baseline');
      await expect(async () =>
        parseLegacyBinding(
          failure === 'duplicate'
            ? message + ' source=' + source
            : failure === 'malformed'
              ? message + ' invalid-token'
              : message,
          failure === 'source' ? '4'.repeat(40) : source,
          failure === 'head' ? '5'.repeat(40) : head,
          failure === 'run' ? '102' : '101',
        ),
      ).rejects.toThrow();
    },
  );
  it('matches every generated public byte, including assets, before reusing content', async () => {
    const { matchPublicTree } = await import('../../../../scripts/release/v2/baseline');
    const root = await mkdtemp(path.join(os.tmpdir(), 'release-baseline-'));
    roots.push(root);
    const files = new Map([
      ['catalog-v3.json', '{"courses":[]}\n'],
      ['diagram.svg', '<svg/>'],
    ]);
    for (const [name, bytes] of files) await writeFile(path.join(root, name), bytes);
    const seen: string[] = [];
    const result = await matchPublicTree(root, async (relative) => {
      seen.push(relative);
      return Buffer.from(files.get(relative)!);
    });
    expect(result.digest).toBe((await hashArtifact(root)).digest);
    expect(seen.sort()).toEqual([...files.keys()].sort());
    await expect(
      matchPublicTree(root, async (relative) =>
        Buffer.from(relative === 'diagram.svg' ? '<svg>changed</svg>' : files.get(relative)!),
      ),
    ).rejects.toThrow();
  });
  it('identifies a failed public path and bounded HTTP status without logging arbitrary error text', async () => {
    const { matchPublicTree } = await import('../../../../scripts/release/v2/baseline');
    const root = await mkdtemp(path.join(os.tmpdir(), 'release-baseline-status-'));
    roots.push(root);
    await writeFile(path.join(root, 'asset.svg'), '<svg/>');
    await expect(
      matchPublicTree(root, async () => {
        throw new Error('Public baseline request failed: 503');
      }),
    ).rejects.toMatchObject({
      message:
        'Public content could not be verified: asset.svg (Public baseline request failed: 503)',
    });
    await expect(
      matchPublicTree(root, async () => {
        throw new Error('arbitrary-private-detail');
      }),
    ).rejects.toMatchObject({
      message: 'Public content could not be verified: asset.svg (request failed)',
    });
  });
  it.each(['missing', 'pending', 'failure', 'wrong-url', 'wrong-ref', 'wrong-run'])(
    'does not infer current public source from %s deployment',
    async (failure) => {
      const { parseActualDeployment } = await import('../../../../scripts/release/v2/baseline');
      const deployment = {
        id: 501,
        sha: head,
        ref: failure === 'wrong-ref' ? 'topic' : 'main',
        environment: 'github-pages',
      };
      const status = {
        state:
          failure === 'pending' ? 'in_progress' : failure === 'failure' ? 'failure' : 'success',
        environment_url:
          failure === 'wrong-url' ? 'https://other.invalid/' : 'https://owner.github.io/site/',
        log_url: `https://github.com/owner/site/actions/runs/${failure === 'wrong-run' ? 'not-a-run' : '101'}/job/201`,
      };
      expect(() =>
        parseActualDeployment(
          failure === 'missing' ? undefined : deployment,
          status,
          'owner/site',
          'https://owner.github.io/site/',
        ),
      ).toThrow();
    },
  );
});
