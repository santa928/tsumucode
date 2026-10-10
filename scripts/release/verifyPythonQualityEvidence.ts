import path from 'node:path';
import { parse } from 'yaml';
import { z } from 'zod';
import { compileCourse, loadAuthoringCourse } from '../content/compileCourse';
import { verifyContentReview } from '../content/verifyContentReview';
import { hashDirectory, hashFile, sha256Text } from './releaseHashes';
import { canonicalJson } from '../../src/core/persistence/canonicalJson';
import { CommitShaSchema, Sha256Schema } from './releaseSchema';
import type { PythonReleaseApproval } from './pythonReleaseSchema';

const Reference = z.object({ path: z.string().min(1), sha256: Sha256Schema }).strict();
/** 初公開の1教材を実Worker・3観点レビュー・固定配布物へ結び付け、実人/物理端末と区別する。 */
export const PythonReleaseEvidenceSchema = z
  .object({
    schemaVersion: z.literal(1),
    courseId: z.literal('python-basics'),
    status: z.literal('preflight-passed-final-ci-required'),
    publicationApprovalReference: z.literal('owner:2026-10-10T14:24:29.529277+00:00:いいよ'),
    realHumanTrial: z.literal('unverified'),
    lowEndPhysicalDevice: z.literal('unverified'),
    verifiedSourceCommit: CommitShaSchema,
    canonicalDistSha256: Sha256Schema,
    candidateTreeSha256: Sha256Schema,
    applicationSourceSha256: Sha256Schema,
    dependencyLockSha256: Sha256Schema,
    vendorSha256: Sha256Schema,
    personas: z
      .array(
        z
          .object({
            role: z.enum(['lesson', 'usability', 'runtime-publication']),
            actor: z.string().min(1),
            method: z.literal('independent-ai-source-review'),
            mandatoryFindings: z.literal(0),
            sourceCommit: CommitShaSchema,
            canonicalDistSha256: Sha256Schema,
            report: Reference,
          })
          .strict(),
      )
      .length(3),
    browserPreflight: z
      .array(
        z
          .object({
            browser: z.enum(['chromium', 'firefox', 'webkit']),
            status: z.literal('passed'),
            sourceCommit: CommitShaSchema,
            canonicalDistSha256: Sha256Schema,
            report: Reference,
          })
          .strict(),
      )
      .length(3),
    fixtureIds: z.array(z.string()).length(10),
    pyodideVersion: z.literal('314.0.7'),
    pythonVersion: z.literal('3.14.2'),
    capabilityPreflight: Reference,
    uiPreflight: Reference,
    licenseNoticesAndSourceOffer: z.literal('bundled-and-checked'),
    homePathReadingCoreRequests: z.literal(0),
    axeViolations: z.literal(0),
    author: z.string().min(1),
    privateOriginalsChecked: z.literal(true),
    independenceReview: z
      .object({
        reviewer: z.string().min(1),
        status: z.literal('approved'),
        sourceCommit: CommitShaSchema,
        canonicalDistSha256: Sha256Schema,
        productTreeSha256: Sha256Schema,
        evidenceSha256: Sha256Schema,
        referenceSha256s: z.array(Sha256Schema).length(8),
      })
      .strict(),
  })
  .strict();

export type PythonReleaseEvidence = z.infer<typeof PythonReleaseEvidenceSchema>;

/** 独立照合のreceipt自体を除いた記録全体を固定する。 */
export function hashPythonReleaseEvidence(record: PythonReleaseEvidence): string {
  return sha256Text(
    canonicalJson(
      Object.fromEntries(Object.entries(record).filter(([key]) => key !== 'independenceReview')),
    ),
  );
}

/** 私有原本の公開を求めず、別reviewerによる全原本照合のreceiptと公開入力を結び付ける。 */
export function validatePythonReleaseEvidence(input: unknown): PythonReleaseEvidence {
  const record = PythonReleaseEvidenceSchema.parse(input);
  const review = record.independenceReview;
  const references = [
    ...record.personas.map(({ report }) => report.sha256),
    ...record.browserPreflight.map(({ report }) => report.sha256),
    record.capabilityPreflight.sha256,
    record.uiPreflight.sha256,
  ].sort();
  if (
    review.reviewer === record.author ||
    !record.personas.some(
      ({ actor, role }) => actor === review.reviewer && role === 'runtime-publication',
    ) ||
    review.sourceCommit !== record.verifiedSourceCommit ||
    review.canonicalDistSha256 !== record.canonicalDistSha256 ||
    review.productTreeSha256 !== record.candidateTreeSha256 ||
    review.evidenceSha256 !== hashPythonReleaseEvidence(record) ||
    new Set(references).size !== 8 ||
    canonicalJson([...review.referenceSha256s].sort()) !== canonicalJson(references)
  )
    throw new Error('Pythonの独立原本照合/source/artifact/証拠全体bindingが一致しません');
  if (
    new Set(record.personas.map(({ role }) => role)).size !== 3 ||
    new Set(record.personas.map(({ actor }) => actor)).size !== 3 ||
    new Set(record.browserPreflight.map(({ browser }) => browser)).size !== 3 ||
    record.personas.some(
      ({ actor, sourceCommit, canonicalDistSha256 }) =>
        actor === record.author ||
        sourceCommit !== record.verifiedSourceCommit ||
        canonicalDistSha256 !== record.canonicalDistSha256,
    ) ||
    record.browserPreflight.some(
      ({ sourceCommit, canonicalDistSha256 }) =>
        sourceCommit !== record.verifiedSourceCommit ||
        canonicalDistSha256 !== record.canonicalDistSha256,
    )
  )
    throw new Error('Pythonの独立review/実browserの公開入力bindingが一致しません');
  return record;
}

/** 手動記録を固定Git入力と公開candidateのhashへ照合し、他Courseや旧実行器への置換を拒否する。 */
export async function verifyPythonQualityEvidence(
  root: string,
  approval: PythonReleaseApproval,
  sources: ReadonlyMap<string, string>,
) {
  const record = validatePythonReleaseEvidence(parse(sources.get('technicalAcceptance') ?? ''));
  const compiled = await compileCourse(path.join(root, 'content/python-basics'));
  const lessons = compiled.runtime.phases.flatMap(({ chapters }) =>
    chapters.flatMap(({ lessons }) => lessons),
  );
  if (
    record.verifiedSourceCommit !== approval.verifiedSourceCommit ||
    record.canonicalDistSha256 !== approval.canonicalDistSha256 ||
    record.candidateTreeSha256 !== approval.candidateTreeSha256 ||
    compiled.runtime.publicationStatus !== 'published' ||
    lessons.length !== 1
  )
    throw new Error('Pythonの公開candidate/独立レビュー/実Workerのbindingが一致しません');
  const authoring = await loadAuthoringCourse(path.join(root, 'content/python-basics'));
  const expectedFixtures = authoring.exercises[0]?.fixtures.map(({ id }) => id).sort();
  if (JSON.stringify([...record.fixtureIds].sort()) !== JSON.stringify(expectedFixtures))
    throw new Error('Python実Pyodideの10Fixtureが一致しません');
  if (
    (await hashDirectory(path.join(root, 'src'))) !== record.applicationSourceSha256 ||
    (await hashFile(path.join(root, 'package-lock.json'))) !== record.dependencyLockSha256 ||
    (await hashDirectory(path.join(root, 'vendor/python/314.0.7'))) !== record.vendorSha256
  )
    throw new Error('Pythonの学習画面/固定依存/配布物が変更されています');
  await verifyContentReview({
    courseRoot: path.join(root, 'content/python-basics'),
    publicRoot: path.join(root, 'public'),
    courseId: 'python-basics',
    reviewPath: path.join(root, 'docs/quality/content-review-python-basics.yaml'),
  });
  if (
    (parse(sources.get('contentReview') ?? '') as { releaseStatus?: unknown }).releaseStatus !==
    'approved'
  )
    throw new Error('Python教材レビューが公開承認済みではありません');
  return record;
}
