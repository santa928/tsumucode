import { hashValue } from '../../../scripts/release/v2/identity';
import type { BrowserFixtureCase } from './courseFixtureGate';

/** Every logical oracle stays attached to the exact execution input that it checks. */
export function groupFixtureExecutions(
  cases: readonly BrowserFixtureCase[],
): readonly (readonly BrowserFixtureCase[])[] {
  const byInput = new Map<string, BrowserFixtureCase[][]>();
  const groups: BrowserFixtureCase[][] = [];
  for (const fixture of cases) {
    const key = hashValue({
      exercise: fixture.exercise,
      workspaceAssets: fixture.workspaceAssets,
      files: fixture.files,
      faultInjection: fixture.faultInjection ?? null,
    });
    const candidates = byInput.get(key) ?? [];
    const group = candidates.find((rows) =>
      rows.every((row) => compatibleExpectations(row, fixture)),
    );
    if (group) group.push(fixture);
    else {
      const rows = [fixture];
      candidates.push(rows);
      byInput.set(key, candidates);
      groups.push(rows);
    }
  }
  return groups;
}

function compatibleExpectations(a: BrowserFixtureCase, b: BrowserFixtureCase): boolean {
  const accepts = (expected: BrowserFixtureCase['expectedStatus'], actual: string) =>
    expected === 'not-pass'
      ? actual === 'incomplete' || actual === 'code-error'
      : expected === actual;
  if (
    !['pass', 'incomplete', 'code-error', 'system-error'].some(
      (status) => accepts(a.expectedStatus, status) && accepts(b.expectedStatus, status),
    )
  )
    return false;
  // The starter's not-pass oracle intentionally has no diagnostic/rule constraints.
  if (a.expectedStatus === 'not-pass' || b.expectedStatus === 'not-pass') return true;
  const equal = (left: readonly string[], right: readonly string[]) =>
    hashValue([...left].sort()) === hashValue([...right].sort());
  return (
    (a.expectedDiagnosticCodes === undefined ||
      b.expectedDiagnosticCodes === undefined ||
      equal(a.expectedDiagnosticCodes, b.expectedDiagnosticCodes)) &&
    equal(a.expectedFeedbackRuleIds ?? [], b.expectedFeedbackRuleIds ?? [])
  );
}
