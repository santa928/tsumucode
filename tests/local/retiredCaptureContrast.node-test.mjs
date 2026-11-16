import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compare } from '../../scripts/ci/retiredCaptureContrast.mjs';

const files = [
  ['tests/unit/release/v2/retiredMovementCaptureIntegration.test.ts', 2],
  ['tests/unit/runtime/checkQuizProject.test.ts', 16],
  ['tests/content/javascript-review-migration.test.ts', 8],
];
function report() {
  return {
    testResults: files.map(([name, count], i) => ({
      name: `/workspace/${name}`,
      status: 'passed',
      startTime: 1000 + i * 100,
      endTime: 3000 + i * 100,
      assertionResults: Array.from({ length: count }, (_, n) => ({
        fullName: `${name}-${n}`,
        title:
          i === 0 && n === 0
            ? 'links synthetic b930 capture, retirement guard, real prepare and synthetic-receipt admission'
            : `${name}-${n}`,
        meta:
          i === 0 && n === 0
            ? {
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
              }
            : {},
        status: 'passed',
      })),
    })),
  };
}

test('compares the same complete test identities without reporting arbitrary data', () => {
  const first = report();
  const second = report();
  first.testResults[0].arbitrary = 'private-marker';
  const result = compare(first, second);
  assert.equal(result.comparable, true);
  assert.equal(result.count, 26);
  assert.equal(result.defaultOverlapMs, 1900);
  assert.deepEqual(
    result.defaultFiles.map((file) => file.label),
    ['retirement', 'quiz', 'migration'],
  );
  assert.equal(result.defaultFiles[0].testSpanMs, 2000);
  assert.equal(JSON.stringify(result).includes('private-marker'), false);
});

test('rejects missing, duplicate, skipped, changed identity, and malformed timings', () => {
  const bad = [];
  const missing = report();
  missing.testResults.pop();
  bad.push(missing);
  const duplicate = report();
  duplicate.testResults[2] = duplicate.testResults[1];
  bad.push(duplicate);
  const skipped = report();
  skipped.testResults[0].assertionResults[0].status = 'skipped';
  bad.push(skipped);
  const changed = report();
  changed.testResults[0].assertionResults[0].fullName = 'different';
  bad.push(changed);
  const missingPhase = report();
  missingPhase.testResults[0].assertionResults[0].meta = {};
  bad.push(missingPhase);
  const moved = report();
  [
    moved.testResults[0].assertionResults[1].fullName,
    moved.testResults[1].assertionResults[0].fullName,
  ] = [
    moved.testResults[1].assertionResults[0].fullName,
    moved.testResults[0].assertionResults[1].fullName,
  ];
  bad.push(moved);
  const incomplete = report();
  incomplete.testResults[0].assertionResults[0].meta.retiredCaptureTiming = {
    phase: 'setup',
    marks: [{ phase: 'setup', elapsedMs: 0 }],
  };
  bad.push(incomplete);
  const invalid = report();
  invalid.testResults[0].endTime = Infinity;
  bad.push(invalid);
  for (const value of bad) assert.equal(compare(report(), value).comparable, false);
});

test('preserves a failed assertion as an observed failure', () => {
  const failed = report();
  failed.testResults[0].assertionResults[0].status = 'failed';
  const result = compare(report(), failed);
  assert.equal(result.comparable, true);
  assert.equal(result.cappedStatus, 'failed');
});
