// @vitest-environment node
import { execFileSync } from 'node:child_process';
import type * as ChildProcess from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { canonicalJson } from '../../../../src/core/persistence/canonicalJson';
import { hashBytes, hashValue } from '../../../../scripts/release/v2/identity';
import { releaseFixture } from './releaseFixture';
import { gitFixtureEnvironment } from './gitFixture';
import { installSafeAnchorTestEnvironment } from './anchorProcessTestEnvironment';

const mocks = vi.hoisted(() => ({
  observe: vi.fn(),
  trackedTree: vi.fn(),
  candidateRoot: '',
  source: '',
  verifierRoot: '',
}));
vi.mock('node:child_process', async (importOriginal) => {
  const original = await importOriginal<typeof ChildProcess>();
  const { promisify } = await import('node:util');
  const mocked = Object.assign(
    () => {
      throw Error('Unexpected callback path');
    },
    {
      [promisify.custom]: async (_command: string, args: string[], options: { cwd: string }) => {
        if (args.includes('status')) return { stdout: '', stderr: '' };
        if (args.includes('ls-files')) return { stdout: 'H candidate.txt\0', stderr: '' };
        if (args.includes('rev-parse')) {
          if (options.cwd === mocks.verifierRoot)
            return { stdout: '28edb392dccfaecd14c5b5b03470198abd8ec421\n', stderr: '' };
          if (options.cwd === mocks.candidateRoot)
            return { stdout: mocks.source + '\n', stderr: '' };
        }
        throw Error('Unexpected Git call');
      },
    },
  );
  return { ...original, execFile: mocked };
});
vi.mock('../../../../scripts/release/v2/pythonFirstAnchorVerifier', () => ({
  verifyPythonFirstAnchor: mocks.observe,
}));
vi.mock('../../../../scripts/release/v2/anchorTrackedTree', () => ({
  assertAnchorTrackedTree: mocks.trackedTree,
}));
import { producePythonFirstAnchor } from '../../../../scripts/release/v2/pythonFirstAnchorProducer';
import {
  matchSameRunLineageEvidence,
  matchLineageEvidenceFiles,
  matchLineageEvidenceParent,
} from '../../../../scripts/release/v2/lineageRunEvidence';

beforeEach(() => {
  installSafeAnchorTestEnvironment();
  mocks.trackedTree.mockResolvedValue(undefined);
});
afterEach(() => {
  mocks.trackedTree.mockReset();
  vi.unstubAllEnvs();
});

it('binds minimal anchor evidence to a freshly recaptured parent without claiming authentication', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'anchor-evidence-integration-'));
  try {
    const env = gitFixtureEnvironment();
    execFileSync('git', ['init', '--quiet', root], { env });
    writeFileSync(path.join(root, 'candidate.txt'), 'candidate');
    execFileSync('git', ['add', 'candidate.txt'], { cwd: root, env });
    execFileSync(
      'git',
      [
        '-c',
        'user.name=Test',
        '-c',
        'user.email=test@example.invalid',
        '-c',
        'commit.gpgsign=false',
        'commit',
        '--quiet',
        '-m',
        'candidate',
      ],
      { cwd: root, env },
    );
    const source = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: root,
      env,
      encoding: 'utf8',
    }).trim();
    mocks.candidateRoot = root;
    mocks.source = source;
    mocks.verifierRoot = process.cwd();
    const original = releaseFixture().capturedBaseline;
    const proof = {
      ...original.proof,
      repository: 'santa928/tsumucode',
      deploymentId: '7699435659',
      sourceCommit: 'b9306eb3414e69a2068603cfdbf2706ebe4e9284',
      workflowHeadCommit: 'b9306eb3414e69a2068603cfdbf2706ebe4e9284',
      tagDigest: '005611a22025a12d925bda0fdfb47c96266cf0d3a57aef984f358528a74ead3b',
      inventoryDigest: hashValue(original.baseline.inventory),
    };
    const baseline = {
      ...original.baseline,
      deploymentId: proof.deploymentId,
      sourceCommit: proof.sourceCommit,
      artifactDigest: proof.artifactDigest,
      sourceRecordDigest: hashValue(proof),
    };
    const snapshot = canonicalJson({ baseline, proof });
    mocks.observe.mockResolvedValue({
      snapshot,
      sha256: hashBytes(Buffer.from(snapshot)),
      declarationDigest: '4ce18d583429e685ee951def56982bb5c5b292b7e4ad78e162d5ebd2703da494',
    });
    const context = {
      repository: 'santa928/tsumucode',
      source,
      runId: '101',
      attempt: 1,
      producerJob: 'anchor_observer',
      producerJobId: '202',
      eventName: 'workflow_dispatch',
      ref: 'refs/heads/main',
    };
    const result = await producePythonFirstAnchor(root, process.cwd(), context);
    const expected = {
      repository: context.repository,
      source,
      runId: context.runId,
      attempt: context.attempt,
      producerJobId: context.producerJobId,
      verifierCommit: '28edb392dccfaecd14c5b5b03470198abd8ec421',
      mode: 'anchor',
      sha256: result.evidenceSha256,
    };
    const evidence = matchSameRunLineageEvidence(result.evidenceBytes, expected);
    expect(result).not.toHaveProperty('baselineBytes');
    expect(evidence).not.toHaveProperty('baselineSha256');
    expect(evidence).not.toHaveProperty('inventory');
    expect(Object.keys(evidence).sort()).toEqual(
      [
        'schemaVersion',
        'mode',
        'repository',
        'source',
        'runId',
        'attempt',
        'producerJobId',
        'verifierCommit',
        'parentDeploymentId',
        'parentSource',
        'parentTagDigest',
        'parentIdentityDigest',
        'movementDeclarationDigest',
      ].sort(),
    );

    const freshProof = {
      ...proof,
      observedAt: new Date(Date.parse(proof.observedAt) + 1000).toISOString(),
    };
    const freshBaseline = { ...baseline, sourceRecordDigest: hashValue(freshProof) };
    const fresh = { baseline: freshBaseline, proof: freshProof };
    expect(matchLineageEvidenceFiles(evidence, {})).toEqual({});
    expect(matchLineageEvidenceParent(evidence, fresh)).toBe(canonicalJson(fresh));
    expect(freshBaseline.sourceRecordDigest).not.toBe(baseline.sourceRecordDigest);

    expect(() =>
      matchSameRunLineageEvidence(result.evidenceBytes, { ...expected, producerJobId: '203' }),
    ).toThrow('Lineage evidence context differs');
    expect(() =>
      matchLineageEvidenceFiles(evidence, { subject: Buffer.from('unexpected') }),
    ).toThrow('Anchor carries unexpected signed evidence');
    expect(() =>
      matchLineageEvidenceParent(evidence, {
        baseline: { ...freshBaseline, sourceRecordDigest: '0'.repeat(64) },
        proof: freshProof,
      }),
    ).toThrow('Captured baseline identity differs');
    const alteredProof = { ...freshProof, publicContentDigest: 'f'.repeat(64) };
    const altered = {
      baseline: { ...freshBaseline, sourceRecordDigest: hashValue(alteredProof) },
      proof: alteredProof,
    };
    expect(() => matchLineageEvidenceParent(evidence, altered)).toThrow(
      'Fresh parent identity differs',
    );

    // A self-consistent pair is still only structural evidence. An authenticated needs output
    // and independent verifier/fresh fence are necessary to reject this coordinated substitution.
    const forgedBytes = Buffer.from(
      canonicalJson({
        ...evidence,
        parentIdentityDigest: hashValue({ ...alteredProof, observedAt: null }),
      }),
    );
    const forgedEvidence = matchSameRunLineageEvidence(forgedBytes, {
      ...expected,
      sha256: hashBytes(forgedBytes),
    });
    expect(matchLineageEvidenceParent(forgedEvidence, altered)).toBe(canonicalJson(altered));
  } finally {
    mocks.observe.mockReset();
    rmSync(root, { recursive: true, force: true });
  }
});
