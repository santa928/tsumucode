/* global __dirname, __filename */
// Synthetic inputs only: archive equality does not establish protected producer provenance.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const { createRequire } = require('node:module');
const { createJiti } = require('jiti');
const deps = createRequire(__filename), ts = deps('typescript');
const { zipSync, strToU8 } = deps('fflate');
const root = path.resolve(__dirname, '../../..');
const jiti = createJiti(path.join(root, 'predeploy-probe.cjs'), { fsCache: false, moduleCache: false });
const schema = jiti('./scripts/release/v2/schema.ts');
const identity = jiti('./scripts/release/v2/identity.ts');
const sourceFile = (name) => fs.readFileSync(path.join(__dirname, name + '.fixture'), 'utf8');
function compile(name, modules) {
  const js = ts.transpileModule(sourceFile(name), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', js)((name) => {
    if (!Object.hasOwn(modules, name)) throw Error('Unexpected synthetic import');
    return modules[name];
  }, mod, mod.exports);
  return mod.exports;
}
const bounded = compile('boundedFile', { 'node:fs': deps('node:fs'), 'node:fs/promises': fsp });
const zip = compile('lineageZip', { yauzl: deps('yauzl'), 'node:zlib': deps('node:zlib'),
  './identity': identity, './boundedFile': bounded });
const artifacts = compile('lineageArtifacts', { 'node:fs/promises': fsp, 'node:path': path,
  zod: deps('zod'), './schema': schema, './identity': identity, './boundedFile': bounded });
const predeploy = compile('lineagePredeployZip', { './lineageArtifacts': artifacts,
  './schema': schema, './identity': identity, './lineageZip': zip });
const origin = compile('lineageProtectedOrigin', {});
const source = 'a'.repeat(40), digest = 'b'.repeat(64);
const candidate = JSON.stringify({ schemaVersion: 1, repository: 'santa928/tsumucode', runId: '123',
  buildJobId: 'build', buildAttempt: 2, artifactDigest: digest, artifactId: '456', planDigest: digest,
  recipe: { sourceCommit: source, sourceTree: source, lockDigest: digest, workflowDigest: digest,
    policyDigest: digest, toolchain: 'synthetic', basePath: '/' } });
const qualification = '{"synthetic":"qualification"}';
const metadata = Object.fromEntries(artifacts.metadataNames('2').map((name) => [name, strToU8(
  name === 'candidate.json' ? candidate : name === 'baseline.json' ? '{"synthetic":"baseline"}\n' : '{}',
)]));
const qualificationFiles = { 'qualification.json': strToU8(qualification) };
const claims = { repository: 'santa928/tsumucode', runId: '123', sourceCommit: source,
  candidateArtifactId: '456', buildAttempt: 2, qualificationSha256: identity.hashBytes(qualification) };
async function fixture(t, meta = metadata) {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'predeploy-probe-'));
  t.after(() => fsp.rm(dir, { recursive: true, force: true }));
  const metadataZip = Buffer.from(zipSync(meta)), qualificationZip = Buffer.from(zipSync(qualificationFiles));
  const metaPath = path.join(dir, 'metadata.zip'), qualPath = path.join(dir, 'qualification.zip');
  await fsp.writeFile(metaPath, metadataZip);
  await fsp.writeFile(qualPath, qualificationZip);
  return { dir, metaPath, qualPath, expected: { ...claims, metadataArchiveSha256: identity.hashBytes(metadataZip),
    qualificationArchiveSha256: identity.hashBytes(qualificationZip) } };
}
test('protected origin remains closed', async () => {
  await assert.rejects(origin.authenticateFixedWorkflowAndDirectNeeds(), /Authenticated pre-deploy parent is not configured/);
});
test('both synthetic readers agree and return defensive copies', async (t) => {
  const a = await fixture(t), zips = await predeploy.inspectPredeployZips(a.metaPath, a.qualPath, a.expected);
  const stage = path.join(a.dir, 'stage');
  for (const [group, entries] of [['metadata', metadata], ['qualification', qualificationFiles]]) {
    for (const [name, bytes] of Object.entries(entries)) {
      const dest = path.join(stage, group, name);
      await fsp.mkdir(path.dirname(dest), { recursive: true });
      await fsp.writeFile(dest, bytes);
    }
  }
  const files = await artifacts.inspectPredeployArtifacts(stage, claims);
  assert.deepEqual(zips.getFile('baseline.json'), files.getFile('baseline.json'));
  zips.getFile('baseline.json').fill(0);
  assert.deepEqual(zips.getFile('baseline.json'), files.getFile('baseline.json'));
});
for (const [name, changed] of [
  ['run', { runId: '999' }], ['source', { sourceCommit: 'c'.repeat(40) }],
  ['attempt', { buildAttempt: 3 }], ['artifact', { candidateArtifactId: '999' }],
  ['metadata digest', { metadataArchiveSha256: 'f'.repeat(64) }],
  ['qualification archive digest', { qualificationArchiveSha256: 'f'.repeat(64) }],
  ['qualification raw digest', { qualificationSha256: 'f'.repeat(64) }],
]) test('rejects mismatched ' + name, async (t) => {
  const a = await fixture(t);
  await assert.rejects(predeploy.inspectPredeployZips(a.metaPath, a.qualPath, { ...a.expected, ...changed }));
});
test('rejects a missing baseline', async (t) => {
  const { 'baseline.json': missing, ...rest } = metadata; void missing;
  const a = await fixture(t, rest);
  await assert.rejects(predeploy.inspectPredeployZips(a.metaPath, a.qualPath, a.expected));
});
test('rejects colliding case-normalized paths', async (t) => {
  const a = await fixture(t, { ...metadata, 'BASELINE.json': strToU8('{}') });
  await assert.rejects(predeploy.inspectPredeployZips(a.metaPath, a.qualPath, a.expected));
});
test('rejects baseline over the existing per-file limit', async (t) => {
  const a = await fixture(t, { ...metadata, 'baseline.json': new Uint8Array(4 * 1024 * 1024 + 1) });
  await assert.rejects(predeploy.inspectPredeployZips(a.metaPath, a.qualPath, a.expected));
});
test('self-repinning modified baseline does not authenticate origin', async (t) => {
  const a = await fixture(t, { ...metadata, 'baseline.json': strToU8('{"synthetic":"modified"}') });
  const result = await predeploy.inspectPredeployZips(a.metaPath, a.qualPath, a.expected);
  assert.equal(result.getFile('baseline.json').toString(), '{"synthetic":"modified"}');
  await assert.rejects(origin.authenticateFixedWorkflowAndDirectNeeds(), /Authenticated pre-deploy parent is not configured/);
});
