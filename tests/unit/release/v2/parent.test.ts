// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { InventorySchema } from '../../../../scripts/release/v2/schema';
import { hashValue } from '../../../../scripts/release/v2/identity';
import { planRelease } from '../../../../scripts/release/v2/plan';
const inventory = InventorySchema.parse({
  schemaVersion: 1,
  fingerprintVersion: 1,
  courses: [
    {
      id: 'topic',
      revision: '1',
      publicationStatus: 'published',
      runner: 'html-css',
      lessons: [
        {
          id: 'lesson',
          kind: 'standard',
          learnerDigest: 'a'.repeat(64),
          exerciseDigest: 'b'.repeat(64),
          navigationDigest: 'c'.repeat(64),
          persistenceDigest: 'd'.repeat(64),
          exercises: [],
        },
      ],
    },
  ],
});
function envelope() {
  const proof = {
    schemaVersion: 1,
    repository: 'owner/site',
    deploymentId: '501',
    sourceCommit: '1'.repeat(40),
    workflowHeadCommit: '2'.repeat(40),
    runId: '101',
    tag: 'refs/tags/tsumucode-release-fixture',
    tagDigest: '3'.repeat(64),
    artifactDigest: '4'.repeat(64),
    artifactDigestFormat: 'legacy-canonical-dist',
    projection: 'authoring',
    inventoryDigest: hashValue(inventory),
    publicContentDigest: '5'.repeat(64),
    publicFiles: 2,
    observedAt: '2026-10-28T15:00:00Z',
  };
  return {
    baseline: {
      deploymentId: '501',
      sourceCommit: proof.sourceCommit,
      artifactDigest: proof.artifactDigest,
      sourceRecordDigest: hashValue(proof),
      inventory: structuredClone(inventory),
    },
    proof,
  };
}
const actual = {
  deploymentId: '501',
  workflowHeadCommit: '2'.repeat(40),
  runId: '101',
  siteUrl: 'https://owner.github.io/site/',
};
describe('current deployment parent contract', () => {
  it('binds the parent record to the release plan', () => {
    const value = envelope();
    expect(planRelease(inventory, value.baseline)).toMatchObject({
      parent: { deploymentId: '501', sourceRecordDigest: value.baseline.sourceRecordDigest },
    });
  });
  it('accepts only an intact captured baseline matching actual deployment', async () => {
    const { confirmCapturedBaseline } = await import('../../../../scripts/release/v2/parent');
    expect(confirmCapturedBaseline(envelope(), actual, 'owner/site').deploymentId).toBe('501');
  });
  it.each(['digest', 'inventory', 'source', 'deployment', 'workflow', 'run', 'repository'])(
    'rejects %s parent substitution',
    async (failure) => {
      const { confirmCapturedBaseline } = await import('../../../../scripts/release/v2/parent');
      const value = envelope();
      const live = { ...actual };
      switch (failure) {
        case 'digest':
          value.baseline.sourceRecordDigest = '0'.repeat(64);
          break;
        case 'inventory':
          value.baseline.inventory.courses[0]!.lessons[0]!.learnerDigest = '0'.repeat(64);
          break;
        case 'source':
          value.baseline.sourceCommit = '0'.repeat(40);
          break;
        case 'deployment':
          live.deploymentId = '502';
          break;
        case 'workflow':
          live.workflowHeadCommit = '0'.repeat(40);
          break;
        case 'run':
          live.runId = '102';
          break;
        case 'repository':
          value.proof.repository = 'other/site';
          break;
      }
      expect(() => confirmCapturedBaseline(value, live, 'owner/site')).toThrow();
    },
  );
});
