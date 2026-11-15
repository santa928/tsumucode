/* global __dirname, __filename */
// Synthetic schema validation only. All downstream calls are blocked mocks.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { readFileSync } = require('node:fs');
const { createRequire } = require('node:module');
const { createJiti } = require('jiti');
const deps = createRequire(__filename);
const ts = deps('typescript');
const root = path.resolve(__dirname, '../../..');
const jiti = createJiti(path.join(root, 'needs-probe.cjs'), { moduleCache: false, fsCache: false });
const safeParse = jiti('./tests/local/lineage-manifest-redaction/lineageNeedsParse.ts');
const sentinel = 'SYNTHETIC_PRIVATE_MARKER_7329';
const context = {
  repository: 'santa928/tsumucode',
  repositoryId: '1303564490',
  event: 'workflow_dispatch',
  ref: 'refs/heads/main',
  workflowRef: 'santa928/tsumucode/.github/workflows/pages.yml@refs/heads/main',
  runId: '123',
  source: 'a'.repeat(40),
  workflowSha: 'a'.repeat(40),
  signerCommit: 'b'.repeat(40),
  attempt: 1,
  qualificationAttempt: 1,
  reportAttempt: 1,
  workspace: '/workspace',
};
const needs = {
  result: 'success',
  evidenceBase64: 'e30=',
  evidenceSha256: 'c'.repeat(64),
  snapshotSha256: 'd'.repeat(64),
  producerJobId: '456',
  mode: 'anchor',
};
const pins = {
  candidateId: '11',
  metadataId: '12',
  qualificationId: '13',
  reportId: '14',
  candidateArchive: 'e'.repeat(64),
  metadataArchive: 'e'.repeat(64),
  qualificationArchive: 'e'.repeat(64),
  reportArchive: 'e'.repeat(64),
  qualificationSha256: 'f'.repeat(64),
};
function load(file) {
  const source = readFileSync(file, 'utf8');
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  const blocked = () => {
    throw Error('Unexpected downstream call');
  };
  const modules = {
    'node:path': path,
    zod: deps('zod'),
    './lineageNeedsParse': safeParse,
    './lineageCallerPolicy': { assertReviewedCaller: blocked },
    './lineageNeedsIntake': { decodeNeedsEvidence: blocked },
    './lineageProducerMetadata': { inspectLineageProducer: blocked },
    './lineageJobHistoryTransport': { fetchLineageJobHistory: blocked },
    './lineageArtifactMetadata': {
      inspectPredeployArtifactMetadata: blocked,
      inspectSameRunArtifactMetadata: blocked,
    },
    './lineageParentBindingPolicy': { LINEAGE_PARENT_BINDING_POLICY: { producerJobNames: [] } },
    './lineageRunEvidence': { matchSameRunLineageEvidence: blocked },
  };
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', js)(
    (name) => {
      if (!Object.hasOwn(modules, name)) throw Error('Unexpected import');
      return modules[name];
    },
    mod,
    mod.exports,
  );
  return mod.exports;
}
const original = load(path.join(__dirname, 'original-direct-needs.fixture'));
const candidate = load(path.join(__dirname, 'candidate-direct-needs.fixture'));

async function rejectsPrivately(promise) {
  try {
    await promise;
    assert.fail('Expected rejection');
  } catch (error) {
    assert.equal(error.message, 'Invalid direct-needs input');
    assert.equal(String(error.stack).includes(sentinel), false);
    assert.equal('cause' in error, false);
  }
}
test('original nested strict schema exposes a synthetic unknown key in its error', async () => {
  let exposed = false;
  try {
    await original.corroborateDirectNeedsCandidate(
      { ...context, [sentinel]: true },
      needs,
      pins,
      'synthetic-token',
    );
  } catch (error) {
    exposed = String(error.message).includes(sentinel);
  }
  assert.equal(exposed, true);
});
for (const key of ['context', 'needs', 'pins']) {
  test(`nested ${key} unknown key is rejected without revealing it`, async () => {
    const args = [context, needs, pins].map((value, i) =>
      i === ['context', 'needs', 'pins'].indexOf(key) ? { ...value, [sentinel]: true } : value,
    );
    await rejectsPrivately(candidate.corroborateDirectNeedsCandidate(...args, 'synthetic-token'));
  });
}
test('invalid private values and observation keys are rejected without error fragments', async () => {
  await rejectsPrivately(
    candidate.corroborateDirectNeedsCandidate(
      { ...context, runId: sentinel },
      needs,
      pins,
      'synthetic-token',
    ),
  );
  await rejectsPrivately(
    Promise.resolve().then(() =>
      candidate.snapshotDirectNeedsObservation({
        runId: '123',
        attempt: 1,
        source: 'a'.repeat(40),
        parentIdentityDigest: 'b'.repeat(64),
        snapshotSha256: 'c'.repeat(64),
        [sentinel]: true,
      }),
    ),
  );
});
test('valid postdeploy input remains fail-closed before downstream calls', async () => {
  await assert.rejects(
    candidate.corroborateDirectNeedsCandidate(context, needs, pins, 'synthetic-token'),
    /Reviewed producer job policy is not configured/,
  );
});
test('predeploy nested context, needs and pins reject privately; valid input stays closed', async () => {
  const { reportAttempt, ...rest } = context;
  void reportAttempt;
  const pre = { ...rest, phase: 'predeploy' };
  const { reportId, reportArchive, ...prePins } = pins;
  void reportId;
  void reportArchive;
  for (const i of [0, 1, 2]) {
    const args = [pre, needs, prePins].map((value, j) =>
      i === j ? { ...value, [sentinel]: true } : value,
    );
    await rejectsPrivately(
      candidate.corroboratePredeployDirectNeedsCandidate(...args, 'synthetic-token'),
    );
  }
  await assert.rejects(
    candidate.corroboratePredeployDirectNeedsCandidate(pre, needs, prePins, 'synthetic-token'),
    /Reviewed producer job policy is not configured/,
  );
});
