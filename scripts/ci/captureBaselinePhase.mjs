import process from 'node:process';

const phases = new Set(['copy', 'git', 'compile', 'inventory', 'capture']);
const states = new Set(['start', 'done']);

export function markCaptureBaselinePhase(
  enabled,
  phase,
  state,
  write = (line) => process.stderr.write(line),
) {
  if (!enabled || !phases.has(phase) || !states.has(state)) return;
  try {
    write(`capture-baseline-phase ${phase} ${state}\n`);
  } catch {
    // Diagnostic output must not change the original test result.
  }
}
