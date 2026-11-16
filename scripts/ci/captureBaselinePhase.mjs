import process from 'node:process';

const phases = new Set([
  'copy',
  'git',
  'compile',
  'inventory',
  'capture',
  'retired-setup',
  'retired-git',
  'retired-fixture-compile',
  'retired-capture-before',
  'retired-prepare',
  'retired-historical',
  'retired-capture-after',
  'retired-admission',
  'retired-cleanup',
]);
const states = new Set(['start', 'done']);

export function markActiveCaptureBaselinePhase(signal, enabled, phase, state, write) {
  if (signal.aborted) return;
  markCaptureBaselinePhase(enabled, phase, state, write);
}

export function markCaptureBaselinePhase(
  enabled,
  phase,
  state,
  write = (line) => process.stderr.write(line),
  resources = () => process.resourceUsage(),
) {
  if (!enabled || !phases.has(phase) || !states.has(state)) return;
  try {
    let suffix = '';
    if (phase.startsWith('retired-')) {
      suffix = ' resources=unavailable';
      try {
        const usage = resources();
        const counters = [usage.userCPUTime, usage.systemCPUTime, usage.maxRSS];
        if (counters.every((value) => Number.isSafeInteger(value) && value >= 0 && value <= 1e15)) {
          suffix = ` user_us=${counters[0]} system_us=${counters[1]} maxrss_kib=${counters[2]}`;
        }
      } catch {
        // Preserve a fixed fallback when the platform cannot report counters.
      }
    }
    write(`capture-baseline-phase ${phase} ${state}${suffix}\n`);
  } catch {
    // Diagnostic output must not change the original test result.
  }
}
