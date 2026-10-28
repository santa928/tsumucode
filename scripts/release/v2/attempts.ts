import { z } from 'zod';
import { BuildIdentitySchema, SuiteResultSchema, type SuiteResult } from './schema';
import { hashValue } from './identity';
/** Same-run only. Preserve all originals; later admission independently verifies selected coverage and clocks. */
export function selectResultAttempts(candidateInput: unknown, input: unknown): SuiteResult[] {
  const candidate = BuildIdentitySchema.parse(candidateInput),
    rows = z.array(SuiteResultSchema).parse(input),
    digest = hashValue(candidate),
    identities = new Set<string>(),
    selected = new Map<string, SuiteResult>();
  for (const row of rows) {
    const key = row.suite + '/' + String(row.verificationAttempt);
    if (
      identities.has(key) ||
      row.runId !== candidate.runId ||
      row.candidateDigest !== digest ||
      row.recipeDigest !== hashValue(candidate.recipe) ||
      row.verificationAttempt < candidate.buildAttempt ||
      row.status !== 'passed'
    )
      throw new Error('Duplicate or foreign verification attempt');
    identities.add(key);
    if ((selected.get(row.suite)?.verificationAttempt ?? 0) < row.verificationAttempt)
      selected.set(row.suite, row);
  }
  return [...selected.values()].sort((a, b) =>
    a.suite < b.suite ? -1 : a.suite > b.suite ? 1 : 0,
  );
}
