import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'yaml';
import { z } from 'zod';
import { compileCourse } from '../content/compileCourse';
import { verifyContentReview } from '../content/verifyContentReview';
import { canonicalJson } from '../../src/core/persistence/canonicalJson';
import { javascriptLearnerContentSha256 } from './javascriptLessonEvaluation';
import { hashDirectory, hashFile } from './releaseHashes';
import { CommitShaSchema, Sha256Schema } from './releaseSchema';
import {
  TypescriptAcceptanceSchema,
  TypescriptPerformanceEvidenceSchema,
} from './typescriptAcceptanceSchema';
import {
  checkTypescriptPersonaCoverage,
  verifyTypescriptPerformanceImports,
  checkTypescriptPerformance,
  TYPESCRIPT_ACCEPTANCE_LESSONS,
} from './verifyTypescriptAcceptance';
import {
  TypescriptInputManifestSchema,
  readTypescriptLearningInput,
  compareTypescriptLearningInputs,
} from './typescriptInputHashes';
import { assertJavascriptFinalQualityWorkflow } from './verifyJavascriptQualityEvidence';
import type { TypescriptReleaseApproval } from './typescriptReleaseSchema';

const BrowserEvidenceSchema = z
  .object({
    engine: z.enum(['chromium', 'firefox', 'webkit']),
    passedTests: z.literal(2),
    failedTests: z.literal(0),
    skippedTests: z.literal(0),
    reportSha256: Sha256Schema,
    testSourceSha256: Sha256Schema,
    normalizedLearningInputSha256: Sha256Schema,
  })
  .strict();

/** 公開用の照合記録。private原文をActionsが読んだと扱わず、独立照合者の宣言を要求する。 */
export const TypescriptReleaseEvidenceSchema = z
  .object({
    schemaVersion: z.literal(1),
    courseId: z.literal('typescript'),
    status: z.literal('preflight-passed-final-ci-required'),
    verifiedSourceCommit: CommitShaSchema,
    canonicalDistSha256: Sha256Schema,
    candidateTreeSha256: Sha256Schema,
    draftCanonicalDistSha256: Sha256Schema,
    normalizedLearningInputSha256: Sha256Schema,
    draftInput: TypescriptInputManifestSchema,
    finalInput: TypescriptInputManifestSchema,
    acceptance: TypescriptAcceptanceSchema,
    acceptanceSha256: Sha256Schema,
    lazyGzipBytes: z.number().int().positive().max(2_500_000),
    performanceEvidence: z
      .array(
        z
          .object({
            kind: z.enum(['cold', 'warm', 'simple', 'dom', 'async', 'busy', 'stop']),
            raw: z.string().min(1),
          })
          .strict(),
      )
      .length(7),
    browserMatrix: z.array(BrowserEvidenceSchema).length(3),
    independenceReview: z
      .object({
        author: z.literal('root'),
        reviewer: z.string().min(1),
        decision: z.literal('approved'),
        privateOriginalsChecked: z.literal(true),
        productTreeSha256: Sha256Schema,
        evidenceSha256: Sha256Schema,
        evaluationReceiptSha256s: z.array(Sha256Schema).min(3),
      })
      .strict(),
  })
  .strict();
export type TypescriptReleaseEvidence = z.infer<typeof TypescriptReleaseEvidenceSchema>;

/** 独立宣言を除いた全証拠とSource/Artifactを固定する。hash再計算だけで旧宣言を流用させない。 */
export function hashTypescriptReleaseEvidence(input: TypescriptReleaseEvidence): string {
  const payload = Object.fromEntries(
    Object.entries(input).filter(([key]) => key !== 'independenceReview'),
  );
  return createHash('sha256').update(canonicalJson(payload)).digest('hex');
}

/** 固定15教材/3役/7指標/3 Engineと独立確認を照合する。人・実機の保証へ変換しない。 */
export function validateTypescriptReleaseEvidence(
  input: unknown,
  learnerHashes: ReadonlyMap<string, string>,
): TypescriptReleaseEvidence {
  const record = TypescriptReleaseEvidenceSchema.parse(input);
  compareTypescriptLearningInputs(record.draftInput, record.finalInput);
  if (
    createHash('sha256').update(canonicalJson(record.acceptance)).digest('hex') !==
      record.acceptanceSha256 ||
    record.verifiedSourceCommit !== record.finalInput.sourceCommit ||
    record.acceptance.sourceCommit !== record.draftInput.sourceCommit ||
    record.acceptance.artifactSha256 !== record.draftCanonicalDistSha256 ||
    record.normalizedLearningInputSha256 !== record.draftInput.normalizedInputSha256 ||
    record.independenceReview.evidenceSha256 !== hashTypescriptReleaseEvidence(record) ||
    record.independenceReview.author === record.independenceReview.reviewer ||
    record.independenceReview.productTreeSha256 !== record.candidateTreeSha256 ||
    record.acceptance.personas.some(({ actors }) =>
      actors.includes(record.independenceReview.reviewer),
    )
  )
    throw new Error('TS公開前の入力/独立確認bindingが一致しません');
  checkTypescriptPersonaCoverage(record.acceptance, learnerHashes);
  if (new Set(record.performanceEvidence.map(({ kind }) => kind)).size !== 7)
    throw new Error('TS性能指標が重複しています');
  for (const reference of record.performanceEvidence) {
    const declared = record.acceptance.performance.find(({ kind }) => kind === reference.kind)!;
    const metric = TypescriptPerformanceEvidenceSchema.parse(JSON.parse(reference.raw));
    if (
      metric.kind !== reference.kind ||
      createHash('sha256').update(reference.raw).digest('hex') !== declared.rawEvidence.sha256 ||
      canonicalJson(metric.environment) !== canonicalJson(record.acceptance.environment) ||
      ((metric.sourceCommit !== record.acceptance.sourceCommit ||
        metric.manifestSha256 !== record.acceptance.manifestSha256) &&
        !declared.reuseReason)
    )
      throw new Error('TSの公開性能記録が検査済みrawと一致しません');
    checkTypescriptPerformance(metric, metric.samplesMs);
  }
  const receipts = record.acceptance.personas.flatMap(({ evaluations }) =>
    evaluations.map(({ sha256 }) => sha256),
  );
  if (
    new Set(receipts).size !== receipts.length ||
    canonicalJson([...receipts].sort()) !==
      canonicalJson([...record.independenceReview.evaluationReceiptSha256s].sort())
  )
    throw new Error('TS評価原記録の限定review bindingが一致しません');
  if (
    new Set(record.browserMatrix.map(({ engine }) => engine)).size !== 3 ||
    record.browserMatrix.some(
      ({ normalizedLearningInputSha256 }) =>
        normalizedLearningInputSha256 !== record.normalizedLearningInputSha256,
    )
  )
    throw new Error('TSの3 Engine証拠に欠落または入力の不一致があります');
  return record;
}

/** 承認済みProductと公開記録を実体で照合し、最終全site CIの省略を拒否する。 */
export async function verifyTypescriptQualityEvidence(
  repositoryRoot: string,
  approval: TypescriptReleaseApproval,
  sources: ReadonlyMap<string, string>,
): Promise<TypescriptReleaseEvidence> {
  const root = path.resolve(repositoryRoot);
  const compiled = await compileCourse(path.join(root, 'content/typescript'));
  const course = compiled.runtime;
  const chapters = course.phases.flatMap(({ chapters }) => chapters);
  const lessons = chapters.flatMap(({ lessons }) => lessons);
  if (
    course.publicationStatus !== 'published' ||
    course.phases.length !== 2 ||
    chapters.length !== 6 ||
    lessons.length !== 15 ||
    lessons.filter(({ kind }) => kind === 'standard').length !== 12 ||
    lessons.filter(({ kind }) => kind === 'guided-project').length !== 3 ||
    lessons.some(({ kind }) => kind === 'capstone') ||
    lessons.reduce((sum, { estimatedMinutes }) => sum + estimatedMinutes, 0) !== 320 ||
    canonicalJson(lessons.map(({ id }) => id)) !== canonicalJson(TYPESCRIPT_ACCEPTANCE_LESSONS)
  )
    throw new Error('TSのpublished/15/12+3/6/2/320契約が一致しません');
  const hashes = new Map(
    lessons.map((lesson) => [
      lesson.id,
      javascriptLearnerContentSha256(lesson, course.glossary, compiled.assets),
    ]),
  );
  const record = validateTypescriptReleaseEvidence(
    parse(sources.get('technicalAcceptance') ?? ''),
    hashes,
  );
  if (
    record.verifiedSourceCommit !== approval.verifiedSourceCommit ||
    record.canonicalDistSha256 !== approval.canonicalDistSha256 ||
    record.candidateTreeSha256 !== approval.candidateTreeSha256
  )
    throw new Error('TS技術記録と公開承認のbindingが一致しません');
  for (const declared of [record.draftInput, record.finalInput]) {
    const actual = await readTypescriptLearningInput(root, declared.sourceCommit);
    if (canonicalJson(actual) !== canonicalJson(declared))
      throw new Error('TS学習入力manifestが固定Git実体と一致しません');
  }
  await verifyContentReview({
    courseRoot: path.join(root, 'content/typescript'),
    publicRoot: path.join(root, 'public'),
    courseId: 'typescript',
    reviewPath: path.join(root, 'docs/quality/content-review-typescript.yaml'),
  });
  const review = parse(sources.get('contentReview') ?? '') as { releaseStatus?: unknown };
  if (review.releaseStatus !== 'approved') throw new Error('TS内容reviewの公開承認が未完了です');
  const applicationHash = await hashDirectory(path.join(root, 'src'));
  const lockHash = await hashFile(path.join(root, 'package-lock.json'));
  for (const { raw } of record.performanceEvidence) {
    const metric = TypescriptPerformanceEvidenceSchema.parse(JSON.parse(raw));
    await verifyTypescriptPerformanceImports(root, metric.sourceCommit);
    const lessonId = metric.exerciseId.slice(0, -4);
    const chapterId = lessonId.slice(0, -4);
    if (
      metric.applicationSourceSha256 !== applicationHash ||
      metric.dependencyLockSha256 !== lockHash ||
      metric.workloadSourceSha256 !==
        (await hashDirectory(
          path.join(
            root,
            `content/typescript/chapters/${chapterId}/lessons/${lessonId}/exercises/${metric.exerciseId}`,
          ),
        ))
    )
      throw new Error('TS性能証拠の製品/依存/課題が変更されています');
  }
  const testHash = await hashFile(path.join(root, 'tests/e2e/typescript-release-smoke.spec.ts'));
  if (record.browserMatrix.some(({ testSourceSha256 }) => testSourceSha256 !== testHash))
    throw new Error('TS Browser検査のソースが変更されています');
  assertJavascriptFinalQualityWorkflow(
    await readFile(path.join(root, '.github/workflows/pages.yml'), 'utf8'),
  );
  return record;
}
