import { z } from 'zod';
import { DigestSchema, TargetSchema } from './schema';
const Bytes = z.number().int().nonnegative();
const MeasurementSchema = z
  .object({
    zombies: z.literal(0),
    zombieProcesses: z.tuple([]),
    zombieProcessesTruncated: z.literal(false),
    // Same resource sample emitted by next-project-bootstrap; diagnostic context is not ownership evidence.
    lifecycle: z
      .object({
        observedAtMs: z.number().int().positive(),
        bootstrapPid: z.number().int().positive(),
        currentChildPid: z.number().int().positive().nullable(),
        phase: z.enum(['stopping', 'updating', 'paused', 'ready', 'starting']),
      })
      .strict(),
    memoryPeak: Bytes.positive(),
    memoryCurrent: Bytes,
    pids: z.number().int().min(1).max(64),
    workspaceBytes: Bytes.max(64 * 1024 ** 2),
    temporaryBytes: Bytes.max(64 * 1024 ** 2),
    memoryEvents: z
      .object({ max: z.literal(0), oom: z.literal(0), oomKill: z.literal(0) })
      .strict(),
  })
  .strict();
const RowSchema = z.object({
  fixture: z.string().min(1),
  workspaceId: z.string().min(1),
  sourceDigest: DigestSchema,
  status: z.enum(['pass', 'incomplete', 'code-error', 'system-error']),
  limitMiB: z.union([z.literal(512), z.literal(576), z.literal(896)]),
  measured: MeasurementSchema,
});
/** Controller assertions run before emitting each row. Keep native resource/forgery gates separately mandatory. */
export function readNextFixtureCoverage(rowsInput: unknown, targetsInput: unknown): string[] {
  const rows = z.array(RowSchema).min(1).parse(rowsInput);
  const targets = z.array(TargetSchema).min(1).parse(targetsInput);
  if (
    targets.some(
      (target) =>
        target.kind !== 'fixture' ||
        target.mode !== 'local' ||
        target.runtimeKind !== 'next' ||
        !target.sourceDigest ||
        !target.expectedStatus,
    )
  )
    throw new Error('Invalid native fixture plan');
  if (new Set(targets.map(({ key }) => key)).size !== targets.length)
    throw new Error('Duplicate native targets');
  const observed = new Set<string>(),
    executions = new Set<string>();
  const matchesStatus = (actual: string, expected: string | undefined) =>
    expected === 'not-pass' ? actual !== 'pass' && actual !== 'system-error' : actual === expected;
  for (const row of rows) {
    const identity = row.workspaceId + '/' + row.fixture;
    if (executions.has(identity)) throw new Error('Duplicate native execution');
    executions.add(identity);
    if (
      row.measured.memoryPeak > row.limitMiB * 1024 ** 2 ||
      row.measured.memoryCurrent > row.limitMiB * 1024 ** 2
    )
      throw new Error('Native memory limit exceeded');
    const authored = targets.find(
      (target) =>
        (target.workspaceId ?? target.exerciseId) === row.workspaceId &&
        target.caseKind === 'authored' &&
        target.fixtureId === row.fixture,
    );
    if (
      !authored ||
      authored.sourceDigest !== row.sourceDigest ||
      !matchesStatus(row.status, authored.expectedStatus)
    )
      throw new Error('Unrecognized or mismatched native Source/status');
    observed.add(authored.key);
    // Alias only genuinely identical built-in inputs/status predicates, never a missing authored case.
    for (const target of targets.filter(
      (target) =>
        (target.workspaceId ?? target.exerciseId) === row.workspaceId &&
        target.caseKind !== 'authored',
    ))
      if (
        target.sourceDigest === row.sourceDigest &&
        matchesStatus(row.status, target.expectedStatus)
      )
        observed.add(target.key);
  }
  if (observed.size !== targets.length || targets.some(({ key }) => !observed.has(key)))
    throw new Error('Missing native fixture coverage');
  return [...observed].sort();
}
