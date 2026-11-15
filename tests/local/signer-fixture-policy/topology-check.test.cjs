/* global __dirname, __filename */
// Offline structural probe only. The caller normalization is deliberately mocked;
// these tests do not authenticate source, job execution, signing or deployment.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { createRequire } = require('node:module');
const { Buffer } = require('node:buffer');
const path = require('node:path');
const deps = createRequire(__filename);
const ts = deps('typescript');
const root = path.resolve(__dirname, '../../..');
const topologyPath = path.join(root, 'scripts/release/v2/signerTopology.ts');
const source = readFileSync(topologyPath, 'utf8');
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const mod = { exports: {} };
const safeRequire = (name) => {
  if (name === './callerNormalization') return { normalizedCallerDigest: () => 'synthetic' };
  if (name === 'yaml' || name === 'zod') return deps(name);
  throw Error('Unexpected import');
};
new Function('require', 'module', 'exports', js)(safeRequire, mod, mod.exports);
const { assertSignerTopology } = mod.exports;

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
const signer = 'a'.repeat(40);
const wipChecks = readFileSync(path.join(root, '.github/workflows/release-v2-checks.yml'));
const prChecks = readFileSync(path.join(__dirname, 'release-checks-352.yml'));
const oldNeeds = 'needs: [unit, boundary, browser, public_boundary, performance]';
const newNeeds = 'needs: [unit, boundary, python_fixtures, browser, public_boundary, performance]';

test('actual #352 workflow matches the pinned six-job fixture', () => {
  assert.deepEqual(wipChecks, prChecks);
  assert.doesNotThrow(() => assertSignerTopology(caller, wipChecks, signer));
});
test('accepts exact #352 workflow structurally, with normalization mocked', () => {
  assert.ok(prChecks.toString().includes(newNeeds));
  assert.doesNotThrow(() => assertSignerTopology(caller, prChecks, signer));
});
test('rejects omission of python_fixtures from aggregate even when the job exists', () => {
  const raw = prChecks.toString();
  const changed = raw.replace(newNeeds, oldNeeds);
  assert.notEqual(changed, raw);
  assert.throws(() => assertSignerTopology(caller, Buffer.from(changed), signer), {
    message: 'Qualification artifact producer wiring differs',
  });
});

test('allows reorder of the same six needs but rejects all removals, duplicates and additions', () => {
  const raw = prChecks.toString();
  const reversed =
    'needs: [performance, public_boundary, browser, python_fixtures, boundary, unit]';
  const good = raw.replace(newNeeds, reversed);
  assert.notEqual(good, raw);
  assert.doesNotThrow(() => assertSignerTopology(caller, Buffer.from(good), signer));
  for (const missing of [
    'unit',
    'boundary',
    'python_fixtures',
    'browser',
    'public_boundary',
    'performance',
  ]) {
    const names = [
      'unit',
      'boundary',
      'python_fixtures',
      'browser',
      'public_boundary',
      'performance',
    ].filter((name) => name !== missing);
    const changed = raw.replace(newNeeds, `needs: [${names.join(', ')}]`);
    assert.throws(() => assertSignerTopology(caller, Buffer.from(changed), signer), {
      message: 'Qualification artifact producer wiring differs',
    });
  }
  for (const bad of [
    'needs: [unit, boundary, python_fixtures, browser, public_boundary, python_fixtures]',
    'needs: [unit, boundary, python_fixtures, browser, public_boundary, performance, stranger]',
  ]) {
    assert.throws(
      () => assertSignerTopology(caller, Buffer.from(raw.replace(newNeeds, bad)), signer),
      { message: 'Qualification artifact producer wiring differs' },
    );
  }
});

test('rejects swapped fixture workflow, permissions, inputs and conditional or failure bypass', () => {
  const raw = prChecks.toString();
  const block = `  python_fixtures:\n    uses: ./.github/workflows/python-fixtures.yml\n    permissions:\n      contents: read\n    with:\n      candidate_artifact_id: \${{ inputs.candidate_artifact_id }}\n      metadata_artifact_id: \${{ inputs.metadata_artifact_id }}\n`;
  assert.ok(raw.includes(block));
  const bad = [
    block.replace('python-fixtures.yml', 'local-runtime.yml'),
    block.replace('contents: read', 'contents: write'),
    block.replace('contents: read', 'contents: read\n      actions: read'),
    block.replace('    uses:', '    if: false\n    uses:'),
    block.replace('    uses:', '    continue-on-error: true\n    uses:'),
    block.replace('inputs.candidate_artifact_id', 'inputs.metadata_artifact_id'),
    block.replace('inputs.metadata_artifact_id', 'inputs.candidate_artifact_id'),
    block.replace('      metadata_artifact_id: ${{ inputs.metadata_artifact_id }}\n', ''),
    block.replace('    with:', '    with:\n      extra: injected'),
  ];
  for (const change of bad) {
    assert.notEqual(change, block);
    assert.throws(() =>
      assertSignerTopology(caller, Buffer.from(raw.replace(block, change)), signer),
    );
  }
});

test('rejects qualify step env override and shell substitution', () => {
  const raw = prChecks.toString();
  const line = '      - name: Re-read actual main and deployed parent before admission\n';
  assert.ok(raw.includes(line));
  for (const insertion of [
    "        env: { RELEASE_V2_NEEDS: '{}'}\n",
    '        shell: echo {0}\n',
    '        working-directory: /tmp\n',
  ]) {
    const changed = raw.replace(line, line + insertion);
    assert.notEqual(changed, raw);
    assert.throws(() => assertSignerTopology(caller, Buffer.from(changed), signer), {
      message: 'Qualification artifact producer wiring differs',
    });
  }
});
