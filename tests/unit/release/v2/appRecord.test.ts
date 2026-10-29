// @vitest-environment node
import { describe, expect, it } from 'vitest';
const candidate = {
  schemaVersion: 1,
  repository: 'owner/site',
  runId: '101',
  buildJobId: 'build',
  buildAttempt: 1,
  artifactDigest: 'a'.repeat(64),
  artifactId: '301',
  planDigest: 'b'.repeat(64),
  recipe: {
    sourceCommit: '1'.repeat(40),
    sourceTree: '2'.repeat(40),
    lockDigest: 'c'.repeat(64),
    workflowDigest: 'd'.repeat(64),
    policyDigest: 'e'.repeat(64),
    toolchain: 'node-fixed',
    basePath: '/site/',
  },
};
const record = {
  schemaVersion: 2,
  repository: 'owner/site',
  workflowHeadCommit: '3'.repeat(40),
  candidate,
  deploymentId: '501',
  siteUrl: 'https://owner.github.io/site/',
  publicContentDigest: 'f'.repeat(64),
  inventoryDigest: 'a'.repeat(64),
  state: 'verified',
  qualificationDigest: 'b'.repeat(64),
  smokeDigest: 'c'.repeat(64),
  observedAt: '2026-10-28T16:00:00.000Z',
};
const actual = {
  repository: 'owner/site',
  deploymentId: '501',
  workflowHeadCommit: record.workflowHeadCommit,
  runId: '101',
  siteUrl: record.siteUrl,
};
describe('automatic same-artifact app record', () => {
  it('binds a verified deployment to its actual run, source and canonical bytes', async () => {
    const { parseAppBinding } = await import('../../../../scripts/release/v2/appRecord');
    expect(
      parseAppBinding(JSON.stringify(record), candidate.recipe.sourceCommit, actual),
    ).toMatchObject({
      sourceCommit: candidate.recipe.sourceCommit,
      artifactDigest: candidate.artifactDigest,
      artifactDigestFormat: 'canonical-dist-v1',
      projection: 'public',
      inventoryDigest: record.inventoryDigest,
    });
  });
  it.each([
    'source',
    'repository',
    'deployment',
    'head',
    'run',
    'url',
    'unverified',
    'smoke-failed',
    'missing-smoke',
    'extra',
  ])('refuses %s as an authenticated content baseline', async (failure) => {
    const { parseAppBinding } = await import('../../../../scripts/release/v2/appRecord');
    const changed = structuredClone(record);
    if (failure === 'source') changed.candidate.recipe.sourceCommit = '4'.repeat(40);
    if (failure === 'repository') changed.repository = 'owner/other';
    if (failure === 'deployment') changed.deploymentId = '502';
    if (failure === 'head') changed.workflowHeadCommit = '4'.repeat(40);
    if (failure === 'run') changed.candidate.runId = '102';
    if (failure === 'url') changed.siteUrl = 'https://evil.invalid/';
    if (failure === 'unverified') changed.state = 'deployed-unverified';
    if (failure === 'smoke-failed') changed.state = 'deployed-verification-failed';
    if (failure === 'missing-smoke') Reflect.deleteProperty(changed, 'smokeDigest');
    if (failure === 'extra') Reflect.set(changed, 'approved', true);
    expect(() =>
      parseAppBinding(JSON.stringify(changed), candidate.recipe.sourceCommit, actual),
    ).toThrow();
  });
});
