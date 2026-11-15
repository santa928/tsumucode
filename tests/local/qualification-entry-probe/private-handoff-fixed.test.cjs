/* global __dirname, __filename */
// Synthetic WIP handoff and observer. The actual network-verifier dependencies are blocked.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const { Buffer } = require('node:buffer');
const process = require('node:process');
const { performance } = require('node:perf_hooks');
const { setImmediate: nextTurn } = require('node:timers/promises');
const { runInNewContext } = require('node:vm');
const { createRequire } = require('node:module');
const { createJiti } = require('jiti');
const deps = createRequire(__filename),
  ts = deps('typescript');
const root = path.resolve(__dirname, '../../..');
const jiti = createJiti(path.join(root, 'private-handoff-probe.cjs'), {
  fsCache: false,
  moduleCache: false,
});
const { canonicalJson } = jiti('./src/core/persistence/canonicalJson.ts');
const identity = jiti('./scripts/release/v2/identity.ts');
const parent = jiti('./scripts/release/v2/parent.ts');
const schema = jiti('./scripts/release/v2/schema.ts');
const { writeProtocolJson } = jiti('./scripts/release/v2/json.ts');
const source = (name) => fs.readFileSync(path.join(__dirname, name), 'utf8');
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
const common = {
  zod: deps('zod'),
  '../../../src/core/persistence/canonicalJson': { canonicalJson },
  './identity': identity,
  './parent': parent,
  './schema': schema,
};
const evidence = compile(source('lineage-run-evidence.fixture'), common);
const policy = compile(source('lineage-parent-policy.fixture'), {});
let anchorResult;
const blocked = () => {
  throw Error('Unexpected non-synthetic provider');
};
const observer = compile(source('protected-needs-observation.fixture'), {
  ...common,
  './lineageAnchorSnapshot': {
    captureAnchorParent: async () => {
      if (!anchorResult) throw Error('No synthetic observation');
      return anchorResult;
    },
  },
  './lineageSuccessorSnapshot': { captureSuccessorParent: blocked },
  './lineageRunEvidence': evidence,
});
const handoff = compile(source('private-predeploy-handoff.fixture'), {
  ...common,
  'node:path': path,
  'node:util': deps('node:util'),
  yaml: deps('yaml'),
  './lineageParentBindingPolicy': policy,
  './lineageRunEvidence': evidence,
  './lineageProtectedNeedsObservation': observer,
});
const bytes = (value) => Buffer.from(canonicalJson(value));
function fixture(count = 1) {
  const lesson = {
    id: 'lesson',
    kind: 'standard',
    learnerDigest: 'a'.repeat(64),
    exerciseDigest: 'b'.repeat(64),
    navigationDigest: 'c'.repeat(64),
    persistenceDigest: 'd'.repeat(64),
    exercises: [],
  };
  const inventory = {
    schemaVersion: 1,
    fingerprintVersion: 1,
    courses: [
      {
        id: 'topic',
        revision: '1',
        publicationStatus: 'published',
        runner: 'html-css',
        lessons: Array(count).fill(lesson),
      },
    ],
  };
  const proof = {
    schemaVersion: 1,
    repository: 'santa928/tsumucode',
    deploymentId: '7699435659',
    sourceCommit: 'b9306eb3414e69a2068603cfdbf2706ebe4e9284',
    workflowHeadCommit: 'b9306eb3414e69a2068603cfdbf2706ebe4e9284',
    tagDigest: '005611a22025a12d925bda0fdfb47c96266cf0d3a57aef984f358528a74ead3b',
    runId: '500',
    tag: 'refs/tags/tsumucode-release-1',
    artifactDigest: 'b'.repeat(64),
    artifactDigestFormat: 'legacy-canonical-dist',
    projection: 'authoring',
    inventoryDigest: identity.hashValue(inventory),
    publicContentDigest: 'c'.repeat(64),
    publicFiles: 1,
    observedAt: '2026-10-28T10:00:00Z',
  };
  const captured = {
    proof,
    baseline: {
      inventory,
      deploymentId: proof.deploymentId,
      sourceCommit: proof.sourceCommit,
      artifactDigest: proof.artifactDigest,
      sourceRecordDigest: identity.hashValue(proof),
    },
  };
  const context = {
    repository: 'santa928/tsumucode',
    runId: '123',
    attempt: 1,
    source: 'a'.repeat(40),
    producerJobId: '456',
    producerJobName: 'parent / verify',
    mode: 'anchor',
  };
  const value = {
    schemaVersion: 1,
    repository: context.repository,
    runId: context.runId,
    attempt: context.attempt,
    source: context.source,
    producerJobId: context.producerJobId,
    verifierCommit: policy.LINEAGE_PARENT_BINDING_POLICY.anchorVerifierCommit,
    mode: 'anchor',
    movementDeclarationDigest: '4ce18d583429e685ee951def56982bb5c5b292b7e4ad78e162d5ebd2703da494',
    parentIdentityDigest: identity.hashValue({ ...proof, observedAt: null }),
    parentTagDigest: proof.tagDigest,
    parentDeploymentId: proof.deploymentId,
    parentSource: proof.sourceCommit,
  };
  const evidenceBytes = bytes(value),
    needs = {
      result: 'success',
      evidenceBase64: evidenceBytes.toString('base64'),
      evidenceSha256: identity.hashBytes(evidenceBytes),
    };
  const snapshot = bytes({ schemaVersion: 1, evidence: value, proof });
  anchorResult = { snapshot, sha256: identity.hashBytes(snapshot) };
  return { captured, context, needs, snapshot };
}
const call = (f, captured) =>
  handoff.prepareProtectedPredeployHandoff(
    '/synthetic',
    bytes(f.context),
    bytes(f.needs),
    'synthetic-only',
    captured,
  );
test('actual protocol writer pretty JSON is accepted without authorizing or exposing private fields', async () => {
  const f = fixture(),
    dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'handoff-format-'));
  try {
    const file = path.join(dir, 'baseline.json');
    await writeProtocolJson(file, f.captured);
    const raw = await fsp.readFile(file),
      result = await call(f, raw);
    assert.deepEqual(result.privateSnapshot, f.snapshot);
    assert.equal(result.authorizationGranted, false);
    assert.equal(JSON.stringify(result), '{"authorizationGranted":false}');
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
});
test('literal and escaped duplicate captured keys reject', async () => {
  const f = fixture(),
    raw = canonicalJson(f.captured),
    key = '"deploymentId":"7699435659"';
  assert.ok(raw.includes(key));
  for (const other of [key, '"deplo\\u0079mentId":"7699435659"'])
    await assert.rejects(
      call(f, Buffer.from(raw.replace(key, `${key},${other}`))),
      /Protected predeploy handoff rejected/,
    );
});
test('foreign shared buffers reject while ordinary foreign bytes remain valid', async () => {
  const f = fixture(),
    raw = bytes(f.captured);
  const shared = runInNewContext('new Uint8Array(new SharedArrayBuffer(size))', {
    size: raw.length,
  });
  shared.set(raw);
  await assert.rejects(call(f, shared), /Protected predeploy handoff rejected/);
  const ordinary = runInNewContext('new Uint8Array(new ArrayBuffer(size))', { size: raw.length });
  ordinary.set(raw);
  assert.equal((await call(f, ordinary)).authorizationGranted, false);
});
test('accessor-bearing input is rejected without executing it', async () => {
  const f = fixture(),
    captured = bytes(f.captured),
    original = Buffer.from(captured);
  let invoked = false;
  const hostile = {
    get runId() {
      invoked = true;
      captured.fill(0);
      return '123';
    },
  };
  await assert.rejects(
    handoff.prepareProtectedPredeployHandoff(
      '/synthetic',
      hostile,
      bytes(f.needs),
      'synthetic-only',
      captured,
    ),
    /Protected predeploy handoff rejected/,
  );
  assert.equal(invoked, false);
  assert.deepEqual(captured, original);
});
test('snapshots all byte inputs before a delayed synthetic observation', async () => {
  const f = fixture(),
    context = bytes(f.context),
    needs = bytes(f.needs),
    captured = bytes(f.captured);
  let release;
  anchorResult = new Promise((resolve) => {
    release = resolve;
  });
  const pending = handoff.prepareProtectedPredeployHandoff(
    '/synthetic',
    context,
    needs,
    'synthetic-only',
    captured,
  );
  await nextTurn();
  context.fill(0);
  needs.fill(0);
  captured.fill(0);
  release({ snapshot: f.snapshot, sha256: identity.hashBytes(f.snapshot) });
  assert.deepEqual((await pending).privateSnapshot, f.snapshot);
});
test('captured data beyond the existing four MiB limit rejects', async () => {
  const f = fixture();
  await assert.rejects(
    call(f, Buffer.alloc(4 * 1024 * 1024 + 1)),
    /Protected predeploy handoff rejected/,
  );
});
test('synthetic producer-format baseline near 4 MiB stays within the fixed process budget', async (t) => {
  const f = fixture(7400),
    dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'handoff-budget-'));
  try {
    const file = path.join(dir, 'baseline.json');
    await writeProtocolJson(file, f.captured);
    const raw = await fsp.readFile(file);
    assert.ok(raw.length > 3.4 * 1024 * 1024 && raw.length <= 4 * 1024 * 1024);
    const start = performance.now(),
      result = await call(f, raw);
    assert.equal(result.authorizationGranted, false);
    t.diagnostic(
      `synthetic_bytes=${raw.length} elapsed_ms=${Math.round(performance.now() - start)} heap_used_mib=${Math.round(process.memoryUsage().heapUsed / 1048576)}`,
    );
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
});
