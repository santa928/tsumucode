/* global __dirname, __filename */
// Pure synthetic policy wiring. No real Git inspection, provenance or authorization.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { createRequire } = require('node:module');
const { createHash } = require('node:crypto');
const { Buffer } = require('node:buffer');
const path = require('node:path');
const deps = createRequire(__filename);
const ts = deps('typescript');
const root = path.resolve(__dirname, '../../..');
const source = readFileSync(path.join(root, 'scripts/release/v2/lineageCallerPolicy.ts'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
}).outputText;
const sha = (value) => createHash('sha256').update(value).digest('hex');
const sourceSha = '1'.repeat(40);
const signer = '2'.repeat(40);
const fixture = {
  caller: Buffer.from('synthetic caller'),
  qualification: Buffer.from('synthetic qualification'),
  publication: Buffer.from('synthetic publication'),
  pythonFixtures: Buffer.from('synthetic fixtures'),
};
const policy = () => ({
  callerDigests: [sha(fixture.caller)],
  qualificationWorkflowDigests: [sha(fixture.qualification)],
  publicationWorkflowDigests: [sha(fixture.publication)],
  pythonFixturesWorkflowDigests: [sha(fixture.pythonFixtures)],
});
function harness(trustedPolicy, observation = fixture) {
  let observed = 0;
  let topology = 0;
  const imports = {
    'node:path': path,
    './identity': { hashBytes: sha },
    './callerNormalization': { normalizedCallerDigest: sha },
    './signerTopology': {
      assertSignerTopology: () => {
        topology++;
      },
    },
    './trustedLineagePolicy': { TRUSTED_CALLER_POLICY: trustedPolicy },
    './isolatedCandidateGit.mjs': {
      observeIsolatedCandidateSourceWithPythonFixtures: async (workspace, commit) => {
        observed++;
        assert.equal(workspace, '/workspace');
        assert.equal(commit, sourceSha);
        return observation;
      },
    },
  };
  const mod = { exports: {} };
  const safeRequire = (name) => {
    if (!Object.hasOwn(imports, name)) throw Error('Unexpected import');
    return imports[name];
  };
  new Function('require', 'module', 'exports', compiled)(safeRequire, mod, mod.exports);
  return { check: mod.exports.assertReviewedCaller, counts: () => ({ observed, topology }) };
}
test('synthetic matching four workflow digests reaches structural inspection', async () => {
  const h = harness(policy());
  await h.check('/workspace/candidate', sourceSha, signer);
  assert.deepEqual(h.counts(), { observed: 1, topology: 1 });
});
for (const key of ['caller', 'qualification', 'publication', 'pythonFixtures']) {
  test(`rejects changed ${key} bytes before structural inspection`, async () => {
    const h = harness(policy(), { ...fixture, [key]: Buffer.from('synthetic changed') });
    await assert.rejects(
      h.check('/workspace/candidate', sourceSha, signer),
      /Candidate workflow differs/,
    );
    assert.deepEqual(h.counts(), { observed: 1, topology: 0 });
  });
}
test('empty fixture allowlist fails before source inspection', async () => {
  const h = harness({ ...policy(), pythonFixturesWorkflowDigests: [] });
  await assert.rejects(
    h.check('/workspace/candidate', sourceSha, signer),
    /Approved caller policy is not configured/,
  );
  assert.deepEqual(h.counts(), { observed: 0, topology: 0 });
});
test('actual unconfigured candidate policy remains closed before source inspection', async () => {
  const policySource = readFileSync(
    path.join(root, 'scripts/release/v2/trustedLineagePolicy.ts'),
    'utf8',
  );
  const policyJs = ts.transpileModule(policySource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  const policyModule = { exports: {} };
  new Function('module', 'exports', policyJs)(policyModule, policyModule.exports);
  const actual = policyModule.exports.TRUSTED_CALLER_POLICY;
  assert.deepEqual(actual.pythonFixturesWorkflowDigests, []);
  const h = harness(actual);
  await assert.rejects(
    h.check('/workspace/candidate', sourceSha, signer),
    /Approved caller policy is not configured/,
  );
  assert.deepEqual(h.counts(), { observed: 0, topology: 0 });
});
test('missing fixture bytes never reach structural inspection', async () => {
  const { pythonFixtures, ...withoutFixtures } = fixture;
  void pythonFixtures;
  const h = harness(policy(), withoutFixtures);
  await assert.rejects(h.check('/workspace/candidate', sourceSha, signer));
  assert.deepEqual(h.counts(), { observed: 1, topology: 0 });
});
