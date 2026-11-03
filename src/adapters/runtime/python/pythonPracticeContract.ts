import { z } from 'zod';

export const PYTHON_PRACTICE_LIMITS = {
  inputLines: 16,
  inputBytes: 1024,
  waitingMilliseconds: 60_000,
} as const;

export const pythonPracticeIdentitySchema = z
  .object({
    runId: z.uuid(),
    sessionId: z.string().max(160),
    executionRevision: z.number().int().nonnegative(),
    sourceHash: z.string().regex(/^[a-f0-9]{64}$/u),
  })
  .strict();

/** 練習の一時表示だけに用い、ExecutionResultや採点evidenceへ変換しない。 */
export const pythonPracticeSnapshotSchema = z
  .object({
    purpose: z.literal('practice'),
    identity: pythonPracticeIdentitySchema,
    phase: z.enum(['preparing', 'running', 'pausing', 'waiting-input', 'resuming', 'ended']),
    reason: z.string().max(64).nullable(),
    inputRequestSequence: z.number().int().min(1).max(17).nullable(),
    inputCount: z.number().int().min(0).max(16),
    inputBytes: z.number().int().min(0).max(1024),
    activeMs: z.number().int().nonnegative(),
    waitingMs: z.number().int().nonnegative(),
    elapsedMs: z.number().int().nonnegative(),
    stdout: z.string().max(65536),
    stderr: z.string().max(65536),
    removed: z.boolean(),
    recoveryNeeded: z.boolean(),
    purged: z.boolean(),
    exitCode: z.number().int().min(0).max(255).nullable(),
  })
  .strict();

export type PythonPracticeSnapshot = z.infer<typeof pythonPracticeSnapshotSchema>;
export type PythonPracticeIdentity = PythonPracticeSnapshot['identity'];
export interface PythonPracticeRequest {
  readonly exerciseId: string;
  readonly contentRevision: string;
  readonly exerciseSessionId: string;
  readonly executionRevision: number;
  readonly files: Readonly<Record<string, string>>;
}
export interface PythonPracticeClient {
  start(
    request: PythonPracticeRequest,
    onSnapshot: (value: PythonPracticeSnapshot) => void,
  ): Promise<void>;
  send(sequence: number, line?: string, eof?: boolean): Promise<void>;
  stop(): Promise<PythonPracticeSnapshot | undefined>;
}
