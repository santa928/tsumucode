/* global __dirname, __filename */
// Synthetic schema/field inventory only; other lineage operations are blocked stubs.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Buffer } = require('node:buffer');
const path = require('node:path');
const { readFileSync } = require('node:fs');
const { createRequire } = require('node:module');
const { createJiti } = require('jiti');
const deps = createRequire(__filename);
const ts = deps('typescript');
const root = path.resolve(__dirname, '../../..');
const jiti = createJiti(path.join(root, 'disclosure-probe.cjs'), {
  fsCache: false,
  moduleCache: false,
});
const { canonicalJson } = jiti('./src/core/persistence/canonicalJson.ts');
const source = (name) => readFileSync(path.join(__dirname, name), 'utf8');
function compile(text, modules) {
  const js = ts.transpileModule(text, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', js)(
    (name) => {
      if (!Object.hasOwn(modules, name)) throw Error('Unexpected synthetic import');
      return modules[name];
    },
    mod,
    mod.exports,
  );
  return mod.exports;
}
const blocked = new Proxy(
  {},
  {
    get() {
      throw Error('Unexpected downstream operation');
    },
  },
);
const schema = compile(source('schema.fixture'), { zod: deps('zod') });
const modules = {
  zod: deps('zod'),
  '../../../src/core/persistence/canonicalJson': { canonicalJson },
  './schema': schema,
  './executionPlan': blocked,
  './admission': blocked,
  './parent': blocked,
  './appRecord': blocked,
  './identity': blocked,
};
function auditFor(publicSource) {
  const parser = compile(publicSource, modules);
  return compile(source('disclosure-audit.fixture'), {
    '../../../scripts/release/v2/publicLineage': parser,
  }).inspectDisclosureInventory;
}
const sourceText = source('public-lineage.fixture');
const audit = auditFor(sourceText);
const origin = compile(source('original-origin.fixture'), {});
const bytes = (value) => Buffer.from(canonicalJson(value));
const marker = 'synthetic-private-field-248';
const subject = () => ({
  schemaVersion: 1,
  repository: 'santa928/tsumucode',
  sourceCommit: 'a'.repeat(40),
  runId: '123',
  buildAttempt: 1,
  qualificationAttempt: 1,
  recordAttempt: 1,
  signerAttempt: 1,
  deploymentId: '456',
  recordTagDigest: 'a'.repeat(64),
  candidateDigest: 'b'.repeat(64),
  planDigest: 'c'.repeat(64),
  qualificationDigest: 'd'.repeat(64),
  qualificationRawDigest: 'e'.repeat(64),
  declarationDigest: 'f'.repeat(64),
  anchorTagDigest: '1'.repeat(64),
  parentDeploymentId: '789',
  parentSourceCommit: '2'.repeat(40),
  parentTagDigest: '3'.repeat(64),
  parentProofDigest: '4'.repeat(64),
  parentIdentityDigest: '5'.repeat(64),
  parentLineageDigest: null,
});
test('exact field inventory returns no source values or authorization', () => {
  const input = subject(),
    result = audit(bytes(input));
  assert.equal(result.authorizationGranted, false);
  assert.deepEqual(Object.keys(result.fields).sort(), Object.keys(input).sort());
  assert.equal(JSON.stringify(result).includes(input.sourceCommit), false);
  assert.equal(JSON.stringify(result).includes(input.runId), false);
  assert.ok(Object.isFrozen(result) && Object.isFrozen(result.fields));
});
test('synthetic commit-shaped data is format classified, never authenticated', () => {
  const input = subject(),
    hex = Buffer.from('synthetic-marker-123').toString('hex');
  input.sourceCommit = hex;
  const result = audit(bytes(input));
  assert.equal(result.fields.sourceCommit, 'commit');
  assert.equal(result.authorizationGranted, false);
  assert.equal(JSON.stringify(result).includes(hex), false);
});
test('unknown, malformed and oversize input returns fixed marker-free error', () => {
  for (const input of [
    bytes({ ...subject(), [marker]: marker }),
    Buffer.from('{bad'),
    Buffer.alloc(16385),
  ]) {
    assert.throws(
      () => audit(input),
      (error) => {
        assert.equal(error.message, 'Disclosure inventory rejected');
        assert.equal(error.cause, undefined);
        assert.equal(String(error.stack).includes(marker), false);
        return true;
      },
    );
  }
});
test('expanded parser schema is rejected by the independent field inventory', () => {
  const text = sourceText.replace(
    'schemaVersion: z.literal(1),',
    'schemaVersion: z.literal(1), syntheticExtra: z.string(),',
  );
  assert.notEqual(text, sourceText);
  const driftAudit = auditFor(text);
  assert.throws(
    () => driftAudit(bytes({ ...subject(), syntheticExtra: marker })),
    /Disclosure inventory rejected/,
  );
});
test('actual unconfigured protected providers refuse both calls', async () => {
  await assert.rejects(origin.authenticateFixedWorkflowAndDirectNeeds(), /not configured/);
  await assert.rejects(
    origin.authenticatePredeployObservation({
      manifest: bytes(subject()),
      parentTag: Buffer.from('x'),
    }),
    /not configured/,
  );
});
