import { lstat, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { summarizeUnitSet } from './retiredUnitSetSummary.mjs';

const title =
  'links synthetic b930 capture, retirement guard, real prepare and synthetic-receipt admission';
const phases = [
  'setup',
  'fixture-compile',
  'capture-before',
  'prepare',
  'historical',
  'capture-after',
  'admission',
  'complete',
];

/** Whitelist only finite synthetic phase timing, never arbitrary report data. */
export function summarize(report) {
  try {
    if (!Array.isArray(report?.testResults)) return { status: 'unavailable' };
    const matches = report.testResults
      .flatMap((suite) => (Array.isArray(suite?.assertionResults) ? suite.assertionResults : []))
      .filter((entry) => entry?.title === title);
    if (matches.length !== 1) return { status: 'unavailable' };
    const entry = matches[0];
    if (!['passed', 'failed', 'skipped'].includes(entry.status)) return { status: 'unavailable' };
    const timing = entry.meta?.retiredCaptureTiming;
    if (
      !timing ||
      !Array.isArray(timing.marks) ||
      timing.marks.length < 1 ||
      timing.marks.length > phases.length
    )
      return { status: 'unavailable' };
    let previous = -1;
    const marks = [];
    for (const [index, mark] of timing.marks.entries()) {
      if (
        mark?.phase !== phases[index] ||
        !Number.isInteger(mark?.elapsedMs) ||
        mark.elapsedMs < 0 ||
        mark.elapsedMs < previous ||
        mark.elapsedMs > 120_000
      )
        return { status: 'unavailable' };
      previous = mark.elapsedMs;
      marks.push({ phase: phases[index], elapsedMs: mark.elapsedMs });
    }
    if (timing.phase !== marks.at(-1).phase) return { status: 'unavailable' };
    const durationMs =
      typeof entry.duration === 'number' && Number.isFinite(entry.duration) && entry.duration >= 0
        ? Math.min(180_000, Math.round(entry.duration))
        : null;
    return { status: entry.status, durationMs, phase: timing.phase, marks };
  } catch {
    return { status: 'unavailable' };
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let summary = { status: 'unavailable' };
  let unitSet = { status: 'unavailable' };
  try {
    const file = 'test-results/retired-capture-raw.json';
    const stat = await lstat(file);
    if (stat.isFile() && !stat.isSymbolicLink() && stat.size <= 64 * 1024 * 1024) {
      const report = JSON.parse(await readFile(file, 'utf8'));
      summary = summarize(report);
      unitSet = summarizeUnitSet(report);
    }
  } catch {
    // Missing or invalid diagnostics do not replace the original CI outcome.
  }
  process.stdout.write(`Retired capture diagnostic: ${JSON.stringify(summary)}\n`);
  process.stdout.write(`Retired unit set: ${JSON.stringify(unitSet)}\n`);
}
