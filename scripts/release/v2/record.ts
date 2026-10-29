import { z } from 'zod';
import { CommitSchema } from './schema';

const ActualDeploymentSchema = z
  .object({
    id: z.string().min(1),
    sourceCommit: CommitSchema,
    status: z.enum(['success', 'in_progress', 'failure']),
  })
  .strict();
const DeploymentRecordSchema = z
  .object({
    deploymentId: z.string().min(1),
    sourceCommit: CommitSchema,
    state: z.enum(['verified', 'deployed-unverified', 'deployed-verification-failed']),
  })
  .strict();
export type ReconciledDeployment =
  | { readonly state: 'unknown' }
  | {
      readonly state:
        'deploying' | 'deployed-unverified' | 'deployed-verification-failed' | 'verified';
      readonly deploymentId: string;
      readonly sourceCommit: string;
    };

/** Actual Pages deployment is truth; a delayed report must never restore the previous release. */
export function reconcileDeployment(
  actualInput: unknown,
  recordInput: unknown,
): ReconciledDeployment {
  const parsed = ActualDeploymentSchema.safeParse(actualInput);
  if (!parsed.success) return { state: 'unknown' };
  const actual = parsed.data;
  if (actual.status === 'failure') return { state: 'unknown' };
  const identity = { deploymentId: actual.id, sourceCommit: actual.sourceCommit };
  if (actual.status === 'in_progress') return { state: 'deploying', ...identity };
  if (recordInput === undefined) return { state: 'deployed-unverified', ...identity };
  const parsedRecord = DeploymentRecordSchema.safeParse(recordInput);
  if (!parsedRecord.success) return { state: 'unknown' };
  const record = parsedRecord.data;
  if (record.deploymentId !== actual.id) return { state: 'deployed-unverified', ...identity };
  if (record.sourceCommit !== actual.sourceCommit) return { state: 'unknown' };
  return { state: record.state, ...identity };
}
