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
  ReactInputManifestSchema,
  readReactLearningInput,
  compareReactLearningInputs,
} from './reactInputHashes';
import { assertJavascriptFinalQualityWorkflow } from './verifyJavascriptQualityEvidence';
import type { ReactReleaseApproval } from './reactReleaseSchema';

export const REACT_ACCEPTANCE_LESSONS = [
  ...Array.from({ length: 12 }, (_, index) => `react-ch01-l${String(index + 1).padStart(2, '0')}`),
  'react-ch02-l01',
  'react-ch02-l02',
  'react-ch03-l01',
] as const;
const Role = z.enum(['A', 'B', 'C']);
const Reference = z.object({ path: z.string().min(1), sha256: Sha256Schema }).strict();
const Representative = z.enum(['react-ch01-l01-e01', 'react-ch01-l11-e01', 'react-ch03-l01-e01']);
const PerformanceSchema = z
  .object({
    captureBinding: z
      .object({
        sourceCommit: CommitShaSchema,
        canonicalDistSha256: Sha256Schema,
        applicationSourceSha256: Sha256Schema,
        dependencyLockSha256: Sha256Schema,
        harnessSha256: Sha256Schema,
        workloadSourceSha256: Sha256Schema,
      })
      .strict(),
    exerciseId: Representative,
    browser: z.string().min(1),
    viewport: z.object({ width: z.number().positive(), height: z.number().positive() }).strict(),
    cpuSlowdown: z.literal(4),
    rttMs: z.literal(150),
    downloadBitsPerSecond: z.literal(1_600_000),
    uploadBitsPerSecond: z.literal(750_000),
    cache: z.literal('HTTP cache disabled; cold Context/IndexedDB fresh; warm same Context'),
    initialOutcome: z.enum(['type-error', 'rendered']),
    cold: z
      .array(z.object({ elapsedMs: z.number().positive(), status: z.literal('pass') }).strict())
      .length(20),
    preview: z.array(z.number().positive()).length(20),
    validation: z.array(z.number().positive()).length(20),
    failures: z.array(z.never()).length(0),
    warmupRuns: z.literal(1),
    plannedRuns: z.literal(20),
    coldP95Ms: z.number().positive(),
    coldMaxMs: z.number().positive(),
    previewP95Ms: z.number().positive(),
    validationP95Ms: z.number().positive(),
    scope: z.string().min(1),
  })
  .strict();

/** private原本をActionsへ送らず、固定学習入力・数値・独立原本照合を公開記録へ結び付ける。 */
export const ReactReleaseEvidenceSchema = z
  .object({
    schemaVersion: z.literal(1),
    courseId: z.literal('react'),
    status: z.literal('preflight-passed-final-ci-required'),
    methodsApprovalReference: z.string().min(1),
    publicationApprovalReference: z.string().min(1),
    realHumanTrial: z.literal('unverified'),
    lowEndPhysicalDevice: z.literal('unverified'),
    verifiedSourceCommit: CommitShaSchema,
    canonicalDistSha256: Sha256Schema,
    candidateTreeSha256: Sha256Schema,
    draftCanonicalDistSha256: Sha256Schema,
    draftInput: ReactInputManifestSchema,
    finalInput: ReactInputManifestSchema,
    applicationSourceSha256: Sha256Schema,
    dependencyLockSha256: Sha256Schema,
    personas: z
      .array(
        z
          .object({
            role: Role,
            actor: z.string().min(1),
            session: z.string().min(1),
            browserContext: z.string().min(1),
            publicInputOnly: z.literal(true),
            explainsFinalProject: z.literal(true),
            report: Reference,
            results: z
              .array(
                z
                  .object({
                    lessonId: z.string(),
                    learnerContentSha256: Sha256Schema,
                    source: Reference,
                    uiEvidence: Reference,
                  })
                  .strict(),
              )
              .length(15),
          })
          .strict(),
      )
      .length(3),
    performance: z
      .array(
        z
          .object({
            exerciseId: Representative,
            raw: z.string().min(1),
            sha256: Sha256Schema,
            harnessSha256: Sha256Schema,
            workloadSourceSha256: Sha256Schema,
          })
          .strict(),
      )
      .length(3),
    browserMatrix: z
      .array(
        z
          .object({
            engine: z.enum(['chromium', 'firefox', 'webkit']),
            passedLessons: z.literal(15),
            failedLessons: z.literal(0),
            generalLessons: z.literal(14),
            refUiLessons: z.literal(1),
            reportSha256s: z.array(Sha256Schema).min(1),
            sourceCommit: CommitShaSchema,
            canonicalDistSha256: Sha256Schema,
            harnessSha256: Sha256Schema,
            refHarnessSha256: Sha256Schema,
          })
          .strict(),
      )
      .length(3),
    progressRoundTrip: Reference,
    reading: z
      .object({
        codePreviewSlides: z.literal(25),
        viewports: z.tuple([z.literal(1280), z.literal(390)]),
        axeViolations: z.literal(0),
        report: Reference,
      })
      .strict(),
    independenceReview: z
      .object({
        author: z.literal('root'),
        reviewer: z.string().min(1),
        decision: z.literal('approved'),
        privateOriginalsChecked: z.literal(true),
        productTreeSha256: Sha256Schema,
        evidenceSha256: Sha256Schema,
        reportSha256s: z.array(Sha256Schema).length(3),
      })
      .strict(),
  })
  .strict();
export type ReactReleaseEvidence = z.infer<typeof ReactReleaseEvidenceSchema>;

/** 宣言自身以外の全payloadを固定し、証拠を差し替えた旧review宣言を拒否する。 */
export function hashReactReleaseEvidence(input: ReactReleaseEvidence): string {
  return createHash('sha256')
    .update(
      canonicalJson(
        Object.fromEntries(Object.entries(input).filter(([key]) => key !== 'independenceReview')),
      ),
    )
    .digest('hex');
}

/** 3役×全15教材、3 Engineと承認済み20標本予算を省略せず照合する。 */
export function validateReactReleaseEvidence(
  input: unknown,
  learnerHashes: ReadonlyMap<string, string>,
): ReactReleaseEvidence {
  const record = ReactReleaseEvidenceSchema.parse(input);
  compareReactLearningInputs(record.draftInput, record.finalInput);
  const review = record.independenceReview;
  if (
    record.verifiedSourceCommit !== record.finalInput.sourceCommit ||
    review.author === review.reviewer ||
    review.evidenceSha256 !== hashReactReleaseEvidence(record) ||
    review.productTreeSha256 !== record.candidateTreeSha256
  )
    throw new Error('React入力/独立review bindingが一致しません');
  if (
    new Set(record.personas.map(({ role }) => role)).size !== 3 ||
    new Set(record.personas.map(({ actor }) => actor)).size !== 3 ||
    new Set(record.personas.map(({ session }) => session)).size !== 3 ||
    new Set(record.personas.map(({ browserContext }) => browserContext)).size !== 3 ||
    record.personas.some(({ actor }) => actor === review.reviewer || actor === review.author)
  )
    throw new Error('React模擬学習者の3役隔離が不足しています');
  const expected = [...REACT_ACCEPTANCE_LESSONS].sort();
  for (const persona of record.personas) {
    if (
      canonicalJson(persona.results.map(({ lessonId }) => lessonId).sort()) !==
        canonicalJson(expected) ||
      persona.results.some(
        ({ lessonId, learnerContentSha256 }) =>
          learnerHashes.get(lessonId) !== learnerContentSha256,
      )
    )
      throw new Error('React模擬受入の全15教材/可視入力が一致しません');
  }
  if (
    new Set(record.personas.map(({ report }) => report.sha256)).size !== 3 ||
    canonicalJson(record.personas.map(({ report }) => report.sha256).sort()) !==
      canonicalJson([...review.reportSha256s].sort())
  )
    throw new Error('React評価原本のreview bindingが一致しません');
  if (
    new Set(record.performance.map(({ exerciseId }) => exerciseId)).size !== 3 ||
    new Set(record.browserMatrix.map(({ engine }) => engine)).size !== 3 ||
    record.browserMatrix.some(
      ({ sourceCommit, canonicalDistSha256 }) =>
        sourceCommit !== record.draftInput.sourceCommit ||
        canonicalDistSha256 !== record.draftCanonicalDistSha256,
    )
  )
    throw new Error('React代表機能またはBrowserに欠落/重複があります');
  const p95 = (values: readonly number[]): number =>
    [...values].sort((a, b) => a - b)[Math.ceil(values.length * 0.95) - 1]!;
  for (const entry of record.performance) {
    const raw = PerformanceSchema.parse(JSON.parse(entry.raw));
    if (
      raw.captureBinding.sourceCommit !== record.draftInput.sourceCommit ||
      raw.captureBinding.canonicalDistSha256 !== record.draftCanonicalDistSha256 ||
      raw.captureBinding.applicationSourceSha256 !== record.applicationSourceSha256 ||
      raw.captureBinding.dependencyLockSha256 !== record.dependencyLockSha256 ||
      raw.captureBinding.harnessSha256 !== entry.harnessSha256 ||
      raw.captureBinding.workloadSourceSha256 !== entry.workloadSourceSha256
    )
      throw new Error('React性能の取得時Source/Artifact bindingが一致しません');
    const cold = raw.cold.map(({ elapsedMs }) => elapsedMs);
    if (
      entry.sha256 !== createHash('sha256').update(entry.raw).digest('hex') ||
      raw.exerciseId !== entry.exerciseId ||
      raw.initialOutcome !==
        (entry.exerciseId === 'react-ch01-l01-e01' ? 'type-error' : 'rendered') ||
      raw.coldP95Ms !== p95(cold) ||
      raw.coldMaxMs !== Math.max(...cold) ||
      raw.previewP95Ms !== p95(raw.preview) ||
      raw.validationP95Ms !== p95(raw.validation)
    )
      throw new Error('React性能raw/hash/区間/再計算値が一致しません');
    if (Math.max(...cold) > 10_000 || p95(raw.preview) > 2_000 || p95(raw.validation) > 10_000)
      throw new Error('Reactの初回10秒/Preview p95 2秒/採点p95 10秒の予算を超過しています');
  }
  return record;
}

/** Source・学習入力・実Artifact・採点対象と最終全site CIを既存承認へ接続する。 */
export async function verifyReactQualityEvidence(
  root: string,
  approval: ReactReleaseApproval,
  sources: ReadonlyMap<string, string>,
): Promise<ReactReleaseEvidence> {
  const compiled = await compileCourse(path.join(root, 'content/react'));
  const course = compiled.runtime;
  const chapters = course.phases.flatMap(({ chapters }) => chapters);
  const lessons = chapters.flatMap(({ lessons }) => lessons);
  if (
    course.publicationStatus !== 'published' ||
    course.phases.length !== 2 ||
    chapters.length !== 3 ||
    lessons.length !== 15 ||
    lessons.filter(({ kind }) => kind === 'standard').length !== 12 ||
    lessons.filter(({ kind }) => kind === 'guided-project').length !== 2 ||
    lessons.filter(({ kind }) => kind === 'capstone').length !== 1 ||
    lessons.reduce((sum, { estimatedMinutes }) => sum + estimatedMinutes, 0) !== 490
  )
    throw new Error('React published/15/12+2+1/3/2/490契約が一致しません');
  const hashes = new Map(
    lessons.map((lesson) => [
      lesson.id,
      javascriptLearnerContentSha256(lesson, course.glossary, compiled.assets),
    ]),
  );
  const record = validateReactReleaseEvidence(
    parse(sources.get('technicalAcceptance') ?? ''),
    hashes,
  );
  if (
    record.verifiedSourceCommit !== approval.verifiedSourceCommit ||
    record.canonicalDistSha256 !== approval.canonicalDistSha256 ||
    record.candidateTreeSha256 !== approval.candidateTreeSha256
  )
    throw new Error('React品質記録と公開承認が一致しません');
  for (const declared of [record.draftInput, record.finalInput]) {
    const actual = await readReactLearningInput(root, declared.sourceCommit);
    if (canonicalJson(actual) !== canonicalJson(declared))
      throw new Error('React学習入力がGit固定Sourceと一致しません');
  }
  await verifyContentReview({
    courseRoot: path.join(root, 'content/react'),
    publicRoot: path.join(root, 'public'),
    courseId: 'react',
    reviewPath: path.join(root, 'docs/quality/content-review-react.yaml'),
  });
  if (
    (parse(sources.get('contentReview') ?? '') as { releaseStatus?: unknown }).releaseStatus !==
    'approved'
  )
    throw new Error('React内容reviewの公開承認が未完了です');
  if (
    record.applicationSourceSha256 !== (await hashDirectory(path.join(root, 'src'))) ||
    record.dependencyLockSha256 !== (await hashFile(path.join(root, 'package-lock.json')))
  )
    throw new Error('Reactのアプリ/依存入力が変更されています');
  const harness = await hashFile(path.join(root, 'tests/acceptance/react-performance.spec.ts'));
  const refHarness = await hashFile(path.join(root, 'tests/acceptance/react-ref-focus.spec.ts'));
  const browserHarness = await hashFile(path.join(root, 'tests/acceptance/react-course.spec.ts'));
  for (const entry of record.performance) {
    const lesson = entry.exerciseId.slice(0, -4),
      chapter = lesson.slice(0, -4);
    if (
      entry.harnessSha256 !== harness ||
      entry.workloadSourceSha256 !==
        (await hashDirectory(
          path.join(
            root,
            `content/react/chapters/${chapter}/lessons/${lesson}/exercises/${entry.exerciseId}`,
          ),
        ))
    )
      throw new Error('React性能のharness/課題が変更されています');
  }
  if (
    record.browserMatrix.some(
      ({ harnessSha256, refHarnessSha256 }) =>
        harnessSha256 !== browserHarness || refHarnessSha256 !== refHarness,
    )
  )
    throw new Error('React Browser検証入力が変更されています');
  assertJavascriptFinalQualityWorkflow(
    await readFile(path.join(root, '.github/workflows/pages.yml'), 'utf8'),
  );
  return record;
}
