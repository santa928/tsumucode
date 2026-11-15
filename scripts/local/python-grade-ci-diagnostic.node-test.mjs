import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { Buffer } from 'node:buffer';
import { URL } from 'node:url';
import {
  createPythonGradeCiObserver,
  readPythonGradeCiRecords,
  readPythonGradeCiCapacity,
} from './python-grade-ci-diagnostic.mjs';

const id = '123e4567-e89b-42d3-a456-426614174000:7';
const hash = createHash('sha256').update(id).digest('hex');
const enabled = {
  enabled: true,
  owner: 'tsumucode-learning-ci',
  exerciseId: 'python-basics-ch01-l02-e01',
  runId: id,
};

test('only opt-in exact owner, exercise and random run identity enable the observer', () => {
  for (const bad of [
    { ...enabled, enabled: false },
    { ...enabled, owner: 'other' },
    { ...enabled, exerciseId: 'other' },
    { ...enabled, runId: 'private input' },
  ]) {
    assert.equal(createPythonGradeCiObserver(bad), null);
  }
});

test('stage snapshots are fixed, bounded, run-linked, and cannot contain untrusted input', () => {
  const timers = [];
  const records = [];
  const observer = createPythonGradeCiObserver({
    ...enabled,
    schedule: (fn, ms) => {
      timers.push({ fn, ms });
      return { unref() {} };
    },
    cancel: () => {},
    write: (name, body) => records.push({ name, body }),
  });
  assert.deepEqual(
    timers.map((x) => x.ms),
    [5000, 15000, 25000],
  );
  observer.mark(2, 'execution', 'wait');
  timers[0].fn();
  assert.deepEqual(records[0], {
    name: `${hash}-5.json`,
    body: { version: 1, runHash: hash, at: 5, case: 2, phase: 'execution', stage: 'wait' },
  });
  observer.mark(999, 'PRIVATE_INPUT', 'PRIVATE_SECRET');
  timers[1].fn();
  assert.equal(records[1].body.case, 0);
  assert.equal(records[1].body.phase, 'unknown');
  assert.equal(records[1].body.stage, 'unknown');
  assert.doesNotMatch(JSON.stringify(records), /PRIVATE|123e4567/);
  observer.stop();
  timers[2].fn();
  assert.equal(records.length, 2);
});

test('bounded reader rejects links, mismatch, unknown fields, oversized and untrusted values', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'grade-ci-'));
  try {
    const path = join(dir, `${hash}-5.json`);
    const body = { version: 1, runHash: hash, at: 5, case: 2, phase: 'execution', stage: 'wait' };
    writeFileSync(path, JSON.stringify(body));
    assert.deepEqual(await readPythonGradeCiRecords(dir), [body]);
    writeFileSync(path, JSON.stringify({ ...body, stage: 'PRIVATE_SECRET' }));
    assert.deepEqual(await readPythonGradeCiRecords(dir), []);
    writeFileSync(path, JSON.stringify({ ...body, unexpected: 'PRIVATE_SECRET' }));
    assert.deepEqual(await readPythonGradeCiRecords(dir), []);
    writeFileSync(path, JSON.stringify({ ...body, phase: 'unknown', stage: 'wait' }));
    assert.deepEqual(await readPythonGradeCiRecords(dir), []);
    writeFileSync(path, JSON.stringify({ ...body, runHash: 'a'.repeat(64) }));
    assert.deepEqual(await readPythonGradeCiRecords(dir), []);
    writeFileSync(path, 'x'.repeat(513));
    assert.deepEqual(await readPythonGradeCiRecords(dir), []);
    rmSync(path);
    symlinkSync('/etc/hosts', path);
    assert.deepEqual(await readPythonGradeCiRecords(dir), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('more than 24 otherwise valid records are unavailable rather than partly accepted', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'grade-ci-cap-'));
  try {
    for (let index = 0; index < 25; index++) {
      const runHash = index.toString(16).padStart(64, '0');
      const body = { version: 1, runHash, at: 5, case: 1, phase: 'analysis', stage: 'wait' };
      writeFileSync(join(dir, `${runHash}-5.json`), JSON.stringify(body));
    }
    assert.deepEqual(await readPythonGradeCiRecords(dir), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('capacity marker is fixed, bounded, and absent or forged markers remain unknown', () => {
  const dir = mkdtempSync(join(tmpdir(), 'grade-ci-capacity-'));
  try {
    const path = join(dir, 'grade-stage-capacity');
    assert.equal(readPythonGradeCiCapacity(dir), 'unknown');
    writeFileSync(path, 'reached');
    assert.equal(readPythonGradeCiCapacity(dir), 'reached');
    writeFileSync(path, 'PRIVATE_MARKER');
    assert.equal(readPythonGradeCiCapacity(dir), 'unknown');
    rmSync(path);
    symlinkSync('/etc/hosts', path);
    assert.equal(readPythonGradeCiCapacity(dir), 'unknown');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the production sink reports capacity on the 25th owned record without overwriting', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'grade-ci-sink-'));
  try {
    const original = readFileSync(
      new URL('./python-grade-ci-diagnostic.mjs', import.meta.url),
      'utf8',
    );
    const marker = "const directory = '/run/tsumucode-ci-diagnostics';";
    assert.equal(original.split(marker).length, 2);
    const isolated = original.replace(marker, `const directory = ${JSON.stringify(dir)};`);
    const module = await import(
      `data:text/javascript;base64,${Buffer.from(isolated).toString('base64')}`
    );
    for (let index = 1; index <= 25; index++) {
      const timers = [];
      const observer = module.createPythonGradeCiObserver({
        ...enabled,
        runId: `123e4567-e89b-42d3-a456-426614174000:${index}`,
        schedule: (fn) => {
          timers.push(fn);
          return { unref() {} };
        },
        cancel: () => {},
      });
      observer.mark(1, 'analysis', 'wait');
      timers[0]();
      observer.stop();
    }
    let records = [];
    for (let attempt = 0; attempt < 100; attempt++) {
      records = await module.readPythonGradeCiRecords(dir);
      if (records.length === 24 && module.readPythonGradeCiCapacity(dir) === 'reached') break;
      await sleep(10);
    }
    assert.equal(records.length, 24);
    assert.equal(module.readPythonGradeCiCapacity(dir), 'reached');
    const expected = Array.from({ length: 24 }, (_, index) =>
      createHash('sha256')
        .update(`123e4567-e89b-42d3-a456-426614174000:${index + 1}`)
        .digest('hex'),
    ).sort();
    assert.deepEqual(records.map((record) => record.runHash).sort(), expected);
    const overflowHash = createHash('sha256')
      .update('123e4567-e89b-42d3-a456-426614174000:25')
      .digest('hex');
    assert.equal(
      records.some((record) => record.runHash === overflowHash),
      false,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
