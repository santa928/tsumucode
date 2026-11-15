export type ProbeStage = 'compile' | 'inventory' | 'candidate' | 'reader' | 'receipt' | 'rechecks';

const fixedLessons = [
  'python-practice/python-practice-ch01-l01',
  'python-practice/python-practice-ch01-l02',
  'python-practice/python-practice-ch01-l03',
  'python-practice/python-practice-ch02-l01',
  'python-practice/python-practice-ch03-l01',
] as const;

export function countTechnicalRechecks(
  rows: readonly { lesson: string; scopes: string[] }[],
): number[] {
  const counts = [0, 0, 0, 0, 0];
  const seen = new Set<string>();
  const allowed = new Set(['exercise', 'navigation', 'persistence']);
  for (const row of rows) {
    const index = fixedLessons.findIndex((id) => id === row.lesson);
    if (
      index < 0 ||
      seen.has(row.lesson) ||
      !Array.isArray(row.scopes) ||
      row.scopes.length === 0 ||
      row.scopes.some((scope) => !allowed.has(scope)) ||
      new Set(row.scopes).size !== row.scopes.length
    )
      throw new Error('Invalid technical recheck shape');
    seen.add(row.lesson);
    counts[index] = row.scopes.length;
  }
  return counts;
}

export function formatFailure(stage: unknown, error: unknown): string {
  const stages: readonly string[] = [
    'compile',
    'inventory',
    'candidate',
    'reader',
    'receipt',
    'rechecks',
  ];
  const fixedStage = typeof stage === 'string' && stages.includes(stage) ? stage : 'unknown';
  let kind = 'other';
  let child = 'other';
  let reason = 'other';
  try {
    const detail = error instanceof Error ? (error as Error & Record<string, unknown>) : undefined;
    const code = detail?.code;
    if (code === 'ENOENT' || code === 'EACCES' || code === 'EPERM' || code === 'ENOMEM')
      kind = code;
    else if (typeof code === 'number') kind = 'child-nonzero';
    if (kind === 'child-nonzero') {
      const cmd = detail?.cmd;
      if (typeof cmd === 'string' && cmd.length <= 1024) {
        for (const name of ['rev-parse', 'show', 'cat-file', 'archive']) {
          if (cmd === `git ${name}` || cmd.startsWith(`git ${name} `)) child = `git-${name}`;
        }
        if (cmd === 'tar' || cmd.startsWith('tar ')) child = 'tar';
      }
      const raw = detail?.stderr;
      const text =
        typeof raw === 'string' && raw.length <= 8192
          ? raw
          : Buffer.isBuffer(raw) && raw.length <= 8192
            ? raw.toString('utf8')
            : '';
      if (/detected dubious ownership/iu.test(text)) reason = 'dubious-owner';
      else if (/not a git repository/iu.test(text)) reason = 'not-repository';
      else if (/not a valid object name|bad object|unknown revision/iu.test(text))
        reason = 'missing-object';
      else if (/permission denied/iu.test(text)) reason = 'permission';
    }
  } catch {
    kind = 'other';
    child = 'other';
    reason = 'other';
  }
  return `practice-public-reader=failed; stage=${fixedStage}; kind=${kind}; child=${child}; reason=${reason}\n`;
}
