import path from 'node:path';
import { parse } from 'yaml';
import { z } from 'zod';
import { canonicalJson } from '../../src/core/persistence/canonicalJson';
import { compileCourse } from '../content/compileCourse';
import { verifyContentReview } from '../content/verifyContentReview';
import { javascriptLearnerContentSha256 } from './javascriptLessonEvaluation';
import { hashDirectory, hashFile, sha256Text } from './releaseHashes';
import { CommitShaSchema, Sha256Schema } from './releaseSchema';
import {
  NextInputManifestSchema,
  compareNextLearningInputs,
  readNextLearningInput,
} from './nextInputHashes';
import type { NextReleaseApproval } from './nextReleaseSchema';

export const NEXT_ACCEPTANCE_LESSONS = [
  'next-ch01-l01',
  'next-ch02-l01',
  'next-ch02-l02',
  'next-ch03-l01',
  'next-ch03-l02',
  'next-ch04-l01',
  'next-ch04-l02',
  'next-ch05-l01',
  'next-ch06-l01',
] as const;
const Reference = z.object({ path: z.string().min(1), sha256: Sha256Schema }).strict();
const NativeWorkspace = z
  .object({
    workspaceId: z.string(),
    fixtureCount: z.number().int().positive(),
    limitMiB: z.number().int().positive(),
    peakBytes: z.number().int().positive(),
    maximumPids: z.number().int().positive().max(64),
    memoryEvents: z
      .object({ max: z.literal(0), oom: z.literal(0), oomKill: z.literal(0) })
      .strict(),
    zombies: z.literal(0),
  })
  .strict();

/** AIの教材読解、Pagesの静的操作、Localの実HTTP受入を分け、未確認項目を合格と記録しない。 */
export const NextReleaseEvidenceSchema = z
  .object({
    schemaVersion: z.literal(1),
    courseId: z.literal('next'),
    status: z.literal('preflight-passed-final-ci-required'),
    publicationApprovalReference: z.string().min(1),
    realHumanTrial: z.literal('unverified'),
    lowEndPhysicalDevice: z.literal('unverified'),
    cookieAuthenticationPersistence: z.literal('unsupported-deferred-issue-14'),
    verifiedSourceCommit: CommitShaSchema,
    canonicalDistSha256: Sha256Schema,
    candidateTreeSha256: Sha256Schema,
    draftCanonicalDistSha256: Sha256Schema,
    draftInput: NextInputManifestSchema,
    finalInput: NextInputManifestSchema,
    applicationSourceSha256: Sha256Schema,
    dependencyLockSha256: Sha256Schema,
    personas: z
      .array(
        z
          .object({
            role: z.enum(['learner', 'learning-design', 'runtime-publication']),
            actor: z.string().min(1),
            session: z.string().min(1),
            method: z.literal('independent-ai-source-review'),
            mandatoryFindings: z.literal(0),
            report: Reference,
            lessons: z
              .array(
                z.object({ lessonId: z.string(), learnerContentSha256: Sha256Schema }).strict(),
              )
              .length(9),
          })
          .strict(),
      )
      .length(3),
    nativePreflight: z
      .object({
        schemaVersion: z.literal(1),
        courseId: z.literal('next'),
        sourceCommit: CommitShaSchema,
        workflowRunId: z.string().regex(/^[1-9]\d*$/u),
        workflowRunAttempt: z.number().int().positive(),
        scope: z.literal('9教材81Fixtureのcheckpoint。通常UIの連続監視ではありません。'),
        workspaces: z.array(NativeWorkspace).length(9),
      })
      .strict(),
    nativeEvidence: Reference,
    pagesStaticStudy: z
      .object({
        sourceCommit: CommitShaSchema,
        canonicalDistSha256: Sha256Schema,
        viewports: z.tuple([z.literal(1280), z.literal(390)]),
        lessonIds: z.array(z.string()).length(9),
        axeViolations: z.literal(0),
        localExecutionRequests: z.literal(0),
        serverExecution: z.literal('not-provided-on-pages'),
        progressRoundTrip: z.literal('passed'),
        localHandoff: z.literal('passed'),
        report: Reference,
      })
      .strict(),
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
        referenceSha256s: z.array(Sha256Schema).length(5),
      })
      .strict(),
  })
  .strict();
export type NextReleaseEvidence = z.infer<typeof NextReleaseEvidenceSchema>;

/** 独立照合の宣言自体を除いた全入力・観測・原本参照を固定する。 */
export function hashNextReleaseEvidence(record: NextReleaseEvidence): string {
  return sha256Text(
    canonicalJson(
      Object.fromEntries(Object.entries(record).filter(([key]) => key !== 'independenceReview')),
    ),
  );
}

/** S→Pで許可した公開metadata以外の変更、教材の欠落、未承認資源への置換を拒否する。 */
export function validateNextReleaseEvidence(
  input: unknown,
  learnerHashes: ReadonlyMap<string, string>,
) {
  const record = NextReleaseEvidenceSchema.parse(input);
  compareNextLearningInputs(record.draftInput, record.finalInput);
  const expected = [...NEXT_ACCEPTANCE_LESSONS].sort();
  const review = record.independenceReview;
  const references = [
    ...record.personas.map(({ report }) => report.sha256),
    record.nativeEvidence.sha256,
    record.pagesStaticStudy.report.sha256,
  ].sort();
  if (
    review.reviewer === record.author ||
    !record.personas.some(
      ({ actor, role }) => actor === review.reviewer && role === 'runtime-publication',
    ) ||
    review.sourceCommit !== record.verifiedSourceCommit ||
    review.canonicalDistSha256 !== record.canonicalDistSha256 ||
    review.productTreeSha256 !== record.candidateTreeSha256 ||
    review.evidenceSha256 !== hashNextReleaseEvidence(record) ||
    new Set(references).size !== 5 ||
    canonicalJson([...review.referenceSha256s].sort()) !== canonicalJson(references) ||
    record.nativeEvidence.sha256 !==
      sha256Text(JSON.stringify(record.nativePreflight, null, 2) + '\n')
  )
    throw new Error('Nextの独立原本照合/source/artifact/証拠全体bindingが一致しません');
  if (
    record.verifiedSourceCommit !== record.finalInput.sourceCommit ||
    record.nativePreflight.sourceCommit !== record.draftInput.sourceCommit ||
    record.pagesStaticStudy.sourceCommit !== record.verifiedSourceCommit ||
    record.pagesStaticStudy.canonicalDistSha256 !== record.canonicalDistSha256 ||
    canonicalJson([...record.pagesStaticStudy.lessonIds].sort()) !== canonicalJson(expected)
  )
    throw new Error('NextのLocal/Pages/source/artifact bindingが一致しません');
  for (const key of ['role', 'actor', 'session'] as const)
    if (new Set(record.personas.map((persona) => persona[key])).size !== 3)
      throw new Error(`Nextの独立3ペルソナが重複しています: ${key}`);
  if (
    new Set(record.personas.map(({ report }) => report.sha256)).size !== 3 ||
    record.personas.some(({ actor }) => actor === record.author)
  )
    throw new Error('Nextの作者と独立reviewer/原本が分離されていません');
  for (const persona of record.personas) {
    if (
      canonicalJson(persona.lessons.map(({ lessonId }) => lessonId).sort()) !==
        canonicalJson(expected) ||
      persona.lessons.some(
        ({ lessonId, learnerContentSha256 }) =>
          learnerHashes.get(lessonId) !== learnerContentSha256,
      )
    )
      throw new Error('Nextの全9教材/可視入力review bindingが一致しません');
  }
  const groups: Readonly<Record<string, readonly [number, number]>> = {
    'next-ch01-l01-e01': [6, 512],
    'next-ch02-l01-e01': [8, 576],
    'next-ch02-l02-e01': [9, 512],
    'next-ch03-l01-e01': [8, 576],
    'next-ch03-l02-e01': [9, 576],
    'next-ch04-l01-e01': [9, 512],
    'next-ch04-l02-e01': [9, 512],
    'next-ch05-l01-e01': [11, 896],
    'next-ch06-l01-e01': [12, 896],
  };
  if (new Set(record.nativePreflight.workspaces.map(({ workspaceId }) => workspaceId)).size !== 9)
    throw new Error('Nextの独立9Workspaceの実測が不足しています');
  for (const item of record.nativePreflight.workspaces) {
    const limits = groups[item.workspaceId];
    if (
      !limits ||
      item.fixtureCount !== limits[0] ||
      item.limitMiB !== limits[1] ||
      item.peakBytes > item.limitMiB * 1024 ** 2
    )
      throw new Error(`Nextの81Fixture/承認資源/実測値が不正です: ${item.workspaceId}`);
  }
  return record;
}

/** 記録の自己整合だけでは承認せず、固定Git入力と現在教材・依存を再計算して照合する。 */
export async function verifyNextQualityEvidence(
  root: string,
  approval: NextReleaseApproval,
  sources: ReadonlyMap<string, string>,
): Promise<NextReleaseEvidence> {
  const compiled = await compileCourse(path.join(root, 'content/next'));
  const { runtime } = compiled;
  const lessons = runtime.phases.flatMap(({ chapters }) =>
    chapters.flatMap(({ lessons }) => lessons),
  );
  const hashes = new Map(
    lessons.map((lesson) => [
      lesson.id,
      javascriptLearnerContentSha256(lesson, runtime.glossary, compiled.assets),
    ]),
  );
  const record = validateNextReleaseEvidence(
    parse(sources.get('technicalAcceptance') ?? ''),
    hashes,
  );
  if (
    record.verifiedSourceCommit !== approval.verifiedSourceCommit ||
    record.canonicalDistSha256 !== approval.canonicalDistSha256 ||
    record.candidateTreeSha256 !== approval.candidateTreeSha256 ||
    runtime.publicationStatus !== 'published' ||
    lessons.length !== 9
  )
    throw new Error('Nextの品質記録と公開candidateが一致しません');
  const [draft, final] = await Promise.all([
    readNextLearningInput(root, record.draftInput.sourceCommit),
    readNextLearningInput(root, record.finalInput.sourceCommit),
  ]);
  if (
    canonicalJson(draft) !== canonicalJson(record.draftInput) ||
    canonicalJson(final) !== canonicalJson(record.finalInput)
  )
    throw new Error('Nextの入力manifestが固定Git commitからの再計算と一致しません');
  if (
    (await hashDirectory(path.join(root, 'src'))) !== record.applicationSourceSha256 ||
    (await hashFile(path.join(root, 'package-lock.json'))) !== record.dependencyLockSha256
  )
    throw new Error('Nextの学習画面/固定依存が変更されています');
  await verifyContentReview({
    courseRoot: path.join(root, 'content/next'),
    publicRoot: path.join(root, 'public'),
    courseId: 'next',
    reviewPath: path.join(root, 'docs/quality/content-review-next.yaml'),
  });
  if (
    (parse(sources.get('contentReview') ?? '') as { releaseStatus?: unknown }).releaseStatus !==
    'approved'
  )
    throw new Error('Nextの教材レビュー台帳が公開承認済みではありません');
  return record;
}
