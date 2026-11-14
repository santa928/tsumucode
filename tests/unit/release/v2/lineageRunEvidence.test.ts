// @vitest-environment node
import { expect, it } from 'vitest';
import vm from 'node:vm';
import { canonicalJson } from '../../../../src/core/persistence/canonicalJson';
import { hashBytes, hashValue } from '../../../../scripts/release/v2/identity';
import {
  matchLineageEvidenceFiles,
  matchLineageEvidenceParent,
  matchSameRunLineageEvidence,
} from '../../../../scripts/release/v2/lineageRunEvidence';
import { releaseFixture } from './releaseFixture';
const common = {
  schemaVersion: 1,
  repository: 'santa928/tsumucode',
  runId: '101',
  attempt: 1,
  source: 'a'.repeat(40),
  producerJobId: '201',
  verifierCommit: '2'.repeat(40),
  movementDeclarationDigest: '4ce18d583429e685ee951def56982bb5c5b292b7e4ad78e162d5ebd2703da494',
  parentIdentityDigest: 'c'.repeat(64),
  parentTagDigest: '005611a22025a12d925bda0fdfb47c96266cf0d3a57aef984f358528a74ead3b',
  parentDeploymentId: '7699435659',
  parentSource: 'b9306eb3414e69a2068603cfdbf2706ebe4e9284',
};
const test = (value: unknown) => {
  const bytes = Buffer.from(canonicalJson(value));
  return { bytes, sha256: hashBytes(bytes) };
};
it('rejects foreign shared evidence backing', () => {
  const anchor = test({ ...common, mode: 'anchor' });
  const expected = { repository: common.repository, runId: common.runId, attempt: common.attempt,
    source: common.source, producerJobId: common.producerJobId, verifierCommit: common.verifierCommit,
    mode: 'anchor', sha256: anchor.sha256 };
  const shared = vm.runInNewContext(`new SharedArrayBuffer(${String(anchor.bytes.length)})`) as SharedArrayBuffer;
  const wrapped = new Uint8Array(shared);
  wrapped.set(anchor.bytes);
  expect(() => matchSameRunLineageEvidence(wrapped, expected)).toThrow('Invalid lineage evidence bytes');
  const normal = vm.runInNewContext(`new ArrayBuffer(${String(anchor.bytes.length)})`) as ArrayBuffer;
  const normalView = new Uint8Array(normal);
  normalView.set(anchor.bytes);
  expect(matchSameRunLineageEvidence(normalView, expected).mode).toBe('anchor');
});
it('hides hostile evidence getter errors', () => {
  class Hostile extends Uint8Array {
    get buffer(): ArrayBuffer { throw Error('synthetic-secret-getter'); }
  }
  expect(() => matchSameRunLineageEvidence(new Hostile(2), {})).toThrow('Invalid lineage evidence bytes');
});

it('rejects foreign shared signed bytes', () => {
  const subject = Buffer.from('subject'), bundle = Buffer.from('bundle');
  const signed = { ...common, mode: 'signed', parentDeploymentId: '202',
    subjectSha256: hashBytes(subject), bundleSha256: hashBytes(bundle) };
  const shared = vm.runInNewContext(`new SharedArrayBuffer(${String(subject.length)})`) as SharedArrayBuffer;
  const wrapped = new Uint8Array(shared);
  wrapped.set(subject);
  expect(() => matchLineageEvidenceFiles(signed, { subject: wrapped, bundle })).toThrow('Invalid lineage file bytes');
});
it('hides hostile signed byte getter errors', () => {
  const signed = { ...common, mode: 'signed', parentDeploymentId: '202',
    subjectSha256: hashBytes(Buffer.from('subject')), bundleSha256: hashBytes(Buffer.from('bundle')) };
  class Hostile extends Uint8Array {
    get buffer(): ArrayBuffer { throw Error('synthetic-secret-getter'); }
  }
  expect(() => matchLineageEvidenceFiles(signed, { subject: new Hostile(2), bundle: Buffer.from('bundle') })).toThrow('Invalid lineage file bytes');
});
it('matches bounded canonical evidence to independently supplied same-run context (shape only)', () => {
  const anchor = test({ ...common, mode: 'anchor' }),
    expected = {
      repository: common.repository,
      runId: common.runId,
      attempt: common.attempt,
      source: common.source,
      producerJobId: common.producerJobId,
      verifierCommit: common.verifierCommit,
      mode: 'anchor',
      sha256: anchor.sha256,
    };
  expect(matchSameRunLineageEvidence(anchor.bytes, expected).mode).toBe('anchor');
  for (const changed of [
    { ...expected, repository: 'other/repo' },
    { ...expected, runId: '102' },
    { ...expected, attempt: 2 },
    { ...expected, source: 'e'.repeat(40) },
    { ...expected, producerJobId: '202' },
    { ...expected, verifierCommit: '3'.repeat(40) },
    { ...expected, mode: 'signed' },
    { ...expected, sha256: 'f'.repeat(64) },
  ])
    expect(() => {
      matchSameRunLineageEvidence(anchor.bytes, changed);
    }).toThrow();
  const signed = test({
    ...common,
    mode: 'signed',
    parentDeploymentId: '202',
    subjectSha256: 'e'.repeat(64),
    bundleSha256: 'f'.repeat(64),
  });
  expect(
    matchSameRunLineageEvidence(signed.bytes, {
      ...expected,
      mode: 'signed',
      sha256: signed.sha256,
    }).mode,
  ).toBe('signed');
  const fakeSignedAnchor = test({
    ...common,
    mode: 'signed',
    subjectSha256: 'e'.repeat(64),
    bundleSha256: 'f'.repeat(64),
  });
  expect(() => {
    matchSameRunLineageEvidence(fakeSignedAnchor.bytes, {
      ...expected,
      mode: 'signed',
      sha256: fakeSignedAnchor.sha256,
    });
  }).toThrow('Historical anchor cannot claim a signed lineage');
  for (const bad of [
    { ...common, mode: 'signed', subjectSha256: 'e'.repeat(64) },
    { ...common, mode: 'signed', subjectSha256: 'e'.repeat(64), bundleSha256: 'f'.repeat(64) },
    { ...common, mode: 'anchor', subjectSha256: 'e'.repeat(64) },
    { ...common, mode: 'anchor', parentTagDigest: 'f'.repeat(64) },
    { ...common, mode: 'anchor', parentDeploymentId: '10' },
    { ...common, mode: 'anchor', movementDeclarationDigest: 'f'.repeat(64) },
    { ...common, mode: 'anchor', extra: true },
  ]) {
    const item = test(bad);
    expect(() => {
      matchSameRunLineageEvidence(item.bytes, { ...expected, sha256: item.sha256 });
    }).toThrow();
  }
  const shared = new Uint8Array(new SharedArrayBuffer(anchor.bytes.length));
  shared.set(anchor.bytes);
  expect(() => {
    matchSameRunLineageEvidence(shared, expected);
  }).toThrow();
  const noncanonical = Buffer.from(JSON.stringify({ ...common, mode: 'anchor' }, null, 2));
  expect(() => {
    matchSameRunLineageEvidence(noncanonical, { ...expected, sha256: hashBytes(noncanonical) });
  }).toThrow();
  // A recomputed self-consistent value is structurally valid: only an independently trusted
  // needs output and live parent verification can authorize its use.
  const forged = test({ ...common, mode: 'anchor', parentIdentityDigest: 'f'.repeat(64) });
  expect(
    matchSameRunLineageEvidence(forged.bytes, { ...expected, sha256: forged.sha256 })
      .parentIdentityDigest,
  ).toBe('f'.repeat(64));
});

it('binds exact signed bytes without treating hashes as signature authentication', () => {
  const subject = Buffer.from('subject'),
    bundle = Buffer.from('bundle');
  const anchor = { ...common, mode: 'anchor' };
  expect(() => {
    matchLineageEvidenceFiles(anchor, {});
  }).not.toThrow();
  expect(() => {
    matchLineageEvidenceFiles(anchor, { subject });
  }).toThrow('Anchor carries unexpected signed evidence');
  expect(() => {
    matchLineageEvidenceFiles(anchor, { bundle });
  }).toThrow('Anchor carries unexpected signed evidence');
  const signed = {
    ...anchor,
    mode: 'signed',
    parentDeploymentId: '202',
    subjectSha256: hashBytes(subject),
    bundleSha256: hashBytes(bundle),
  };
  const copies = matchLineageEvidenceFiles(signed, { subject, bundle });
  const originalSubject = Buffer.from(subject),
    originalBundle = Buffer.from(bundle);
  subject.fill(0);
  bundle.fill(0);
  expect(copies.subject).toEqual(originalSubject);
  expect(copies.bundle).toEqual(originalBundle);
  originalSubject.copy(subject);
  originalBundle.copy(bundle);
  expect(() => {
    matchLineageEvidenceFiles(signed, { subject, bundle: Buffer.from('changed') });
  }).toThrow('Signed parent bytes differ');
  expect(() => {
    matchLineageEvidenceFiles(signed, { subject: Buffer.from('changed'), bundle });
  }).toThrow('Signed parent bytes differ');
  expect(() => {
    matchLineageEvidenceFiles(signed, { subject: Buffer.alloc(16 * 1024 + 1), bundle });
  }).toThrow('Invalid lineage file bytes');
  expect(() => {
    matchLineageEvidenceFiles(signed, { subject });
  }).toThrow('Invalid lineage file bytes');
  const shared = new Uint8Array(new SharedArrayBuffer(subject.length));
  shared.set(subject);
  expect(() => {
    matchLineageEvidenceFiles(signed, { subject: shared, bundle });
  }).toThrow('Invalid lineage file bytes');
});

it('matches fresh parent identity without treating its observedAt as stable identity', () => {
  const f = releaseFixture().capturedBaseline,
    proof = {
      ...f.proof,
      repository: 'santa928/tsumucode',
      deploymentId: common.parentDeploymentId,
      sourceCommit: common.parentSource,
      workflowHeadCommit: common.parentSource,
      tagDigest: common.parentTagDigest,
    };
  const baseline = {
    ...f.baseline,
    deploymentId: proof.deploymentId,
    sourceCommit: proof.sourceCommit,
    sourceRecordDigest: hashValue(proof),
  };
  const evidence = {
    ...common,
    mode: 'anchor',
    parentIdentityDigest: hashValue({ ...proof, observedAt: null }),
  };
  expect(() => {
    matchLineageEvidenceParent(evidence, { baseline, proof });
  }).not.toThrow();
  const fresh = { ...proof, observedAt: '2026-11-12T00:00:00Z' };
  expect(() => {
    matchLineageEvidenceParent(evidence, {
      baseline: { ...baseline, sourceRecordDigest: hashValue(fresh) },
      proof: fresh,
    });
  }).not.toThrow();
  expect(() => {
    matchLineageEvidenceParent(
      { ...evidence, parentIdentityDigest: 'f'.repeat(64) },
      { baseline, proof },
    );
  }).toThrow('Fresh parent identity differs');
  expect(() => {
    matchLineageEvidenceParent(evidence, {
      baseline: { ...baseline, sourceRecordDigest: 'f'.repeat(64) },
      proof,
    });
  }).toThrow();
  const otherRepo = { ...proof, repository: 'other/repo' };
  expect(() => {
    matchLineageEvidenceParent(
      { ...evidence, parentIdentityDigest: hashValue({ ...otherRepo, observedAt: null }) },
      { baseline: { ...baseline, sourceRecordDigest: hashValue(otherRepo) }, proof: otherRepo },
    );
  }).toThrow('Fresh parent identity differs');
});
