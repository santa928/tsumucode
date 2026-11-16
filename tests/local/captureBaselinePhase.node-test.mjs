import assert from 'node:assert/strict';
import test from 'node:test';
import {
  markActiveCaptureBaselinePhase,
  markCaptureBaselinePhase,
} from '../../scripts/ci/captureBaselinePhase.mjs';

test('disabled diagnostics do not emit even valid phases', () => {
  const lines = [];
  markCaptureBaselinePhase(false, 'copy', 'start', (line) => lines.push(line));
  assert.deepEqual(lines, []);
});

test('aborted diagnostic markers are suppressed', () => {
  const lines = [];
  const controller = new globalThis.AbortController();
  markActiveCaptureBaselinePhase(controller.signal, true, 'copy', 'start', (line) =>
    lines.push(line),
  );
  controller.abort();
  markActiveCaptureBaselinePhase(controller.signal, true, 'copy', 'done', (line) =>
    lines.push(line),
  );
  assert.deepEqual(lines, ['capture-baseline-phase copy start\n']);
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

test('retired git markers include only bounded process counters', () => {
  const lines = [];
  markCaptureBaselinePhase(
    true,
    'retired-git',
    'start',
    (line) => lines.push(line),
    () => ({
      userCPUTime: 10,
      systemCPUTime: 20,
      maxRSS: 30,
    }),
  );
  assert.deepEqual(lines, [
    'capture-baseline-phase retired-git start user_us=10 system_us=20 maxrss_kib=30\n',
  ]);
});

test('failed or unbounded resource readings never expose raw data', () => {
  const lines = [];
  markCaptureBaselinePhase(
    true,
    'retired-git',
    'start',
    (line) => lines.push(line),
    () => {
      throw Error('untrusted-input');
    },
  );
  markCaptureBaselinePhase(
    true,
    'retired-git',
    'done',
    (line) => lines.push(line),
    () => ({
      userCPUTime: -1,
      systemCPUTime: 20,
      maxRSS: 30,
    }),
  );
  assert.deepEqual(lines, [
    'capture-baseline-phase retired-git start resources=unavailable\n',
    'capture-baseline-phase retired-git done resources=unavailable\n',
  ]);
});
