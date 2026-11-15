// Synthetic files and provider stubs only: never calls GitHub or authenticates a run.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile, readdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import ts from 'typescript';
import { z } from 'zod';
import { hashArtifact, hashValue } from '../../../scripts/release/v2/identity.ts';
import { planRelease } from '../../../scripts/release/v2/plan.ts';
import { createExecutionPlan, TEST_SUITES } from '../../../scripts/release/v2/executionPlan.ts';
import { InventorySchema } from '../../../scripts/release/v2/schema.ts';
import { qualifyRelease } from '../../../scripts/release/v2/admission.ts';
import { selectResultAttempts } from '../../../scripts/release/v2/attempts.ts';
import { verifyStoredReports } from '../../../scripts/release/v2/reports.ts';
import { verifyCandidateArtifact } from '../../../scripts/release/v2/verify.ts';

const originalFetch = globalThis.fetch;
globalThis.fetch = async () => {
  throw Error('Unexpected network access');
};
after(() => {
  globalThis.fetch = originalFetch;
});
const source = readFileSync('tests/unit/release/v2/admission.test.ts', 'utf8');
const start = source.indexOf('const baseInventory =');
const end = source.indexOf("describe('final same-run admission'", start);
assert.ok(start >= 0 && end > start);
const fixtureJs = ts.transpileModule(source.slice(start, end), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const setup = new Function(
  'InventorySchema',
  'hashValue',
  'planRelease',
  'createExecutionPlan',
  'TEST_SUITES',
  fixtureJs + '\nreturn setup;',
)(InventorySchema, hashValue, planRelease, createExecutionPlan, TEST_SUITES);
const entryJs = ts.transpileModule(readFileSync('scripts/release/v2/qualify.ts', 'utf8'), {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS,
    esModuleInterop: true,
  },
}).outputText;

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'qualification-entry-probe-'));
  await mkdir(path.join(root, 'dist'), { recursive: true });
  await mkdir(path.join(root, '.release-v2/receipts'), { recursive: true });
  await mkdir(path.join(root, '.release-v2/reports'), { recursive: true });
  await writeFile(path.join(root, 'dist/index.html'), 'synthetic candidate\n');
  const input = setup();
  input.candidate.artifactDigest = (await hashArtifact(path.join(root, 'dist'))).digest;
  const now = Date.now();
  for (const row of input.results) {
    row.candidateDigest = hashValue(input.candidate);
    row.startedAt = new Date(now - 30000).toISOString();
    row.finishedAt = new Date(now - 10000).toISOString();
    row.expiresAt = new Date(now + 3600000).toISOString();
    const report = { synthetic: true, suite: row.suite, attempt: row.verificationAttempt };
    row.reportDigest = hashValue(report);
    await writeFile(
      path.join(root, '.release-v2/reports', `${row.suite}-${row.verificationAttempt}.json`),
      JSON.stringify(report),
    );
    await writeFile(
      path.join(root, '.release-v2/receipts', `${row.suite}.json`),
      JSON.stringify(row),
    );
  }
  const jobs = Object.fromEntries(
    Object.entries(input.context.jobs)
      .filter(([name]) => name !== 'build')
      .map(([name, result]) => [name, { result }]),
  );
  const env = {
    GITHUB_REPOSITORY: input.candidate.repository,
    GITHUB_RUN_ID: input.candidate.runId,
    GITHUB_SHA: input.candidate.recipe.sourceCommit,
    GITHUB_JOB: 'aggregate',
    GITHUB_EVENT_NAME: 'workflow_dispatch',
    GITHUB_REF: 'refs/heads/main',
    GITHUB_RUN_ATTEMPT: '1',
    RELEASE_V2_NEEDS: JSON.stringify(jobs),
  };
  return { root, input, jobs, env };
}
function entry(
  f,
  { currentMain = f.input.context.currentMainCommit, parent = f.input.currentBaseline } = {},
) {
  function fakeExec() {
    throw Error('Unexpected exec invocation');
  }
  fakeExec[promisify.custom] = async () => ({ stdout: `${currentMain}\trefs/heads/main\n` });
  const modules = {
    'node:child_process': { execFile: fakeExec },
    'node:util': { promisify },
    'node:fs/promises': { readdir },
    'node:path': path,
    zod: { z },
    './captureBaseline': { captureBaseline: async () => parent },
    './admission': { qualifyRelease },
    './candidate': { readRecipe: async () => f.input.context.recipe },
    './runner': {
      loadExecutionBundle: async () => ({
        snapshot: {
          inventory: f.input.inventory,
          plan: f.input.plan,
          publicContent: f.input.publicContent,
        },
        executionPlan: f.input.executionPlan,
        candidate: f.input.candidate,
        capturedBaseline: f.input.capturedBaseline,
      }),
      readJson: async (file) => JSON.parse(await readFile(file, 'utf8')),
    },
    './attempts': { selectResultAttempts },
    './identity': { repositoryEnvironment: async () => ({}), hashValue },
    './reports': { verifyStoredReports },
    './contentOriginals': {
      readVerifiedContentPolicy: async () => ({ receipts: [], withdrawals: [] }),
    },
    './verify': { verifyCandidateArtifact },
    './pythonHistoricalAcceptance': { readVerifiedPythonHistoricalAcceptances: async () => [] },
    './tailwindHistoricalAcceptance': { readVerifiedTailwindHistoricalAcceptance: async () => [] },
  };
  const module = { exports: {} };
  new Function('require', 'module', 'exports', entryJs)(
    (name) => {
      if (!Object.hasOwn(modules, name)) throw Error('Unexpected probe import');
      return modules[name];
    },
    module,
    module.exports,
  );
  return module.exports.qualifyCurrentRelease;
}
async function withFixture(fn) {
  const f = await fixture();
  try {
    await fn(f);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
}

test('matching synthetic claims qualify, demonstrating the provider-origin boundary', async () => {
  await withFixture(async (f) => {
    const result = await entry(f)(f.root, f.env);
    assert.equal(result.status, 'qualified');
  });
});

test('existing entry accepts additional synthetic needs fields, so source still requires authentication', async () => {
  await withFixture(async (f) => {
    f.jobs.synthetic_unknown = { result: 'success' };
    f.jobs.unit.synthetic_unknown = 'synthetic';
    const result = await entry(f)(f.root, {
      ...f.env,
      RELEASE_V2_NEEDS: JSON.stringify(f.jobs),
    });
    assert.equal(result.status, 'qualified');
  });
});
for (const state of ['failure', 'cancelled', 'skipped'])
  test(`fixture ${state} rejects`, async () => {
    await withFixture(async (f) => {
      f.jobs.python_fixtures.result = state;
      await assert.rejects(
        entry(f)(f.root, { ...f.env, RELEASE_V2_NEEDS: JSON.stringify(f.jobs) }),
        /Required native workflow job did not pass/,
      );
    });
  });
test('missing fixture needs rejects', async () => {
  await withFixture(async (f) => {
    delete f.jobs.python_fixtures;
    await assert.rejects(
      entry(f)(f.root, { ...f.env, RELEASE_V2_NEEDS: JSON.stringify(f.jobs) }),
      /Required native workflow job did not pass/,
    );
  });
});
test('missing or altered fixture report rejects', async () => {
  await withFixture(async (f) => {
    const file = path.join(f.root, '.release-v2/reports/native-python-fixtures-1.json');
    await rm(file);
    await assert.rejects(entry(f)(f.root, f.env), { code: 'ENOENT' });
    await writeFile(file, JSON.stringify({ synthetic: 'altered' }));
    await assert.rejects(
      entry(f)(f.root, f.env),
      /Original suite report missing or changed: native-python-fixtures/,
    );
  });
});
test('changed synthetic main or captured parent rejects', async () => {
  await withFixture(async (f) => {
    await assert.rejects(
      entry(f, { currentMain: 'f'.repeat(40) })(f.root, f.env),
      /Stale source, recipe or producer/,
    );
    const parent = globalThis.structuredClone(f.input.currentBaseline);
    parent.proof.deploymentId = '999';
    parent.baseline.deploymentId = '999';
    parent.baseline.sourceRecordDigest = hashValue(parent.proof);
    await assert.rejects(entry(f, { parent })(f.root, f.env), /Actual published parent changed/);
  });
});

test('missing fixture receipt rejects independently of successful declared job', async () => {
  await withFixture(async (f) => {
    await rm(path.join(f.root, '.release-v2/receipts/native-python-fixtures.json'));
    await assert.rejects(
      entry(f)(f.root, f.env),
      /Incomplete, duplicate or unexpected release evidence: suites/,
    );
  });
});
