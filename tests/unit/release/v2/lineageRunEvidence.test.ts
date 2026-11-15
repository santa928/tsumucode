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

it('does not expose unknown expected fields or accessor failures in errors', () => {
  const anchor = test({ ...common, mode: 'anchor' });
  const expected = { repository: common.repository, runId: common.runId, attempt: common.attempt,
    source: common.source, producerJobId: common.producerJobId, verifierCommit: common.verifierCommit,
    mode: 'anchor', sha256: anchor.sha256 };
  const marker = 'synthetic-private-marker';
  const getter = { ...expected, get repository(): string { throw Error(marker); } };
  for (const input of [{ ...expected, [marker]: true }, getter]) {
    try {
      matchSameRunLineageEvidence(anchor.bytes, input);
      throw Error('Expected rejection');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe('Invalid lineage expected context');
      expect((error as Error).stack).not.toContain(marker);
      expect((error as Error).cause).toBeUndefined();
    }
  }
});

it('does not expose unknown evidence fields or malformed JSON in errors', () => {
  const marker = 'synthetic-private-marker';
  const invalid = [test({ ...common, mode: 'anchor', [marker]: true }).bytes,
    Buffer.from(`{"${marker}":`), Buffer.from([0xff])];
  for (const bytes of invalid) {
    const expected = { repository: common.repository, runId: common.runId, attempt: common.attempt,
      source: common.source, producerJobId: common.producerJobId, verifierCommit: common.verifierCommit,
      mode: 'anchor', sha256: hashBytes(bytes) };
    try {
      matchSameRunLineageEvidence(bytes, expected);
      throw Error('Expected rejection');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe('Invalid lineage evidence');
      expect((error as Error).stack).not.toContain(marker);
      expect((error as Error).cause).toBeUndefined();
    }
  }
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

it('does not expose untrusted evidence keys or file getter failures', () => {
  const marker = 'synthetic-private-marker';
  const anchor = { ...common, mode: 'anchor' };
  const hostile = { get subject(): Uint8Array { throw Error(marker); } };
  for (const [action, expected] of [
    [() => matchLineageEvidenceFiles({ ...anchor, [marker]: true }, {}), 'Invalid lineage evidence'],
    [() => matchLineageEvidenceFiles(anchor, hostile), 'Invalid lineage file input'],
    [() => matchLineageEvidenceFiles(anchor, { get bundle(): Uint8Array { throw Error(marker); } }), 'Invalid lineage file input'],
  ] as const) {
    try {
      action();
      throw Error('Expected rejection');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe(expected);
      expect((error as Error).stack).not.toContain(marker);
      expect((error as Error).cause).toBeUndefined();
    }
  }
  expect(() => matchLineageEvidenceFiles(anchor, {
    subject: Buffer.from('subject'),
    get bundle(): Uint8Array { throw Error(marker); },
  })).toThrow('Anchor carries unexpected signed evidence');
});

it('snapshots signed subject before invoking the bundle getter', () => {
  const good = Buffer.from('GOOD');
  const bundle = Buffer.from('bundle');
  const evidence = {
    ...common, mode: 'signed', parentDeploymentId: '202',
    subjectSha256: hashBytes(good), bundleSha256: hashBytes(bundle),
  };
  const badBefore = Buffer.from('BAD!');
  expect(() => matchLineageEvidenceFiles(evidence, {
    subject: badBefore,
    get bundle(): Uint8Array { good.copy(badBefore); return bundle; },
  })).toThrow('Signed parent bytes differ');
  const goodBefore = Buffer.from(good);
  const copied = matchLineageEvidenceFiles(evidence, {
    subject: goodBefore,
    get bundle(): Uint8Array { goodBefore.fill(0); return bundle; },
  });
  expect(copied.subject).toEqual(good);
  let bundleRead = false;
  expect(() => matchLineageEvidenceFiles(evidence, {
    subject: new Uint8Array(),
    get bundle(): Uint8Array { bundleRead = true; return bundle; },
  })).toThrow('Invalid lineage file bytes');
  expect(bundleRead).toBe(false);
});

it('does not expose untrusted evidence or parent fields in identity errors', () => {
  const marker = 'synthetic-private-marker';
  const anchor = { ...common, mode: 'anchor' };
  for (const [evidence, parent, expected] of [
    [{ ...anchor, [marker]: true }, {}, 'Invalid lineage evidence'],
    [anchor, { ...releaseFixture().capturedBaseline, [marker]: true }, 'Invalid lineage parent'],
    [anchor, { get baseline(): never { throw Error(marker); } }, 'Invalid lineage parent'],
  ] as const) {
    try {
      matchLineageEvidenceParent(evidence, parent);
      throw Error('Expected rejection');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe(expected);
      expect((error as Error).stack).not.toContain(marker);
      expect((error as Error).cause).toBeUndefined();
    }
  }
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
  }).toThrow('Invalid lineage evidence');
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
