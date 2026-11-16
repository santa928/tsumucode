import { readFile, writeFile } from 'node:fs/promises';
import process from 'node:process';
import { summarizeManifestDiagnostic } from './manifestDiagnosticSummary.mjs';

try {
  const report = JSON.parse(await readFile('.release-v2/diagnostic-report.json', 'utf8'));
  const summary = summarizeManifestDiagnostic(report);
  // Only the fixed, sanitized summary is made readable to the host artifact uploader.
  await writeFile('.release-v2/diagnostic-summary.json', JSON.stringify(summary), { mode: 0o644 });
} catch {
  // Never emit the untrusted report or error; missing output fails this diagnostic job.
  process.stderr.write('Diagnostic report unavailable or invalid\n');
  process.exitCode = 1;
}
