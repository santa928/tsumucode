import { performance } from 'node:perf_hooks';

const PHASES = [
  'setup',
  'fixture-compile',
  'capture-before',
  'prepare',
  'historical',
  'capture-after',
  'admission',
  'complete',
] as const;
export type RetiredCapturePhase = (typeof PHASES)[number];

/** Diagnostic-only memory metadata; no test-input values or output operations. */
export function createRetiredCaptureTiming(
  meta: object,
  signal: AbortSignal,
  enabled: boolean,
  now: () => number = () => performance.now(),
): (phase: RetiredCapturePhase) => void {
  if (!enabled) return () => {};
  let start: number;
  try {
    start = now();
    if (!Number.isFinite(start)) return () => {};
  } catch {
    return () => {};
  }
  const marks: { phase: RetiredCapturePhase; elapsedMs: number }[] = [];
  return (phase) => {
    try {
      if (signal.aborted || phase !== PHASES[marks.length]) return;
      const elapsed = now() - start;
      if (!Number.isFinite(elapsed)) return;
      const elapsedMs = Math.max(
        marks.at(-1)?.elapsedMs ?? 0,
        Math.min(120_000, Math.max(0, Math.round(elapsed))),
      );
      marks.push({ phase, elapsedMs });
      Reflect.set(meta, 'retiredCaptureTiming', { phase, marks: [...marks] });
    } catch {
      // Optional diagnostics must not replace the outcome of the real test.
    }
  };
}
