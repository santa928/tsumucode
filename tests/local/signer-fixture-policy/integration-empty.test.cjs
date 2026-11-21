/* global __dirname */
// Real local modules, synthetic inputs. No network, Git operation, token or signing.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { Buffer } = require('node:buffer');
const { createJiti } = require('jiti');
const root = path.resolve(__dirname, '../../..');
const jiti = createJiti(path.join(root, 'local-synthetic-probe.cjs'), {
  moduleCache: false,
  fsCache: false,
});
const { assertReviewedCaller } = jiti('./scripts/release/v2/lineageCallerPolicy.ts');
const { assertSignerTopology } = jiti('./scripts/release/v2/signerTopology.ts');
const { TRUSTED_CALLER_POLICY } = jiti('./scripts/release/v2/trustedLineagePolicy.ts');

test('actual empty policy rejects before a nonexistent source checkout can be inspected', async () => {
  assert.equal(TRUSTED_CALLER_POLICY.pythonFixturesWorkflowDigests.length, 0);
  await assert.rejects(
    assertReviewedCaller('/a-synthetic-nonexistent-path/candidate', '1'.repeat(40), '2'.repeat(40)),
    /Approved caller policy is not configured/,
  );
});

test('actual normalization and topology modules reject step environment override', () => {
  const testSource = readFileSync(path.join(__dirname, 'original-wip.test.fixture'), 'utf8');
  const begin = 'const caller = Buffer.from(`';
  const start = testSource.indexOf(begin);
  const end = testSource.indexOf('`);', start + begin.length);
  assert.ok(start >= 0 && end > start);
  const caller = Buffer.from(
    testSource
      .slice(start + begin.length, end)
      .replaceAll('\\${{', '${{')
      .replace('${signer}', 'a'.repeat(40)),
  );
  const checks = readFileSync(path.join(__dirname, 'release-checks-352.yml'), 'utf8');
  assert.doesNotThrow(() => assertSignerTopology(caller, Buffer.from(checks), 'a'.repeat(40)));
  const line = '      - name: Re-read actual main and deployed parent before admission\n';
  const changed = checks.replace(line, line + "        env: { RELEASE_V2_NEEDS: '{}'}\n");
  assert.notEqual(changed, checks);
  assert.throws(() => assertSignerTopology(caller, Buffer.from(changed), 'a'.repeat(40)), {
    message: 'Qualification artifact producer wiring differs',
  });
});
