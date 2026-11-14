import { types } from 'node:util';
import { z } from 'zod';
import { canonicalJson } from '../../../src/core/persistence/canonicalJson';
import { hashBytes, hashValue } from './identity';
import { validateCapturedBaseline } from './parent';
import { CommitSchema, DigestSchema } from './schema';

const decimal = z.string().regex(/^[1-9]\d{0,15}$/u);
const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype) as object;
const bufferDescriptor = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'buffer');
const lengthDescriptor = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'byteLength');
const offsetDescriptor = Object.getOwnPropertyDescriptor(typedArrayPrototype, 'byteOffset');

// Byte snapshots only. Trusted origin, private isolation and authorization are separate.
function snapshotBytes(input: unknown, max: number, message: string): Buffer {
  try {
    if (!types.isUint8Array(input) || !bufferDescriptor?.get || !lengthDescriptor?.get || !offsetDescriptor?.get)
      throw Error(message);
    const prototype: unknown = Object.getPrototypeOf(input);
    if (prototype !== Uint8Array.prototype && prototype !== Buffer.prototype) throw Error(message);
    const backing: unknown = bufferDescriptor.get.call(input);
    const length: unknown = lengthDescriptor.get.call(input);
    const offset: unknown = offsetDescriptor.get.call(input);
    if (!types.isArrayBuffer(backing) ||
        typeof length !== 'number' || !length || length > max || typeof offset !== 'number')
      throw Error(message);
    return Buffer.from(new Uint8Array(backing, offset, length));
  } catch {
    throw Error(message);
  }
}
const common = {
  schemaVersion: z.literal(1),
  repository: z.literal('santa928/tsumucode'),
  runId: decimal,
  attempt: z.number().int().positive(),
  source: CommitSchema,
  producerJobId: decimal,
  verifierCommit: CommitSchema,
  movementDeclarationDigest: z.literal(
    '4ce18d583429e685ee951def56982bb5c5b292b7e4ad78e162d5ebd2703da494',
  ),
  parentIdentityDigest: DigestSchema,
  parentTagDigest: DigestSchema,
  parentDeploymentId: decimal,
  parentSource: CommitSchema,
};
const Evidence = z
  .discriminatedUnion('mode', [
    z
      .object({
        ...common,
        mode: z.literal('anchor'),
        parentDeploymentId: z.literal('7699435659'),
        parentSource: z.literal('b9306eb3414e69a2068603cfdbf2706ebe4e9284'),
        parentTagDigest: z.literal(
          '005611a22025a12d925bda0fdfb47c96266cf0d3a57aef984f358528a74ead3b',
        ),
      })
      .strict(),
    z
      .object({
        ...common,
        mode: z.literal('signed'),
        subjectSha256: DigestSchema,
        bundleSha256: DigestSchema,
      })
      .strict(),
  ])
  .superRefine((e, context) => {
    if (e.mode === 'signed' && e.parentDeploymentId === '7699435659')
      context.addIssue({
        code: 'custom',
        message: 'Historical anchor cannot claim a signed lineage',
      });
  });
const Expected = z
  .object({
    repository: z.literal('santa928/tsumucode'),
    runId: decimal,
    attempt: z.number().int().positive(),
    source: CommitSchema,
    producerJobId: decimal,
    verifierCommit: CommitSchema,
    mode: z.enum(['anchor', 'signed']),
    sha256: DigestSchema,
  })
  .strict();

/** Structural match only. The workflow must authenticate its producer and reverify the live parent. */
export function matchSameRunLineageEvidence(input: Uint8Array, expectedInput: unknown) {
  const bytes = snapshotBytes(input, 16 * 1024, 'Invalid lineage evidence bytes'),
    expected = Expected.parse(expectedInput);
  if (hashBytes(bytes) !== expected.sha256) throw Error('Lineage evidence digest differs');
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes),
    evidence = Evidence.parse(JSON.parse(text) as unknown);
  if (
    canonicalJson(evidence) !== text ||
    evidence.runId !== expected.runId ||
    evidence.attempt !== expected.attempt ||
    evidence.source !== expected.source ||
    evidence.mode !== expected.mode ||
    evidence.producerJobId !== expected.producerJobId ||
    evidence.verifierCommit !== expected.verifierCommit
  )
    throw Error('Lineage evidence context differs');
  return evidence;
}

/** Byte binding only. Signature, producer and current-parent authentication remain separate. */
export function matchLineageEvidenceFiles(
  evidenceInput: unknown,
  files: { subject?: Uint8Array; bundle?: Uint8Array },
) {
  const evidence = Evidence.parse(evidenceInput);
  if (evidence.mode === 'anchor') {
    if (files.subject !== undefined || files.bundle !== undefined)
      throw Error('Anchor carries unexpected signed evidence');
    return {};
  }
  const subject = snapshotBytes(files.subject, 16 * 1024, 'Invalid lineage file bytes'),
    bundle = snapshotBytes(files.bundle, 4 * 1024 * 1024, 'Invalid lineage file bytes');
  if (hashBytes(subject) !== evidence.subjectSha256 || hashBytes(bundle) !== evidence.bundleSha256)
    throw Error('Signed parent bytes differ');
  return { subject, bundle };
}

/** Compare a fresh v1 parent capture structurally; this does not authenticate its source. */
export function matchLineageEvidenceParent(evidenceInput: unknown, capturedInput: unknown) {
  const evidence = Evidence.parse(evidenceInput),
    captured = validateCapturedBaseline(capturedInput),
    proof = captured.proof;
  if (
    proof.repository !== evidence.repository ||
    proof.deploymentId !== evidence.parentDeploymentId ||
    proof.sourceCommit !== evidence.parentSource ||
    proof.tagDigest !== evidence.parentTagDigest ||
    hashValue({ ...proof, observedAt: null }) !== evidence.parentIdentityDigest
  )
    throw Error('Fresh parent identity differs');
  return canonicalJson(captured);
}
