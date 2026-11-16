import assert from 'node:assert/strict';
import process from 'node:process';
import { URL } from 'node:url';
import { test } from 'node:test';
import { summarizeUnitSet } from '../../scripts/ci/retiredUnitSetSummary.mjs';

const report = () => ({
  numTotalTests: 3,
  success: false,
  startTime: 1000,
  testResults: [
    {
      name: '/workspace/tests/a.test.ts',
      status: 'passed',
      endTime: 2000,
      assertionResults: [
        { fullName: 'A one', status: 'passed' },
        { fullName: 'A two', status: 'skipped' },
      ],
    },
    {
      name: '/workspace/tests/b.test.ts',
      status: 'failed',
      endTime: 3000,
      assertionResults: [{ fullName: 'B one', status: 'failed' }],
    },
  ],
});

test('identity is order independent, preserves skips, and does not expose inputs', () => {
  const a = report();
  const b = report();
  b.testResults.reverse();
  b.testResults[1].assertionResults.reverse();
  const first = summarizeUnitSet(a);
  const second = summarizeUnitSet(b);
  assert.equal(first.status, 'ok');
  assert.equal(first.digest, second.digest);
  assert.deepEqual([first.files, first.tests, first.skipped, first.failed], [2, 3, 1, 1]);
  assert.equal(JSON.stringify(first).includes('/workspace/'), false);
  b.testResults[1].assertionResults[0].status = 'passed';
  assert.notEqual(summarizeUnitSet(b).digest, first.digest);
});

test('rejects incomplete, duplicate file, pending, and malformed inputs', () => {
  const bad = [];
  const missing = report();
  missing.numTotalTests++;
  bad.push(missing);
  const duplicate = report();
  duplicate.testResults[1].name = duplicate.testResults[0].name;
  bad.push(duplicate);
  const pending = report();
  pending.testResults[0].assertionResults[0].status = 'pending';
  bad.push(pending);
  const external = report();
  external.testResults[0].name = '/private/marker';
  bad.push(external);
  for (const item of bad) assert.deepEqual(summarizeUnitSet(item), { status: 'unavailable' });
});

test('requires complete matching identities and skip counts for a valid comparison', async () => {
  const { compareUnitSets } = await import('../../scripts/ci/retiredUnitSetCompare.mjs');
  const good = summarizeUnitSet(report());
  assert.equal(compareUnitSets(good, good).status, 'matched');
  assert.equal(compareUnitSets({ status: 'unavailable' }, good).status, 'unavailable');
  assert.equal(compareUnitSets({ ...good, digest: '0'.repeat(64) }, good).status, 'mismatch');
  assert.equal(compareUnitSets({ ...good, skipped: 0 }, good).status, 'unavailable');
});

test('CLI fails closed on missing or different identity and missing target phase', async () => {
  const { mkdtemp, mkdir, rm, writeFile } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const path = await import('node:path');
  const { spawnSync } = await import('node:child_process');
  const { fileURLToPath } = await import('node:url');
  const directory = await mkdtemp(path.join(tmpdir(), 'retired-unit-set-'));
  try {
    await mkdir(path.join(directory, 'test-results'));
    const r = {
      numTotalTests: 4677,
      success: true,
      startTime: 1000,
      testResults: Array.from({ length: 403 }, (_, index) => ({
        name: `/workspace/tests/suite-${index}.test.ts`,
        status: 'passed',
        endTime: 3000,
        assertionResults: Array.from({ length: index < 244 ? 12 : 11 }, (_, n) => ({
          fullName: `suite-${index}-test-${n}`,
          status: 'passed',
        })),
      })),
    };
    const target = r.testResults[0].assertionResults[0];
    target.title =
      'links synthetic b930 capture, retirement guard, real prepare and synthetic-receipt admission';
    target.meta = {
      retiredCaptureTiming: {
        phase: 'complete',
        marks: [
          'setup',
          'fixture-compile',
          'capture-before',
          'prepare',
          'historical',
          'capture-after',
          'admission',
          'complete',
        ].map((phase, elapsedMs) => ({ phase, elapsedMs })),
      },
    };
    r.private = 'PRIVATE_CANARY';
    await writeFile(
      path.join(directory, 'test-results/retired-capture-raw.json'),
      JSON.stringify(r),
    );
    const module = fileURLToPath(
      new URL('../../scripts/ci/retiredUnitSetCompare.mjs', import.meta.url),
    );
    const set = summarizeUnitSet(r);
    for (const [unitSet, targetData, expected] of [
      [set, { status: 'passed', phase: 'complete' }, 0],
      [{ ...set, digest: '0'.repeat(64) }, { status: 'passed', phase: 'complete' }, 1],
      [set, { status: 'unavailable' }, 1],
      [{ status: 'unavailable' }, { status: 'passed', phase: 'complete' }, 1],
    ]) {
      const output = spawnSync(process.execPath, [module], {
        cwd: directory,
        encoding: 'utf8',
        env: {
          ...process.env,
          DEFAULT_UNIT_SET: JSON.stringify(unitSet),
          DEFAULT_TARGET: JSON.stringify(targetData),
          DEFAULT_CAPACITY: '4',
          CAP2_CAPACITY: '4',
        },
      });
      assert.equal(output.status, expected);
      assert.equal((output.stdout + output.stderr).includes('PRIVATE_CANARY'), false);
    }
    for (const failure of ['suite', 'report']) {
      const failedReport = JSON.parse(JSON.stringify(r));
      if (failure === 'suite') failedReport.testResults[1].status = 'failed';
      else failedReport.success = false;
      await writeFile(
        path.join(directory, 'test-results/retired-capture-raw.json'),
        JSON.stringify(failedReport),
      );
      const output = spawnSync(process.execPath, [module], {
        cwd: directory,
        encoding: 'utf8',
        env: {
          ...process.env,
          DEFAULT_UNIT_SET: JSON.stringify(set),
          DEFAULT_TARGET: JSON.stringify({ status: 'passed', phase: 'complete' }),
          DEFAULT_CAPACITY: '4',
          CAP2_CAPACITY: '4',
        },
      });
      assert.equal(output.status, 1);
      assert.match(output.stdout, /"status":"failed"/u);
    }
    await writeFile(
      path.join(directory, 'test-results/retired-capture-raw.json'),
      JSON.stringify(r),
    );
    for (const cappedCapacity of ['2', 'unknown']) {
      const output = spawnSync(process.execPath, [module], {
        cwd: directory,
        encoding: 'utf8',
        env: {
          ...process.env,
          DEFAULT_UNIT_SET: JSON.stringify(set),
          DEFAULT_TARGET: JSON.stringify({ status: 'passed', phase: 'complete' }),
          DEFAULT_CAPACITY: '4',
          CAP2_CAPACITY: cappedCapacity,
        },
      });
      assert.equal(output.status, 1);
      assert.match(output.stdout, /"status":"unavailable"/u);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
