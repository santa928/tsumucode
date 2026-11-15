// Synthetic static mutations only; no credentials, network, signature or attestation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import {
  inspectPinnedSubjectSource,
  inspectSubjectExpressions,
} from './subject-field-provenance.mjs';

const original = readFileSync('tests/local/qualification-entry-probe/lineage-draft.fixture');
const source = original.toString('utf8');
test('pinned source has the reviewed field expressions and grants no authority', () => {
  assert.deepEqual(inspectPinnedSubjectSource(original), {
    authorizationGranted: false,
    directFields: 19,
    attemptFields: 3,
  });
});
for (const [name, before, after] of [
  [
    'source replacement',
    'sourceCommit:candidate.recipe.sourceCommit',
    'sourceCommit:candidate.runId',
  ],
  [
    'unknown field',
    'schemaVersion:1, repository:',
    'schemaVersion:1, unreviewed:"synthetic-private-marker", repository:',
  ],
  ['unknown spread', '...attempts, deploymentId:', '...input, deploymentId:'],
  [
    'attempt schema extension',
    'signerAttempt:attempt }).strict()',
    'signerAttempt:attempt, extra:attempt }).strict()',
  ],
  ['attempt source replacement', 'Attempts.parse(input.attempts)', 'Attempts.parse(input)'],
  [
    'parent digest replacement',
    'parentProofDigest:hashValue(proof)',
    'parentProofDigest:hashValue(candidate)',
  ],
])
  test(`${name} rejects even when only the expression checker is exercised`, () => {
    const mutated = source.replace(before, after);
    assert.notEqual(mutated, source);
    assert.throws(
      () => inspectSubjectExpressions(mutated),
      (error) => {
        assert.equal(error.message, 'Subject expression inventory rejected');
        assert.equal(error.cause, undefined);
        assert.equal(String(error.stack).includes('synthetic-private-marker'), false);
        return true;
      },
    );
    assert.throws(
      () => inspectPinnedSubjectSource(Buffer.from(mutated)),
      /Subject source inventory rejected/,
    );
  });
test('missing, oversized and shared source bytes reject', () => {
  for (const input of [
    Buffer.alloc(0),
    Buffer.alloc(16 * 1024 + 1),
    new Uint8Array(new SharedArrayBuffer(1)),
  ])
    assert.throws(() => inspectPinnedSubjectSource(input), /Subject source inventory rejected/);
});

test('expression inventory alone does not prove statements are immutable; full source pin rejects edits', () => {
  const mutated = source.replace(
    '  const draft = toBytes(',
    '  Object.assign(attempts, { unreviewed: 1 });\n  const draft = toBytes(',
  );
  assert.notEqual(mutated, source);
  assert.equal(inspectSubjectExpressions(mutated).authorizationGranted, false);
  assert.throws(
    () => inspectPinnedSubjectSource(Buffer.from(mutated)),
    /Subject source inventory rejected/,
  );
});
