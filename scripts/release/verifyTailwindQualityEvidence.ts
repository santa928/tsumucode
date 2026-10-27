import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';
import { z } from 'zod';
import { canonicalJson } from '../../src/core/persistence/canonicalJson';
import { compileCourse } from '../content/compileCourse';
import { verifyContentReview } from '../content/verifyContentReview';
import {
  DraftCandidateBindingSchema,
  DraftCodeReviewReceiptSchema,
  DraftCourseQualityRecordSchema,
  DraftQualityReferenceSchema,
} from './draftCourseQualitySchema';
import { hashFile, sha256Text } from './releaseHashes';
import { CommitShaSchema, Sha256Schema } from './releaseSchema';
import {
  hashTailwindPublicationInputs,
  normalizeTailwindFrontend,
} from './tailwindPublicationInputs';
import type { TailwindReleaseApproval } from './tailwindReleaseSchema';

/** 原本を公開せず草稿の実測と公開候補を別々に固定する。実人・物理端末の測定へ拡張しない。 */
export const TailwindReleaseEvidenceSchema = z
  .object({
    schemaVersion: z.literal(1),
    courseId: z.literal('tailwind'),
    status: z.literal('preflight-passed-final-ci-required'),
    verifiedSourceCommit: CommitShaSchema,
    canonicalDistSha256: Sha256Schema,
    candidateTreeSha256: Sha256Schema,
    publicationApprovalReference: z
      .string()
      .trim()
      .min(1)
      .refine((value) => value !== 'draft'),
    computerUseApprovalReference: z
      .string()
      .trim()
      .min(1)
      .refine((value) => value !== 'draft'),
    realHumanTrial: z.literal('unverified'),
    lowEndPhysicalDevice: z.literal('unverified'),
    author: z.string().trim().min(1),
    draftCandidate: DraftCandidateBindingSchema,
    draftQualityRecordSha256: Sha256Schema,
    technicalVerification: DraftQualityReferenceSchema,
    draftOriginalsReview: DraftQualityReferenceSchema,
    codeReviews: z.array(DraftCodeReviewReceiptSchema).length(3),
    normalizedLearningInputSha256: Sha256Schema,
    independenceReview: z
      .object({
        reviewer: z.string().trim().min(1),
        status: z.literal('approved'),
        sourceCommit: CommitShaSchema,
        productTreeSha256: Sha256Schema,
        evidenceSha256: Sha256Schema,
        rawReport: DraftQualityReferenceSchema,
        checkedReferences: z.array(DraftQualityReferenceSchema).length(5),
      })
      .strict(),
  })
  .strict();
export type TailwindReleaseEvidence = z.infer<typeof TailwindReleaseEvidenceSchema>;

/** 独立照合receipt自身だけを除き、公開記録全体のhashを固定する。 */
export function hashTailwindReleaseEvidence(record: TailwindReleaseEvidence): string {
  return sha256Text(
    canonicalJson(
      Object.fromEntries(Object.entries(record).filter(([key]) => key !== 'independenceReview')),
    ),
  );
}

/** 自己承認と別候補へのreceipt付替えを拒否する。 */
export function validateTailwindReleaseEvidence(input: unknown): TailwindReleaseEvidence {
  const record = TailwindReleaseEvidenceSchema.parse(input);
  const review = record.independenceReview;
  const requiredReferences = [
    record.technicalVerification,
    record.draftOriginalsReview,
    ...record.codeReviews.map(({ rawReport }) => rawReport),
  ];
  const sorted = (references: readonly { path: string; sha256: string }[]) =>
    [...references].sort((left, right) => left.path.localeCompare(right.path));
  if (
    new Set(record.codeReviews.map(({ actor }) => actor)).size !== 3 ||
    new Set(record.codeReviews.map(({ role }) => role)).size !== 3 ||
    record.codeReviews.some(
      (code) =>
        code.courseId !== 'tailwind' ||
        code.actor === record.author ||
        code.sourceCommit !== record.verifiedSourceCommit ||
        code.productTreeSha256 !== record.candidateTreeSha256,
    ) ||
    !record.codeReviews.some(({ actor }) => actor === review.reviewer) ||
    new Set(requiredReferences.map(({ path }) => path)).size !== requiredReferences.length ||
    canonicalJson(sorted(review.checkedReferences)) !== canonicalJson(sorted(requiredReferences))
  )
    throw new Error('Tailwindの最新3名review/独立原本照合の全参照が一致しません');
  if (
    review.reviewer === record.author ||
    review.sourceCommit !== record.verifiedSourceCommit ||
    review.productTreeSha256 !== record.candidateTreeSha256 ||
    review.evidenceSha256 !== hashTailwindReleaseEvidence(record)
  )
    throw new Error('Tailwindの独立原本照合/source/候補全体bindingが一致しません');
  return record;
}

/** 公開candidateは5教材の実測を維持し、HTML/CSS直後の任意Pathと品質承認を要求する。 */
export async function verifyTailwindQualityEvidence(
  root: string,
  approval: TailwindReleaseApproval,
  sources: ReadonlyMap<string, string>,
) {
  const record = validateTailwindReleaseEvidence(parse(sources.get('technicalAcceptance') ?? ''));
  if (
    record.verifiedSourceCommit !== approval.verifiedSourceCommit ||
    record.canonicalDistSha256 !== approval.canonicalDistSha256 ||
    record.candidateTreeSha256 !== approval.candidateTreeSha256
  )
    throw new Error('Tailwindの公開承認と受入候補が一致しません');
  const qualityPath = path.join(root, 'docs/quality/tailwind-release-preparation.yaml');
  const draft = DraftCourseQualityRecordSchema.parse(parse(await readFile(qualityPath, 'utf8')));
  if (
    draft.courseId !== 'tailwind' ||
    draft.status !== 'ready-for-technical-verification' ||
    draft.originalsReview === null ||
    canonicalJson(draft.originalsReview) !== canonicalJson(record.draftOriginalsReview) ||
    draft.codeReviews.length !== 3 ||
    draft.observations.length !== 4 ||
    canonicalJson(draft.candidate) !== canonicalJson(record.draftCandidate) ||
    (await hashFile(qualityPath)) !== record.draftQualityRecordSha256
  )
    throw new Error('Tailwindの実測済み草稿受入のbindingが一致しません');
  const [originalInput, finalInput, currentInput] = await Promise.all([
    hashTailwindPublicationInputs(root, record.draftCandidate.sourceCommit),
    hashTailwindPublicationInputs(root, record.verifiedSourceCommit),
    hashTailwindPublicationInputs(root),
  ]);
  if (
    [originalInput, finalInput, currentInput].some(
      (value) => value !== record.normalizedLearningInputSha256,
    )
  )
    throw new Error('Tailwindの受入後に教材/実行/画面/配布入力が変更されています');
  const frontend = await readFile(path.join(root, 'content/learning-paths/frontend.yaml'), 'utf8');
  if (normalizeTailwindFrontend(frontend) === frontend)
    throw new Error('Tailwindのrecommended Path登録がありません');
  const compiled = await compileCourse(path.join(root, 'content/tailwind'));
  const lessons = compiled.runtime.phases.flatMap(({ chapters }) =>
    chapters.flatMap(({ lessons }) => lessons),
  );
  if (compiled.runtime.publicationStatus !== 'published' || lessons.length !== 5)
    throw new Error('Tailwind公開は固定5教材を必要とします');
  await verifyContentReview({
    courseRoot: path.join(root, 'content/tailwind'),
    publicRoot: path.join(root, 'public'),
    courseId: 'tailwind',
    reviewPath: path.join(root, 'docs/quality/content-review-tailwind.yaml'),
  });
  if (
    (parse(sources.get('contentReview') ?? '') as { releaseStatus?: unknown }).releaseStatus !==
    'approved'
  )
    throw new Error('Tailwind内容レビューが公開承認済みではありません');
  return record;
}
