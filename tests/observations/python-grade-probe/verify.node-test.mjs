import { test } from 'node:test';
import assert from 'node:assert/strict';
import process from 'node:process';
import { URL } from 'node:url';
import { classify } from './verify.mjs';
const hash = 'a'.repeat(64),
  other = 'b'.repeat(64);
const summary = { records: 1, capacity: 'unknown' };
const row = { version: 1, runHash: hash, at: 5, case: 1, phase: 'analysis', stage: 'wait' };
const packet = (s, rows) =>
  [
    'Python grade CI summary ' + JSON.stringify(s),
    ...rows.map((r) => 'Python grade CI stage ' + JSON.stringify(r)),
  ].join('\n');
test('a same-run fixed stage proves a diagnostic sample without publishing identity', () => {
  const result = classify(hash, packet(summary, [row]));
  assert.deepEqual(result, {
    status: 'observed',
    capacity: 'unknown',
    samples: [{ at: 5, case: 1, phase: 'analysis', stage: 'wait' }],
  });
  assert.doesNotMatch(JSON.stringify(result), /aaaaaaaa|PRIVATE/u);
});
test('no same-run record, including a sub-five-second grade, remains unknown', () => {
  assert.equal(classify(hash, packet({ records: 0, capacity: 'unknown' }, [])).status, 'unknown');
  assert.equal(classify(hash, '').status, 'unknown');
  assert.equal(classify(hash, packet(summary, [{ ...row, runHash: other }])).status, 'unknown');
});
test('malformed, mismatched, duplicated, oversized or secret-bearing reports are rejected', () => {
  for (const report of [
    'x'.repeat(65537),
    packet({ records: 2, capacity: 'unknown' }, [row]),
    packet(summary, [{ ...row, stage: 'PRIVATE' }]),
    packet(summary, [{ ...row, secret: 'PRIVATE' }]),
    packet({ records: 2, capacity: 'unknown' }, [row, row]),
    packet({ records: 1, capacity: 'PRIVATE' }, [row]),
  ])
    assert.equal(classify(hash, report).status, 'invalid');
  assert.equal(classify('private', packet(summary, [row])).status, 'invalid');
});

test('CLI keeps identity and private fields out of fixed-status output; unknown is not success', async () => {
  const { mkdtempSync, writeFileSync, symlinkSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { spawnSync } = await import('node:child_process');
  const { fileURLToPath } = await import('node:url');
  const dir = mkdtempSync(join(tmpdir(), 'grade-probe-cli-'));
  try {
    const cli = fileURLToPath(new URL('./verify.mjs', import.meta.url));
    const identity = join(dir, 'identity.json'),
      report = join(dir, 'report.txt');
    writeFileSync(identity, JSON.stringify({ runHash: hash }));
    writeFileSync(report, packet(summary, [row]));
    const invoke = () => spawnSync(process.execPath, [cli, identity, report], { encoding: 'utf8' });
    let result = invoke();
    assert.equal(result.status, 0);
    assert.match(result.stdout, /"status":"observed"/u);
    assert.doesNotMatch(result.stdout, /aaaaaaaa|PRIVATE/u);
    writeFileSync(report, '');
    result = invoke();
    assert.equal(result.status, 2);
    assert.match(result.stdout, /"status":"unknown"/u);
    writeFileSync(report, packet(summary, [{ ...row, secret: 'PRIVATE' }]));
    result = invoke();
    assert.equal(result.status, 2);
    assert.doesNotMatch(result.stdout, /PRIVATE|aaaaaaaa/u);
    rmSync(identity);
    result = invoke();
    assert.equal(result.status, 2);
    assert.match(result.stdout, /"status":"unknown"/u);
    symlinkSync('/etc/hosts', identity);
    result = invoke();
    assert.equal(result.status, 2);
    assert.doesNotMatch(result.stdout, /localhost/u);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
