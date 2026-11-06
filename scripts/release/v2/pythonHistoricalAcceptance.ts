import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { hashValue } from './identity';
import { CommitSchema, DigestSchema, InventorySchema } from './schema';
import {
  pythonPracticeHistoricalDeclaration,
  readPythonPracticeHistoricalPublicEvidence,
} from './pythonPracticeHistoricalAcceptance';
import {
  pythonOopHistoricalDeclaration,
  readPythonOopHistoricalPublicEvidence,
} from './pythonOopHistoricalAcceptance';

export const PYTHON_HISTORICAL_PATH = 'docs/quality/python-historical-acceptance.json';
const ReceiptSchema = z
  .object({
    schemaVersion: z.literal(1),
    migrationId: z.string(),
    courseId: z.enum(['python-practice', 'python-oop']),
    sourceCommit: CommitSchema,
    candidateReaderCommit: CommitSchema,
    declarationDigest: DigestSchema,
    inspectorId: z.string(),
    inspectedAt: z.iso.datetime(),
    inspectionSession: z.string(),
    scope: z.literal('bounded-historical-course-acceptance-not-role-receipts'),
    receiptDigest: DigestSchema,
  })
  .strict();
const pinnedReceipts = {
  'python-practice': 'e5d27e6fe7567dae5c80fdcfee2d49541915c016eb849414d9b1c6af79abc4a5',
  'python-oop': 'e09ad4ac955ed971c73a294f28f86766923548ab54f1f9e8c70aac6326a37c2b',
} as const;

/** 独立担当が原本を実照合した2案件だけ。自己再hashや準備宣言は認証にならない。 */
export function validatePythonHistoricalAcceptance(input: unknown) {
  const receipt = ReceiptSchema.parse(input);
  const { receiptDigest, ...unsigned } = receipt;
  if (receiptDigest !== pinnedReceipts[receipt.courseId] || hashValue(unsigned) !== receiptDigest)
    throw Error('Python historical independent receipt differs');
  const declaration =
    receipt.courseId === 'python-practice'
      ? pythonPracticeHistoricalDeclaration()
      : pythonOopHistoricalDeclaration();
  if (
    hashValue(declaration) !== receipt.declarationDigest ||
    declaration.sourceCommit !== receipt.sourceCommit
  )
    throw Error('Python historical inspected declaration differs');
  return { ...declaration, receipt, declaration, receiptDigest };
}

export function pythonHistoricalSummary(input: unknown) {
  const { receipt, declaration } = validatePythonHistoricalAcceptance(input);
  return {
    ...receipt,
    uiObservation: declaration.uiObservation,
    unverified: declaration.unverified,
    auditUnverified: 'auditUnverified' in declaration ? declaration.auditUnverified : [],
    requiredTechnicalChecks: ['runtime', 'usability', 'accessibility', 'persistence', 'delivery'],
  };
}
export const PythonHistoricalSummarySchema = ReceiptSchema.extend({
  uiObservation: z.unknown(),
  unverified: z.array(z.string()),
  auditUnverified: z.array(z.string()),
  requiredTechnicalChecks: z.array(z.string()),
}).superRefine((value, context) => {
  const { uiObservation, unverified, auditUnverified, requiredTechnicalChecks, ...receipt } = value;
  void uiObservation;
  void unverified;
  void auditUnverified;
  void requiredTechnicalChecks;
  try {
    if (hashValue(value) !== hashValue(pythonHistoricalSummary(receipt)))
      throw Error('Python historical summary scope differs');
  } catch {
    context.addIssue({ code: 'custom', message: 'Python historical summary scope differs' });
  }
});

/** CIでは私有原本を要求しない。認証済み元hash、公開Git、現原稿・台帳・撤回を毎回照合する。 */
export async function readVerifiedPythonHistoricalAcceptances(
  root: string,
  inventoryInput: unknown,
) {
  const inventory = InventorySchema.parse(inventoryInput);
  const enabled = inventory.courses.filter(
    (course) => course.publicationStatus === 'published' && course.id in pinnedReceipts,
  );
  if (!enabled.length) return [];
  let raw: string;
  try {
    raw = await readFile(path.join(root, PYTHON_HISTORICAL_PATH), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  if (Buffer.byteLength(raw) > 16 * 1024) throw Error('Python historical sidecar exceeds limit');
  const rows = z
    .array(ReceiptSchema)
    .length(2)
    .parse(JSON.parse(raw) as unknown);
  if (new Set(rows.map((row) => row.courseId)).size !== 2)
    throw Error('Duplicate Python historical receipt');
  for (const row of rows) validatePythonHistoricalAcceptance(row);
  const policy = z
    .object({ withdrawals: z.array(z.object({ courseId: z.string() })) })
    .parse(
      JSON.parse(
        await readFile(path.join(root, 'docs/quality/content-v2-receipts.json'), 'utf8'),
      ) as unknown,
    );
  const result = [];
  for (const course of enabled) {
    const receipt = rows.find((row) => row.courseId === course.id)!;
    if (policy.withdrawals.some((row) => row.courseId === course.id))
      throw Error('Python historical withdrawal blocks this fixed case');
    const { declaration } = validatePythonHistoricalAcceptance(receipt);
    if (course.id === 'python-practice') {
      await readPythonPracticeHistoricalPublicEvidence(root, inventory, declaration);
    } else {
      // 純粋helperや旧inventoryの指紋を現在の実Sourceの代わりに使わない。
      await readPythonOopHistoricalPublicEvidence(root, declaration, inventory);
    }
    result.push(receipt);
  }
  return result;
}
