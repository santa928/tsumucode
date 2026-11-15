export type ProbeStage = 'compile' | 'inventory' | 'candidate' | 'reader' | 'receipt';

export function formatFailure(stage: unknown, error: unknown): string {
  const stages: readonly unknown[] = ['compile', 'inventory', 'candidate', 'reader', 'receipt'];
  const fixedStage = stages.includes(stage) ? stage : 'unknown';
  let kind = 'other';
  try {
    const code = error instanceof Error ? (error as Error & { code?: unknown }).code : undefined;
    if (code === 'ENOENT' || code === 'EACCES' || code === 'EPERM' || code === 'ENOMEM')
      kind = code;
    else if (typeof code === 'number') kind = 'child-nonzero';
  } catch {
    kind = 'other';
  }
  return `practice-public-reader=failed; stage=${fixedStage}; kind=${kind}\n`;
}
