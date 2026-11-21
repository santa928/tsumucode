/* global __dirname, __filename */
// Synthetic fault injection only. No GitHub, live tokens, signing or publication.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { readFileSync } = require('node:fs');
const { Buffer } = require('node:buffer');
const { createRequire } = require('node:module');
const { createJiti } = require('jiti');
const deps = createRequire(__filename),
  ts = deps('typescript'),
  { z } = deps('zod');
const root = path.resolve(__dirname, '../../..');
const jiti = createJiti(path.join(root, 'boundary-probe.cjs'), {
  fsCache: false,
  moduleCache: false,
});
const { canonicalJson } = jiti('./src/core/persistence/canonicalJson.ts');
const marker = 'SYNTHETIC_PRIVATE_MARKER_2164';
const source = (file) => readFileSync(path.join(__dirname, file), 'utf8');
const candidateSource = source('candidate-parent.fixture');
const originalSource = source('original-parent.fixture');

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
const blocked = () => {
  throw Error('Unexpected downstream call');
};
const direct = compile(source('original-direct-needs.fixture'), {
  'node:path': path,
  zod: deps('zod'),
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
});
const closedOrigin = compile(source('original-origin.fixture'), {});
const local = () =>
  Object.fromEntries(
    ['baseline', 'preparation', 'execution', 'candidate', 'qualification'].map((key) => [
      key,
      Buffer.from('synthetic'),
    ]),
  );
const ctx = {
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
const manifest = (changes = {}) =>
  Buffer.from(
    canonicalJson({
      context: ctx,
      needs,
      pins,
      predeployActual: { deploymentId: '1' },
      ...changes,
    }),
  );
const result = {
  producer: {},
  snapshotSha256: 'a'.repeat(64),
  candidateArtifactId: '11',
  qualificationSha256: 'b'.repeat(64),
  qualificationAttempt: 1,
  consumerAttempt: 1,
  evidence: Buffer.from('synthetic'),
};

function harness(text, options = {}) {
  let originCalls = 0,
    directCalls = 0,
    postCalls = 0;
  const stages = [];
  const origin =
    options.origin ??
    (async () => {
      originCalls++;
      stages.push('origin');
      return { manifest: manifest(options.manifest), parentTag: Buffer.from('synthetic') };
    });
  const directCandidate =
    options.direct ??
    (async () => {
      directCalls++;
      stages.push('direct');
      return result;
    });
  const post =
    options.post ??
    (async () => {
      postCalls++;
      stages.push('post');
      return { mode: 'synthetic-success' };
    });
  const modules = {
    zod: deps('zod'),
    '../../../src/core/persistence/canonicalJson': { canonicalJson },
    './lineageProtectedOrigin': {
      authenticateFixedWorkflowAndDirectNeeds: origin,
      authenticatePredeployObservation: async () => {
        stages.push('observation');
        return {};
      },
    },
    './lineageDirectNeedsCandidate': {
      corroborateDirectNeedsCandidate: directCandidate,
      matchDirectNeedsPredeployObservation: () => {
        stages.push('match');
      },
      snapshotDirectNeedsObservation: () => {
        stages.push('snapshot');
        return {};
      },
    },
    './lineagePostdeployParent': { corroboratePostdeployParent: post },
  };
  return {
    ...compile(text, modules),
    calls: () => ({ originCalls, directCalls, postCalls, stages }),
  };
}
async function safe(promise) {
  try {
    await promise;
    assert.fail('Expected rejection');
  } catch (error) {
    assert.equal(error.message, 'Protected parent verification failed');
    assert.equal(String(error.stack).includes(marker), false);
    assert.equal('cause' in error, false);
  }
}

test('real unconfigured origin remains closed with no downstream invocation', async () => {
  let calls = 0;
  const h = harness(candidateSource, {
    origin: closedOrigin.authenticateFixedWorkflowAndDirectNeeds,
    direct: () => {
      calls++;
      return result;
    },
  });
  await safe(h.requireAuthenticatedPredeployParent(local(), 'synthetic-token'));
  assert.equal(calls, 0);
});
test('success value and stage order are unchanged under synthetic authenticated-provider stubs', async () => {
  const old = harness(originalSource),
    candidate = harness(candidateSource);
  assert.deepEqual(await old.requireAuthenticatedPredeployParent(local(), 'synthetic-token'), {
    mode: 'synthetic-success',
  });
  assert.deepEqual(
    await candidate.requireAuthenticatedPredeployParent(local(), 'synthetic-token'),
    { mode: 'synthetic-success' },
  );
  assert.deepEqual(candidate.calls(), old.calls());
});
test('strict manifest unknown key throws privately through actual outer entry', async () => {
  const h = harness(candidateSource, { manifest: { [marker]: true } });
  await safe(h.requireAuthenticatedPredeployParent(local(), 'synthetic-token'));
  assert.equal(h.calls().directCalls, 0);
});
for (const which of ['context', 'needs', 'pins']) {
  test(`actual nested ${which} schema error is fixed at outer entry`, async () => {
    const sourceValues = { context: ctx, needs, pins };
    const options = {
      manifest: { [which]: { ...sourceValues[which], [marker]: true } },
      direct: direct.corroborateDirectNeedsCandidate,
    };
    let exposed = false;
    try {
      await harness(originalSource, options).requireAuthenticatedPredeployParent(
        local(),
        'synthetic-token',
      );
    } catch (error) {
      exposed = String(error.message).includes(marker);
    }
    assert.equal(exposed, true);
    const h = harness(candidateSource, options);
    await safe(h.requireAuthenticatedPredeployParent(local(), 'synthetic-token'));
    assert.equal(h.calls().postCalls, 0);
  });
}
for (const which of ['predeployActual', 'signatureContext']) {
  test(`synthetic downstream strict ${which} exception is hidden`, async () => {
    const options = {
      manifest: { [which]: { [marker]: true } },
      post: async (_local, binding) => {
        const value = JSON.parse(binding.toString())[which];
        z.object({}).strict().parse(value);
        return { mode: 'unexpected' };
      },
    };
    let exposed = false;
    try {
      await harness(originalSource, options).requireAuthenticatedPredeployParent(
        local(),
        'synthetic-token',
      );
    } catch (error) {
      exposed = String(error.message).includes(marker);
    }
    assert.equal(exposed, true);
    const h = harness(candidateSource, options);
    await safe(h.requireAuthenticatedPredeployParent(local(), 'synthetic-token'));
  });
}
test('sync hostile getter, non-Error throw and asynchronous rejection are fixed', async () => {
  const throwing = { ...local() };
  Object.defineProperty(throwing, 'baseline', {
    get() {
      throw Error(marker);
    },
  });
  await safe(
    harness(candidateSource).requireAuthenticatedPredeployParent(throwing, 'synthetic-token'),
  );
  await safe(
    harness(candidateSource, {
      origin: () => {
        throw marker;
      },
    }).requireAuthenticatedPredeployParent(local(), 'synthetic-token'),
  );
  const hostile = {
    get message() {
      throw Error(marker);
    },
    get stack() {
      throw Error(marker);
    },
  };
  await safe(
    harness(candidateSource, {
      origin: () => {
        throw hostile;
      },
    }).requireAuthenticatedPredeployParent(local(), 'synthetic-token'),
  );
  await safe(
    harness(candidateSource, {
      post: async () => {
        await Promise.resolve();
        throw Error(marker);
      },
    }).requireAuthenticatedPredeployParent(local(), 'synthetic-token'),
  );
});
test('retains copied local inputs while a synthetic provider is pending', async () => {
  let release, observed;
  const input = local();
  const h = harness(candidateSource, {
    origin: () =>
      new Promise((resolve) => {
        release = resolve;
      }),
    post: async (parts) => {
      observed = parts;
      return { mode: 'synthetic-success' };
    },
  });
  const pending = h.requireAuthenticatedPredeployParent(input, 'synthetic-token');
  for (const value of Object.values(input)) value.fill(0);
  release({ manifest: manifest(), parentTag: Buffer.from('synthetic') });
  assert.deepEqual(await pending, { mode: 'synthetic-success' });
  for (const key of ['baseline', 'preparation', 'execution', 'candidate', 'qualification'])
    assert.equal(observed[key].toString(), 'synthetic');
});
test('shared or oversized local input still rejects before consulting provider', async () => {
  for (const input of [
    new Uint8Array(new SharedArrayBuffer(1)),
    Buffer.alloc(4 * 1024 * 1024 + 1),
  ]) {
    const h = harness(candidateSource);
    await safe(
      h.requireAuthenticatedPredeployParent({ ...local(), baseline: input }, 'synthetic-token'),
    );
    assert.equal(h.calls().originCalls, 0);
  }
});
