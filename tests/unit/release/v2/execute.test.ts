// @vitest-environment node
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { hashArtifact } from '../../../../scripts/release/v2/identity';
const roots: string[] = [];
async function setup() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'release-suite-'));
  roots.push(root);
  await writeFile(path.join(root, 'index.html'), 'reviewed bytes');
  const candidate = {
    schemaVersion: 1,
    repository: 'owner/site',
    runId: '101',
    buildJobId: '201',
    buildAttempt: 1,
    artifactDigest: (await hashArtifact(root)).digest,
    artifactId: '301',
    planDigest: 'a'.repeat(64),
    recipe: {
      sourceCommit: '1'.repeat(40),
      sourceTree: '2'.repeat(40),
      lockDigest: 'b'.repeat(64),
      workflowDigest: 'c'.repeat(64),
      policyDigest: 'd'.repeat(64),
      toolchain: 'fixed-image',
      basePath: '/site/',
    },
  };
  return { root, candidate };
}
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
const requirement = {
  suite: 'browser',
  producerJobId: '202',
  inputDigest: 'e'.repeat(64),
  targets: ['actual/case'],
};
const context = { runId: '101', jobId: '202', attempt: 2 };
describe('same artifact suite execution', () => {
  it('emits a receipt only after an actual successful driver and exact target coverage', async () => {
    const { executeSuite } = await import('../../../../scripts/release/v2/execute');
    const { root, candidate } = await setup();
    const output = await executeSuite(candidate, requirement, context, root, async () => ({
      targets: ['actual/case'],
      report: { tests: 1, passed: 1 },
    }));
    expect(output).toMatchObject({
      runId: '101',
      jobId: '202',
      verificationAttempt: 2,
      status: 'passed',
      targets: ['actual/case'],
    });
    expect(await readFile(path.join(root, 'index.html'), 'utf8')).toBe('reviewed bytes');
  });
  it.each(['throws', 'missing', 'duplicate', 'extra', 'mutates', 'empty', 'wrong-run'])(
    'refuses an unqualified receipt: %s',
    async (failure) => {
      const { executeSuite } = await import('../../../../scripts/release/v2/execute');
      const { root, candidate } = await setup();
      const driver = async () => {
        if (failure === 'throws') throw new Error('actual command failed');
        if (failure === 'mutates') await writeFile(path.join(root, 'index.html'), 'rebuild');
        return {
          targets:
            failure === 'missing' || failure === 'empty'
              ? []
              : failure === 'duplicate'
                ? ['actual/case', 'actual/case']
                : failure === 'extra'
                  ? ['actual/case', 'hidden/case']
                  : ['actual/case'],
          report: { tests: 1 },
        };
      };
      await expect(
        executeSuite(
          candidate,
          failure === 'empty' ? { ...requirement, targets: [] } : requirement,
          failure === 'wrong-run' ? { ...context, runId: '102' } : context,
          root,
          driver,
        ),
      ).rejects.toThrow();
    },
  );
});
