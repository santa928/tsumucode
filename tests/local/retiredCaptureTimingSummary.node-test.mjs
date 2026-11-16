import assert from 'node:assert/strict';
import { test } from 'node:test';
import { summarize } from '../../scripts/ci/retiredCaptureTimingSummary.mjs';

const title =
  'links synthetic b930 capture, retirement guard, real prepare and synthetic-receipt admission';
const report = (entry) => ({ testResults: [{ assertionResults: [entry] }] });
const good = {
  title,
  status: 'failed',
  meta: {
    retiredCaptureTiming: {
      phase: 'capture-before',
      marks: [
        { phase: 'setup', elapsedMs: 0 },
        { phase: 'fixture-compile', elapsedMs: 250 },
        { phase: 'capture-before', elapsedMs: 510 },
      ],
    },
  },
};

test('emits only bounded fixed fields and retains failed status', () => {
  const output = summarize(report({ ...good, arbitrary: 'private-marker' }));
  assert.deepEqual(output, {
    status: 'failed',
    durationMs: null,
    phase: 'capture-before',
    marks: good.meta.retiredCaptureTiming.marks,
  });
  assert.equal(JSON.stringify(output).includes('private-marker'), false);
});

test('reports unavailable for absent, duplicate, malformed, out of order, or unknown values', () => {
  const bad = [
    { testResults: [] },
    { testResults: [{ assertionResults: [good, good] }] },
    report({ ...good, status: 'private-marker' }),
    report({ ...good, meta: { retiredCaptureTiming: { phase: 'private-marker', marks: [] } } }),
    report({
      ...good,
      meta: {
        retiredCaptureTiming: { phase: 'setup', marks: [{ phase: 'setup', elapsedMs: 120001 }] },
      },
    }),
    report({
      ...good,
      meta: {
        retiredCaptureTiming: {
          phase: 'capture-before',
          marks: [{ phase: 'capture-before', elapsedMs: 0 }],
        },
      },
    }),
  ];
  for (const value of bad) assert.deepEqual(summarize(value), { status: 'unavailable' });
});
