// @vitest-environment node
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { assertFixedPythonFirstAnchor } from '../../../../scripts/release/v2/pythonFirstAnchorIdentity';
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
it('accepts only the pinned public tag and identity, without authorizing a deployment', () => {
  expect(() => {
    assertFixedPythonFirstAnchor(proof, tag);
  }).not.toThrow();
  for (const changed of [
    { ...proof, deploymentId: '7699435660' },
    { ...proof, sourceCommit: 'f'.repeat(40) },
    { ...proof, inventoryDigest: 'f'.repeat(64) },
    { ...proof, publicContentDigest: 'f'.repeat(64) },
    { ...proof, artifactDigest: 'f'.repeat(64) },
    { ...proof, observedAt: '2026-11-11T02:08:27.000Z' },
  ])
    expect(() => {
      assertFixedPythonFirstAnchor(changed, tag);
    }).toThrow();
  const altered = Buffer.from(tag);
  altered[altered.length - 1] = altered[altered.length - 1]! ^ 1;
  expect(() => {
    assertFixedPythonFirstAnchor(proof, altered);
  }).toThrow();
  const shared = new Uint8Array(new SharedArrayBuffer(tag.length));
  shared.set(tag);
  expect(() => {
    assertFixedPythonFirstAnchor(proof, shared);
  }).toThrow();
});
