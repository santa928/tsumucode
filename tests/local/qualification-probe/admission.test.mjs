// Synthetic inputs only. This does not authenticate jobs, origin or publication.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { hashValue } from '../../../scripts/release/v2/identity.ts';
import { planRelease } from '../../../scripts/release/v2/plan.ts';
import { createExecutionPlan, TEST_SUITES } from '../../../scripts/release/v2/executionPlan.ts';
import { InventorySchema } from '../../../scripts/release/v2/schema.ts';
import { qualifyRelease } from '../../../scripts/release/v2/admission.ts';

const originalFetch = globalThis.fetch;
globalThis.fetch = async () => {
  throw Error('Unexpected network access');
};
after(() => {
  globalThis.fetch = originalFetch;
});

// Reuse the exact #352 admission-test fixture constructor; do not alter release inputs.
const testSource = readFileSync('tests/unit/release/v2/admission.test.ts', 'utf8');
const start = testSource.indexOf('const baseInventory =');
const end = testSource.indexOf("describe('final same-run admission'", start);
assert.ok(start >= 0 && end > start);
const js = ts.transpileModule(testSource.slice(start, end), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const setup = new Function(
  'InventorySchema',
  'hashValue',
  'planRelease',
  'createExecutionPlan',
  'TEST_SUITES',
  js + '\nreturn setup;',
)(InventorySchema, hashValue, planRelease, createExecutionPlan, TEST_SUITES);

function receipt(input) {
  const row = input.results.find((item) => item.suite === 'native-python-fixtures');
  assert.ok(row);
  return row;
}
test('same fixed #352 fixture qualifies in-memory synthetic evidence', () => {
  const input = setup();
  assert.equal(receipt(input).jobId, 'python_fixtures');
  assert.equal(qualifyRelease(input).status, 'qualified');
});
for (const status of ['failure', 'cancelled', 'skipped']) {
  test(`rejects fixture producer ${status}`, () => {
    const input = setup();
    input.context.jobs.python_fixtures = status;
    assert.throws(() => qualifyRelease(input), /Required native workflow job did not pass/);
  });
}
test('rejects missing fixture job even when all other jobs succeed', () => {
  const input = setup();
  delete input.context.jobs.python_fixtures;
  assert.throws(() => qualifyRelease(input), /Required native workflow job did not pass/);
});
test('rejects missing fixture receipt', () => {
  const input = setup();
  input.results = input.results.filter((r) => r.suite !== 'native-python-fixtures');
  assert.throws(
    () => qualifyRelease(input),
    /Incomplete, duplicate or unexpected release evidence: suites/,
  );
});
test('rejects a duplicated fixture receipt', () => {
  const input = setup();
  input.results.push(globalThis.structuredClone(receipt(input)));
  assert.throws(
    () => qualifyRelease(input),
    /Incomplete, duplicate or unexpected release evidence: suites/,
  );
});
for (const [label, mutate] of [
  [
    'producer',
    (r) => {
      r.jobId = 'boundary';
    },
  ],
  [
    'run',
    (r) => {
      r.runId = '102';
    },
  ],
  [
    'future attempt',
    (r) => {
      r.verificationAttempt = 2;
    },
  ],
  [
    'candidate digest',
    (r) => {
      r.candidateDigest = '0'.repeat(64);
    },
  ],
  [
    'recipe digest',
    (r) => {
      r.recipeDigest = '0'.repeat(64);
    },
  ],
  [
    'input digest',
    (r) => {
      r.inputDigest = '0'.repeat(64);
    },
  ],
]) {
  test(`rejects fixture receipt with mismatched ${label}`, () => {
    const input = setup();
    mutate(receipt(input));
    assert.throws(() => qualifyRelease(input), /Failed, pending or mismatched evidence/);
  });
}
test('rejects a fixture receipt whose targets do not match the execution plan', () => {
  const input = setup();
  receipt(input).targets = ['synthetic-wrong-target'];
  assert.throws(
    () => qualifyRelease(input),
    /Incomplete, duplicate or unexpected release evidence: native-python-fixtures\/targets/,
  );
});
test('preserves the existing same-run earlier-attempt rule after a rerun', () => {
  const input = setup();
  input.context.attempt = 2;
  assert.equal(qualifyRelease(input).status, 'qualified');
});
test('rejects fixture verification older than the candidate build', () => {
  const input = setup();
  input.context.attempt = 2;
  input.candidate.buildAttempt = 2;
  for (const row of input.results) {
    row.candidateDigest = hashValue(input.candidate);
    row.verificationAttempt = 2;
  }
  receipt(input).verificationAttempt = 1;
  assert.throws(
    () => qualifyRelease(input),
    /Failed, pending or mismatched evidence: native-python-fixtures/,
  );
});
test('rejects a fresh-main mismatch', () => {
  const input = setup();
  input.context.currentMainCommit = '0'.repeat(40);
  assert.throws(() => qualifyRelease(input), /Stale source, recipe or producer/);
});
test('rejects a changed deployed parent', () => {
  const input = setup();
  const proof = { ...input.currentBaseline.proof, deploymentId: '502' };
  input.currentBaseline = {
    ...input.currentBaseline,
    proof,
    baseline: {
      ...input.currentBaseline.baseline,
      deploymentId: '502',
      sourceRecordDigest: hashValue(proof),
    },
  };
  assert.throws(() => qualifyRelease(input), /Actual published parent changed/);
});
