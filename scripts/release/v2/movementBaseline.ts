import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { BaselineProofSchema, validateCapturedBaseline } from './parent';
import type { BaselineSchema } from './schema';
import { hashValue } from './identity';

export const MovementBaselineProofsSchema = z
  .object({
    original: BaselineProofSchema,
    current: BaselineProofSchema,
  })
  .strict();
type Baseline = z.infer<typeof BaselineSchema>;
type Binding = {
  deploymentId: string;
  sourceCommit: string;
  sourceRecordDigest: string;
  inventoryDigest: string;
};

/** 元scopeとfresh parentを各hashへ拘束し、observedAt以外が完全一致する場合だけ元scopeへ戻す。 */
export function resolveMovementBaseline(
  binding: Binding,
  current: Baseline,
  proofs?: z.infer<typeof MovementBaselineProofsSchema>,
): Baseline {
  if (!proofs) return current;
  validateCapturedBaseline({ baseline: current, proof: proofs.current });
  if (hashValue(proofs.original) !== binding.sourceRecordDigest)
    throw Error('Movement original baseline proof hash differs');
  if (
    hashValue({ ...proofs.original, observedAt: null }) !==
    hashValue({ ...proofs.current, observedAt: null })
  )
    throw Error('Movement baseline proof differs beyond observedAt');
  const bound = validateCapturedBaseline({
    baseline: { ...current, sourceRecordDigest: binding.sourceRecordDigest },
    proof: proofs.original,
  }).baseline;
  if (
    hashValue(binding) !==
    hashValue({
      deploymentId: bound.deploymentId,
      sourceCommit: bound.sourceCommit,
      sourceRecordDigest: bound.sourceRecordDigest,
      inventoryDigest: hashValue(bound.inventory),
    })
  )
    throw Error('Movement bound baseline proof identity differs');
  return bound;
}

/** fresh proofに元scopeの実proofを結ぶ。clean checkoutでは版管理された固定原本を使う。 */
export async function readMovementBaselineProofs(
  root: string,
  binding: Binding,
  current: Baseline,
  currentProof: unknown,
) {
  let bytes: Uint8Array;
  try {
    bytes = await readFile(path.join(root, '.release-v2/movement-baseline-proof.json'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    try {
      bytes = await readFile(path.join(root, 'docs/quality/movement-baseline-proof-v2.json'));
    } catch (recordedError) {
      if ((recordedError as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw recordedError;
    }
  }
  if (bytes.length > 64 * 1024) throw Error('Movement original baseline proof exceeds limit');
  const original: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  const proofs = MovementBaselineProofsSchema.parse({ original, current: currentProof });
  resolveMovementBaseline(binding, current, proofs);
  return proofs;
}
