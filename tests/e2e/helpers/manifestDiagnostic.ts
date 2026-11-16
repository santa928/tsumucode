type Phase =
  | 'setup'
  | 'opening'
  | 'writing-starter'
  | 'writing-solution'
  | 'history-before'
  | 'history'
  | 'click'
  | 'feedback'
  | 'saved-files';

export interface ManifestDiagnostic {
  step(phase: Phase, round: number): void;
  history(before: number, after: number, status: string | undefined): void;
}

/** Records only bounded state; publishing a failed diagnostic must not mask the test failure. */
export async function withManifestDiagnostic<T>(
  run: (diagnostic: ManifestDiagnostic) => Promise<T>,
  publish: (value: string) => void,
): Promise<T> {
  let phase: Phase = 'setup';
  let round = 0;
  let before: number | null = null;
  let after: number | null = null;
  let grew: boolean | null = null;
  let status: 'pass' | 'incomplete' | 'code-error' | 'other' | null = null;
  const diagnostic: ManifestDiagnostic = {
    step(next, nextRound) {
      phase = next;
      round = Math.max(0, Math.min(4, Math.trunc(nextRound)));
      if (next === 'opening') {
        before = null;
        after = null;
        grew = null;
        status = null;
      }
    },
    history(previous, current, value) {
      before = Math.max(0, Math.min(20, Math.trunc(previous)));
      after = Math.max(0, Math.min(20, Math.trunc(current)));
      grew = current > previous;
      status =
        value === undefined
          ? null
          : value === 'pass' || value === 'incomplete' || value === 'code-error'
            ? value
            : 'other';
    },
  };
  try {
    return await run(diagnostic);
  } catch (error: unknown) {
    try {
      publish(
        JSON.stringify({ phase, round, beforeCapped: before, afterCapped: after, grew, status }),
      );
    } catch {
      // The original test failure is authoritative, including when reporting fails.
    }
    throw error;
  }
}
