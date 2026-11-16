import assert from 'node:assert/strict';
import test from 'node:test';
import { markCaptureBaselinePhase } from '../../scripts/ci/captureBaselinePhase.mjs';

test('disabled diagnostics do not emit even valid phases', () => {
  const lines = [];
  markCaptureBaselinePhase(false, 'copy', 'start', (line) => lines.push(line));
  assert.deepEqual(lines, []);
});

test('enabled diagnostics emit only fixed allowed phase and state', () => {
  const lines = [];
  for (const phase of ['copy', 'git', 'compile', 'inventory', 'capture']) {
    for (const state of ['start', 'done']) {
      markCaptureBaselinePhase(true, phase, state, (line) => lines.push(line));
    }
  }
  assert.deepEqual(lines, [
    'capture-baseline-phase copy start\n',
    'capture-baseline-phase copy done\n',
    'capture-baseline-phase git start\n',
    'capture-baseline-phase git done\n',
    'capture-baseline-phase compile start\n',
    'capture-baseline-phase compile done\n',
    'capture-baseline-phase inventory start\n',
    'capture-baseline-phase inventory done\n',
    'capture-baseline-phase capture start\n',
    'capture-baseline-phase capture done\n',
  ]);
});

test('unknown data and writer errors do not alter the case or leak data', () => {
  const lines = [];
  markCaptureBaselinePhase(true, 'untrusted-input', 'start', (line) => lines.push(line));
  markCaptureBaselinePhase(true, 'copy', 'untrusted-input', (line) => lines.push(line));
  assert.deepEqual(lines, []);
  assert.doesNotThrow(() =>
    markCaptureBaselinePhase(true, 'copy', 'done', () => {
      throw Error('private');
    }),
  );
});
