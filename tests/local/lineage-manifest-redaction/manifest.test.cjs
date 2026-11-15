/* global __dirname */
// Private synthetic input only; success does not establish provenance or field secrecy.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { Buffer } = require('node:buffer');
const { TextDecoder } = require('node:util');
const { createJiti } = require('jiti');
const { z } = require('zod');
const root = path.resolve(__dirname, '../../..');
const jiti = createJiti(path.join(root, 'manifest-probe.cjs'), {
  fsCache: false,
  moduleCache: false,
});
const { parseProtectedNeedsManifest } = jiti(
  './tests/local/lineage-manifest-redaction/lineageManifestIntake.ts',
);
const { canonicalJson } = jiti('./src/core/persistence/canonicalJson.ts');
const sentinel = 'SYNTHETIC_PRIVATE_MARKER_7329';
const valid = {
  context: { run: '123' },
  needs: { result: 'success' },
  pins: {},
  predeployActual: {},
};
const bytes = (value) => Buffer.from(canonicalJson(value));
const originalShape = z
  .object({
    context: z.unknown(),
    needs: z.unknown(),
    pins: z.unknown(),
    predeployActual: z.unknown(),
    signatureContext: z.unknown().optional(),
  })
  .strict();

function originalAccepts(input) {
  try {
    if (
      !(input instanceof Uint8Array) ||
      input.buffer instanceof SharedArrayBuffer ||
      !input.byteLength ||
      input.byteLength > 65536
    )
      return false;
    const text = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.from(input));
    return canonicalJson(originalShape.parse(JSON.parse(text))) === text;
  } catch {
    return false;
  }
}

function rejectsPrivately(input) {
  try {
    parseProtectedNeedsManifest(input);
    assert.fail('Expected protected manifest rejection');
  } catch (error) {
    assert.equal(error.message, 'Invalid protected needs manifest');
    assert.equal(String(error.stack).includes(sentinel), false);
    assert.equal('cause' in error, false);
  }
}

test('accepts the original strict shape and optional signature context', () => {
  for (const item of [valid, { ...valid, signatureContext: { kind: 'synthetic' } }]) {
    const input = bytes(item);
    assert.equal(originalAccepts(input), true);
    assert.deepEqual(parseProtectedNeedsManifest(input), item);
  }
});
test('preserves the original behavior for missing top-level fields', () => {
  for (const key of ['context', 'needs', 'pins', 'predeployActual']) {
    const item = { ...valid };
    delete item[key];
    const input = bytes(item);
    const original = originalAccepts(input);
    let candidate;
    try {
      parseProtectedNeedsManifest(input);
      candidate = true;
    } catch {
      candidate = false;
    }
    assert.equal(candidate, original);
  }
});
test('preserves the original BOM decoding behavior rather than asserting raw-byte canonicality', () => {
  const input = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), bytes(valid)]);
  assert.equal(originalAccepts(input), true);
  assert.deepEqual(parseProtectedNeedsManifest(input), valid);
});
test('original strict schema can expose an unknown synthetic key in its exception', () => {
  let exposed = false;
  try {
    originalShape.parse({ ...valid, [sentinel]: 'synthetic-value' });
  } catch (error) {
    exposed = String(error.message).includes(sentinel);
  }
  assert.equal(exposed, true);
  rejectsPrivately(bytes({ ...valid, [sentinel]: 'synthetic-value' }));
});
test('rejects malformed, noncanonical and invalid UTF-8 privately', () => {
  const cases = [
    Buffer.from(`{"key":"${sentinel}",bad}`),
    Buffer.from(` ${canonicalJson(valid)}`),
    Buffer.from('{"context":{},"context":{},"needs":{},"pins":{},"predeployActual":{}}'),
    Buffer.from([0xff]),
  ];
  for (const input of cases) {
    assert.equal(originalAccepts(input), false);
    rejectsPrivately(input);
  }
});
test('accepts exactly 64 KiB and rejects a larger canonical manifest', () => {
  const base = { ...valid, context: '' };
  const overhead = bytes(base).byteLength;
  const exact = bytes({ ...base, context: 'x'.repeat(65536 - overhead) });
  const over = bytes({ ...base, context: 'x'.repeat(65537 - overhead) });
  assert.equal(exact.byteLength, 65536);
  assert.equal(over.byteLength, 65537);
  assert.equal(originalAccepts(exact), true);
  assert.equal(typeof parseProtectedNeedsManifest(exact).context, 'string');
  assert.equal(originalAccepts(over), false);
  rejectsPrivately(over);
});
test('rejects empty, non-byte and shared-memory input privately', () => {
  for (const input of [Buffer.alloc(0), null, new Uint8Array(new SharedArrayBuffer(8))]) {
    assert.equal(originalAccepts(input), false);
    rejectsPrivately(input);
  }
});
test('does not claim nested unknown values are secret-free or authenticated', () => {
  const input = bytes({ ...valid, context: { synthetic: sentinel } });
  assert.equal(originalAccepts(input), true);
  assert.equal(parseProtectedNeedsManifest(input).context.synthetic === sentinel, true);
});
