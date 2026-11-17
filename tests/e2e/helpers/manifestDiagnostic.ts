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

type UiSnapshot = {
  grade: 'ready-label' | 'validating' | 'waiting-lease' | 'missing' | 'other';
  gradeDisabled: boolean | null;
  preview:
    | 'ready-label'
    | 'updating'
    | 'preparing'
    | 'waiting-lease'
    | 'needs-prepare'
    | 'unrecognized-or-missing'
    | 'other';
  operationError: boolean | null;
};

/** Runs inside the page; never returns element text, code, or error content. */
export function readManifestDiagnosticUi(): UiSnapshot {
  const pager = document.querySelector('.tc-exercise-pager');
  const gradeButton = document.querySelector<HTMLButtonElement>(
    '.tc-exercise-pager button.tc-exercise-pager-primary',
  );
  const gradeLabel = gradeButton?.textContent.trim();
  const grade =
    gradeButton === null
      ? 'missing'
      : gradeLabel === '判定する'
        ? 'ready-label'
        : gradeLabel === '判定しています'
          ? 'validating'
          : gradeLabel === '編集権を確認しています'
            ? 'waiting-lease'
            : 'other';
  const previewLabels = [
    'プレビューを更新',
    '更新しています',
    '再準備しています',
    '編集権を確認しています',
    'プレビューを再準備',
  ];
  const previewButton = [
    ...document.querySelectorAll<HTMLButtonElement>(
      '.tc-exercise-pager button.tc-exercise-pager-secondary',
    ),
  ].find((button) => previewLabels.includes(button.textContent.trim()));
  const previewLabel = previewButton?.textContent.trim();
  const preview =
    previewButton === undefined
      ? 'unrecognized-or-missing'
      : previewLabel === 'プレビューを更新'
        ? 'ready-label'
        : previewLabel === '更新しています'
          ? 'updating'
          : previewLabel === '再準備しています'
            ? 'preparing'
            : previewLabel === '編集権を確認しています'
              ? 'waiting-lease'
              : 'needs-prepare';
  return {
    grade,
    gradeDisabled: gradeButton?.disabled ?? null,
    preview,
    operationError:
      pager === null ? null : pager.querySelector('.tc-exercise-operation-error') !== null,
  };
}

function normalizeUi(value: unknown): UiSnapshot | null {
  if (value === null || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const grades: UiSnapshot['grade'][] = [
    'ready-label',
    'validating',
    'waiting-lease',
    'missing',
    'other',
  ];
  const previews: UiSnapshot['preview'][] = [
    'ready-label',
    'updating',
    'preparing',
    'waiting-lease',
    'needs-prepare',
    'unrecognized-or-missing',
    'other',
  ];
  return {
    grade: grades.find((item) => item === row['grade']) ?? 'other',
    gradeDisabled: typeof row['gradeDisabled'] === 'boolean' ? row['gradeDisabled'] : null,
    preview: previews.find((item) => item === row['preview']) ?? 'other',
    operationError: typeof row['operationError'] === 'boolean' ? row['operationError'] : null,
  };
}

/** A stalled or broken page probe cannot suppress the original test failure. */
async function boundedUiProbe(probe: () => Promise<unknown>): Promise<UiSnapshot | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const raw = await Promise.race([
      Promise.resolve().then(probe),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => {
          resolve(null);
        }, 250);
      }),
    ]);
    return normalizeUi(raw);
  } catch {
    return null;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/** Records only bounded state; publishing a failed diagnostic must not mask the test failure. */
export async function withManifestDiagnostic<T>(
  run: (diagnostic: ManifestDiagnostic) => Promise<T>,
  publish: (value: string) => void,
  probeUi?: () => Promise<unknown>,
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
      const ui = probeUi === undefined ? undefined : await boundedUiProbe(probeUi);
      publish(
        JSON.stringify({
          phase,
          round,
          beforeCapped: before,
          afterCapped: after,
          grew,
          status,
          ...(probeUi === undefined ? {} : { ui }),
        }),
      );
    } catch {
      // The original test failure is authoritative, including when reporting fails.
    }
    throw error;
  }
}
