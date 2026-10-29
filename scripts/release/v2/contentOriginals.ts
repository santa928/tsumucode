import { lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { ContentReceiptSchema, ContentWithdrawalSchema } from './content';
import { InventorySchema, CommitSchema } from './schema';
import { hashBytes, hashValue } from './identity';
import { readInventoryAtSource } from './sourceInventory';
const MetadataSchema = ContentReceiptSchema.omit({
  originalDigest: true,
  receiptDigest: true,
  originalsCheckedBy: true,
});
const ReferenceSchema = z
  .object({
    path: z.string().min(1),
    sha256: z.string().regex(/^[a-f0-9]{64}$/u),
    bytes: z
      .number()
      .int()
      .positive()
      .max(4 * 1024 * 1024),
  })
  .strict();
export const ContentInspectionRequestSchema = z
  .object({
    reference: ReferenceSchema,
    metadata: MetadataSchema,
    inspectorId: z.string().trim().min(1),
  })
  .strict();
const OriginalSchema = MetadataSchema.extend({
  observationKind: z.literal('independent-content-observation'),
  unresolvedCritical: z.literal(0),
  unresolvedImportant: z.literal(0),
  requiredUnconfirmed: z.literal(0),
  privateNotes: z.string().optional(),
}).strict();
/** Local authorized independent inspector only. Bytes/scope are checked here; actual learner observation remains an independent review, never an automatic test claim. */
export async function inspectContentOriginal(
  privateRoot: string,
  referenceInput: unknown,
  metadataInput: unknown,
  inspectorInput: string,
  sourceInput: unknown,
) {
  const reference = ReferenceSchema.parse(referenceInput),
    metadata = MetadataSchema.parse(metadataInput),
    inspector = z.string().trim().min(1).parse(inspectorInput);
  if (
    inspector === metadata.authorId ||
    inspector === metadata.actorId ||
    metadata.authorId === metadata.actorId
  )
    throw Error('Independent original inspector required');
  const source = z
    .object({ sourceCommit: CommitSchema, inventory: InventorySchema })
    .strict()
    .parse(sourceInput);
  const lesson = source.inventory.courses
    .find((course) => course.id === metadata.courseId)
    ?.lessons.find((lesson) => lesson.id === metadata.lessonId);
  if (
    source.sourceCommit !== metadata.sourceCommit ||
    lesson?.learnerDigest !== metadata.learnerDigest
  )
    throw Error('Original source inventory differs');
  const root = await realpath(privateRoot),
    file = path.resolve(root, reference.path);
  if (
    path.isAbsolute(reference.path) ||
    !file.startsWith(root + path.sep) ||
    (await realpath(file)) !== file ||
    !(await lstat(file)).isFile()
  )
    throw Error('Original must be an ordinary private-root file');
  const size = (await lstat(file)).size;
  if (size !== reference.bytes || size > 4 * 1024 * 1024) throw Error('Original bytes differ');
  const bytes = await readFile(file);
  if (hashBytes(bytes) !== reference.sha256) throw Error('Original digest differs');
  const original = OriginalSchema.parse(
    JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown,
  );
  const {
    observationKind,
    unresolvedCritical,
    unresolvedImportant,
    requiredUnconfirmed,
    privateNotes,
    ...actualMetadata
  } = original;
  void observationKind;
  void unresolvedCritical;
  void unresolvedImportant;
  void requiredUnconfirmed;
  void privateNotes;
  if (hashValue(actualMetadata) !== hashValue(metadata))
    throw Error('Original source/role/method/scope differs');
  if (
    (metadata.role === 'content' &&
      (metadata.method !== 'source-review' || !metadata.examplesExecuted)) ||
    (metadata.role !== 'content' && metadata.method === 'source-review')
  )
    throw Error('Wrong independent observation method');
  const unsigned = { ...metadata, originalDigest: reference.sha256, originalsCheckedBy: inspector };
  return ContentReceiptSchema.parse({ ...unsigned, receiptDigest: hashValue(unsigned) });
}
/** CI consumes only minimal independently inspected sidecars, never private original directories. */
export async function readContentPolicyFile(file: string) {
  let raw: string;
  try {
    raw = await readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT')
      return { schemaVersion: 1 as const, receipts: [], withdrawals: [] };
    throw error;
  }
  if (Buffer.byteLength(raw) > 4 * 1024 * 1024) throw Error('Content sidecar exceeds limit');
  const value = z
    .object({
      schemaVersion: z.literal(1),
      receipts: z.array(ContentReceiptSchema),
      withdrawals: z.array(ContentWithdrawalSchema).default([]),
    })
    .strict()
    .parse(JSON.parse(raw) as unknown);
  for (const receipt of value.receipts) {
    const { receiptDigest, ...unsigned } = receipt;
    if (receiptDigest !== hashValue(unsigned)) throw Error('Content receipt digest differs');
  }
  return value;
}
export async function readContentReceiptFile(file: string) {
  const policy = await readContentPolicyFile(file);
  if (policy.withdrawals.length)
    throw Error('Content policy includes withdrawals; receipt-only reading is forbidden');
  return policy.receipts;
}

/** Every declaration refers to an actual archived source, including historical withdrawal scope. */
export async function readVerifiedContentPolicy(root: string, file: string) {
  const policy = await readContentPolicyFile(file);
  const declarations = [...policy.receipts, ...policy.withdrawals];
  for (const key of new Set(declarations.map((row) => row.sourceCommit + '/' + row.courseId))) {
    const [sourceCommit, courseId] = key.split('/');
    const source = await readInventoryAtSource(root, sourceCommit!, courseId!);
    for (const row of declarations.filter(
      (row) => row.sourceCommit === sourceCommit && row.courseId === courseId,
    )) {
      const lesson = source.inventory.courses
        .find((course) => course.id === row.courseId)
        ?.lessons.find((lesson) => lesson.id === row.lessonId);
      if (lesson?.learnerDigest !== row.learnerDigest) throw Error('Content policy source differs');
    }
  }
  return policy;
}
