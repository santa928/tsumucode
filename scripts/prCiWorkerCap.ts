import { availableParallelism } from 'node:os';

/** PR実行のVitest既定値を超えない範囲でworker数を最大2にする。 */
export function resolvePrCiWorkerLimit(
  explicit: string | undefined,
  probe: () => number = availableParallelism,
): string | undefined {
  if (explicit !== undefined && !/^[1-9]\d*$/u.test(explicit)) {
    throw new Error('TSUMUCODE_TEST_MAX_WORKERS must be a positive integer');
  }
  const existing = explicit === undefined ? undefined : Number(explicit);
  if (existing !== undefined && !Number.isSafeInteger(existing)) {
    throw new Error('TSUMUCODE_TEST_MAX_WORKERS must be a safe integer');
  }
  try {
    const cpus = probe();
    if (!Number.isSafeInteger(cpus) || cpus < 1) return explicit;
    const cap = Math.min(2, Math.max(cpus - 1, 1));
    return String(existing === undefined ? cap : Math.min(existing, cap));
  } catch {
    return explicit;
  }
}
