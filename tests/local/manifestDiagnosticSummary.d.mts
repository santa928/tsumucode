export interface DiagnosticSummary {
  scope: 'synthetic-webkit-diagnostic-only';
  tests: Array<{ lesson: 'ch02' | 'ch03'; status: string; diagnostic: unknown }>;
}
export function summarizeManifestDiagnostic(input: unknown): DiagnosticSummary;
