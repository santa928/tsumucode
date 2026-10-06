import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { z } from 'zod';
import { readSplitCourseArtifacts } from '../content/readSplitCourseArtifacts';
import { compileCourse } from '../content/compileCourse';
import { verifyContentReview } from '../content/verifyContentReview';
import { checkStaticArtifact } from './checkStaticArtifact';
import { javascriptLearnerContentSha256 } from './javascriptLessonEvaluation';
import { hashDirectory, hashFile } from './releaseHashes';

import type { Reference } from './typescriptAcceptanceSchema';
import {
  Hash,
  EvaluationReceiptSchema,
  TypescriptAcceptanceSchema,
  TypescriptPerformanceEvidenceSchema,
  type EvaluationReceipt,
  type TypescriptAcceptance,
  type TypescriptPerformanceEvidence,
} from './typescriptAcceptanceSchema';
export {
  TypescriptAcceptanceSchema,
  TypescriptPerformanceEvidenceSchema,
} from './typescriptAcceptanceSchema';
export type {
  TypescriptAcceptance,
  TypescriptPerformanceEvidence,
} from './typescriptAcceptanceSchema';

export const TYPESCRIPT_ACCEPTANCE_LESSONS = [
  'typescript-ch01-l01',
  'typescript-ch01-l02',
  'typescript-ch01-l03',
  'typescript-ch02-l01',
  'typescript-ch03-l01',
  'typescript-ch03-l02',
  'typescript-ch04-l01',
  'typescript-ch04-l02',
  'typescript-ch04-l03',
  'typescript-ch05-l01',
  'typescript-ch05-l02',
  'typescript-ch05-l03',
  'typescript-ch06-l01',
  'typescript-ch06-l02',
  'typescript-ch06-l03',
] as const;

const LazyRoots = [
  'src/features/learning/pages/EditableExercisePage.tsx',
  'src/features/learning/editor/CodeWorkspace.tsx',
  'src/features/learning/javascriptRuntimeServices.ts',
  'src/features/learning/browserConsoleRuntime.ts',
  'src/adapters/runtime/typescript/TypeScriptRunnerAdapter.ts',
  'src/adapters/validation/typescript/TypeScriptValidator.ts',
  'src/features/learning/editor/typescriptEditorLanguage.ts',
];

/** Homeとの差分JS graphとCompiler/Analyzerをgzip既定設定で合算する。 */
export async function measureTypescriptLazyJavaScript(dist: string): Promise<number> {
  const Chunk = z.object({ file: z.string(), imports: z.array(z.string()).optional() });
  const manifest = z
    .record(z.string(), Chunk)
    .parse(JSON.parse(await readFile(path.join(dist, '.vite/manifest.json'), 'utf8')));
  function graph(roots: readonly string[]): Set<string> {
    const seen = new Set<string>();
    const files = new Set<string>();
    function visit(key: string): void {
      if (seen.has(key)) return;
      const chunk = manifest[key];
      if (!chunk) throw new Error(`TS遅延graphにchunkがありません: ${key}`);
      seen.add(key);
      if (chunk.file.endsWith('.js')) files.add(chunk.file);
      for (const dependency of chunk.imports ?? []) visit(dependency);
    }
    roots.forEach(visit);
    return files;
  }
  const files = graph(LazyRoots);
  for (const chunk of Object.values(manifest))
    if (/\/(?:compilerWorker|analyzerWorker)-.*\.js$/u.test(chunk.file)) files.add(chunk.file);
  // WorkerはVite manifestに載らない版でも、実Artifactから固定名で拾う。
  for (const file of await readdir(path.join(dist, 'assets')))
    if (/^(?:compilerWorker|analyzerWorker)-.*\.js$/u.test(file)) files.add(`assets/${file}`);
  for (const file of graph(['src/app/normalLearningEntry.tsx'])) files.delete(file);
  let bytes = 0;
  for (const file of [...files].sort())
    bytes += gzipSync(await readFile(path.join(dist, file))).length;
  return bytes;
}

/** raw値からnearest-rank p95を再計算する。busy/停止には全サンプルの最大値を使う。 */
export function checkTypescriptPerformance(
  metric: TypescriptPerformanceEvidence,
  samples: readonly number[],
): number {
  if (samples.some((sample) => !Number.isFinite(sample) || sample <= 0))
    throw new Error('TS性能のraw sampleが不正です');
  const interactive = metric.kind === 'busy' || metric.kind === 'stop';
  if (metric.exerciseId !== typescriptPerformanceExercise(metric.kind))
    throw new Error('TS性能の対象課題が一致しません');
  if (metric.kind === 'stop' && !metric.lateResultsRejected)
    throw new Error('TS停止後の遅延結果無効化が未確認です');
  const expectedScope = interactive
    ? 'trusted-click-next-frame'
    : metric.kind === 'cold' || metric.kind === 'warm'
      ? 'controller-preview'
      : 'controller-validation';
  if (metric.timingScope !== expectedScope || metric.includesQueueAndFrame !== interactive)
    throw new Error('TS性能の計測区間が契約と一致しません');
  if (
    samples.length < (interactive ? 2 : 20) ||
    metric.warmup !== (interactive || metric.kind === 'cold' ? 0 : 3)
  )
    throw new Error('TS性能の標本数またはwarmupが不足しています');
  const ordered = [...samples].sort((a, b) => a - b);
  const value = interactive ? ordered.at(-1)! : ordered[Math.ceil(ordered.length * 0.95) - 1]!;
  const maximum =
    metric.kind === 'busy'
      ? 100
      : metric.kind === 'stop'
        ? 300
        : metric.kind === 'warm'
          ? 2_000
          : 5_000;
  if (Math.abs(value - metric.reportedValueMs) > 0.001 || value > maximum)
    throw new Error(
      `TS性能予算を満たしません: ${metric.kind}=${String(value)}ms / ${String(maximum)}ms`,
    );
  return value;
}

/** 15教材×3役の固定集合と、役ごとの評価者・Session・Storage隔離を照合する。 */
export function checkTypescriptPersonaCoverage(
  record: TypescriptAcceptance,
  learnerHashes: ReadonlyMap<string, string>,
): void {
  const expected = [...TYPESCRIPT_ACCEPTANCE_LESSONS].sort();
  if (JSON.stringify([...learnerHashes.keys()].sort()) !== JSON.stringify(expected))
    throw new Error('TS採用15教材と評価対象が一致しません');
  if (new Set(record.personas.map(({ role }) => role)).size !== 3)
    throw new Error('TSの3役が重複しています');
  for (const field of ['actors', 'sessions', 'browserContexts'] as const) {
    const used = new Set<string>();
    for (const persona of record.personas)
      for (const value of persona[field]) {
        if (used.has(value)) throw new Error(`TSの役を独立させてください: ${field}/${value}`);
        used.add(value);
      }
  }
  for (const persona of record.personas) {
    if (
      JSON.stringify(persona.results.map(({ lessonId }) => lessonId).sort()) !==
      JSON.stringify(expected)
    )
      throw new Error(`TS評価に欠落または重複があります: ${persona.role}`);
    for (const result of persona.results)
      if (learnerHashes.get(result.lessonId) !== result.learnerContentSha256)
        throw new Error(`TS学習者向け入力が変わっています: ${persona.role}/${result.lessonId}`);
  }
  if (new Set(record.performance.map(({ kind }) => kind)).size !== 7)
    throw new Error('TS性能指標に欠落または重複があります');
}

/** 指標ごとの固定課題。別指標の標本を使って未測定箇所を隠さない。 */
export function typescriptPerformanceExercise(kind: TypescriptPerformanceEvidence['kind']): string {
  return kind === 'cold' || kind === 'warm'
    ? 'typescript-ch06-l02-e01'
    : kind === 'simple'
      ? 'typescript-ch01-l02-e01'
      : kind === 'dom'
        ? 'typescript-ch05-l01-e01'
        : 'typescript-ch05-l03-e01';
}

/** CLIの宣言を実Git HEADへ照合し、未commitの教材/実装を混ぜない。 */
export async function verifyTypescriptSourceCommit(root: string, expected: string): Promise<void> {
  const execute = promisify(execFile);
  const argumentsPrefix = ['-C', root, '-c', `safe.directory=${root}`];
  const { stdout: head } = await execute('git', [...argumentsPrefix, 'rev-parse', 'HEAD']);
  const { stdout: tracked } = await execute('git', [
    ...argumentsPrefix,
    'status',
    '--porcelain',
    '--untracked-files=no',
  ]);
  const { stdout: untracked } = await execute('git', [
    ...argumentsPrefix,
    'ls-files',
    '--others',
    '--exclude-standard',
    '--',
    'src',
    'content',
    'public',
    'scripts',
    'tests',
    'docs',
    'package.json',
    'package-lock.json',
  ]);
  if (head.trim() !== expected || tracked.trim() || untracked.trim())
    throw new Error('TS受入は実Git HEADと未変更のProduct treeを必要とします');
}

/** 説明も含め、当該actor・session・Lessonのreceiptだけを照合する。 */
export function checkTypescriptEvaluationReceipt(
  receipts: readonly EvaluationReceipt[],
  result: TypescriptAcceptance['personas'][number]['results'][number],
): void {
  const matching = receipts.filter(
    (receipt) =>
      receipt.actor === result.actor &&
      receipt.session === result.session &&
      receipt.lessons.some(({ lessonId }) => lessonId === result.lessonId),
  );
  const evaluated = matching[0]?.lessons.find(({ lessonId }) => lessonId === result.lessonId);
  if (
    matching.length !== 1 ||
    evaluated?.learnerContentSha256 !== result.learnerContentSha256 ||
    evaluated.sourceSha256 !== result.source.sha256
  )
    throw new Error('TS独立評価の入力/原文が一致しません');
  if (result.lessonId === 'typescript-ch06-l03' && !matching[0]!.explainsFinalProject)
    throw new Error('TS最終作品の自力説明が未確認です');
}

/** capture時の固定Gitから計測harnessの3依存を照合し、観測区間の変更を再利用で隠さない。 */
export async function verifyTypescriptPerformanceImports(
  root: string,
  capturedSource: string,
): Promise<void> {
  const execute = promisify(execFile);
  for (const relative of [
    'tests/e2e/helpers/progress.ts',
    'tests/e2e/helpers/testBasePath.ts',
    'tests/e2e/helpers/typescriptOperationProbe.ts',
  ]) {
    const { stdout } = await execute('git', ['-C', root, 'show', `${capturedSource}:${relative}`], {
      encoding: 'buffer',
    });
    const { createHash } = await import('node:crypto');
    if (
      createHash('sha256').update(stdout).digest('hex') !==
      (await hashFile(path.join(root, relative)))
    )
      throw new Error(`TS capture時の計測依存が変更されています: ${relative}`);
  }
}

/** 記録・原文・実UI履歴・現在Artifactを照合する、公開前の専用検査。 */
export async function verifyTypescriptAcceptance(
  input: unknown,
  options: {
    readonly repositoryRoot: string;
    readonly dist: string;
    readonly sourceCommit: string;
  },
): Promise<{
  readonly simulatedPairs: 45;
  readonly lazyGzipBytes: number;
  readonly publicationApproval: 'pending';
}> {
  const record = TypescriptAcceptanceSchema.parse(input);
  const root = path.resolve(options.repositoryRoot);
  const resolve = (file: string) => path.resolve(root, file);
  async function verifyReference(reference: z.infer<typeof Reference>): Promise<string> {
    const file = resolve(reference.path);
    if ((await hashFile(file)) !== reference.sha256)
      throw new Error(`TS証拠hashが一致しません: ${reference.path}`);
    return file;
  }
  await verifyTypescriptSourceCommit(root, record.sourceCommit);
  const dist = resolve(options.dist);
  if (
    record.sourceCommit !== options.sourceCommit ||
    record.manifestSha256 !== (await hashFile(path.join(dist, '.vite/manifest.json'))) ||
    record.artifactSha256 !== (await hashDirectory(dist))
  )
    throw new Error('TS現在HEAD/Artifactと受入記録が一致しません');
  await checkStaticArtifact(dist, 'typescript');
  await verifyContentReview({
    courseRoot: path.join(root, 'content/typescript'),
    publicRoot: dist,
    courseId: 'typescript',
    reviewPath: path.join(root, 'docs/quality/content-review-typescript.yaml'),
  });
  const compiled = await compileCourse(path.join(root, 'content/typescript'));
  // 可視教材projectionは言語に依存しない。既存JSの保存済hashの定義は変更しない。
  const hashes = new Map(
    compiled.runtime.phases.flatMap(({ chapters }) =>
      chapters.flatMap(({ lessons }) =>
        lessons.map(
          (lesson) =>
            [
              lesson.id,
              javascriptLearnerContentSha256(lesson, compiled.runtime.glossary, compiled.assets),
            ] as const,
        ),
      ),
    ),
  );
  const delivered = await readSplitCourseArtifacts(dist, 'typescript');
  for (const phase of delivered.phases)
    for (const chapter of phase.chapters)
      for (const lesson of chapter.lessons)
        if (
          hashes.get(lesson.id) !==
          javascriptLearnerContentSha256(lesson, delivered.glossary, compiled.assets)
        )
          throw new Error(`TS原稿と現在配信教材が一致しません: ${lesson.id}`);
  checkTypescriptPersonaCoverage(record, hashes);
  const UiRow = z.object({
    role: z.string(),
    actor: z.string(),
    lessonId: z.string(),
    sourceSha256: Hash,
    passed: z.literal(true),
    lessonComplete: z.literal(true),
    browserContext: z.string(),
    storage: z.string(),
    originalFiles: z.record(z.string(), z.string()),
    validationHistory: z.array(z.object({ status: z.string() })).min(1),
  });
  const receiptHashes: string[] = [];
  const reportHashes = new Set<string>();
  for (const persona of record.personas) {
    const receipts = [];
    for (const reference of persona.evaluations) {
      receiptHashes.push(reference.sha256);
      const receipt = EvaluationReceiptSchema.parse(
        JSON.parse(await readFile(await verifyReference(reference), 'utf8')),
      );
      if (
        receipt.role !== persona.role ||
        !persona.actors.includes(receipt.actor) ||
        !persona.sessions.includes(receipt.session) ||
        reportHashes.has(receipt.report.sha256)
      )
        throw new Error('TS評価の役/実施者/原reportが独立していません');
      reportHashes.add(receipt.report.sha256);
      await verifyReference(receipt.report);
      receipts.push(receipt);
    }
    if (
      JSON.stringify(
        receipts.flatMap(({ lessons }) => lessons.map(({ lessonId }) => lessonId)).sort(),
      ) !== JSON.stringify([...TYPESCRIPT_ACCEPTANCE_LESSONS].sort())
    )
      throw new Error('TS評価原記録の対象に欠落/重複/余分な教材があります');
    for (const result of persona.results) {
      checkTypescriptEvaluationReceipt(receipts, result);
      const sourceFile = await verifyReference(result.source);
      const rows: unknown = JSON.parse(
        await readFile(await verifyReference(result.uiEvidence), 'utf8'),
      );
      const row = UiRow.parse(z.array(z.unknown()).parse(rows)[result.uiRow]);
      if (
        row.role !== persona.role ||
        row.actor !== `typescript-novice-${persona.role.toLowerCase()}` ||
        row.lessonId !== result.lessonId ||
        row.sourceSha256 !== result.source.sha256 ||
        !persona.browserContexts.includes(row.browserContext) ||
        row.storage !== `${row.browserContext}/indexedDB/tsumucode-progress` ||
        row.originalFiles['main.ts'] !== (await readFile(sourceFile, 'utf8')) ||
        row.validationHistory.at(-1)?.status !== 'pass'
      )
        throw new Error(`TS実UIの保存/合格証拠が一致しません: ${persona.role}/${result.lessonId}`);
    }
  }
  const Review = z
    .object({
      author: z.literal('root'),
      reviewer: z.string().min(1),
      decision: z.literal('approved'),
      evaluationReceiptSha256s: z.array(Hash).min(3),
    })
    .strict();
  const review = Review.parse(
    JSON.parse(await readFile(await verifyReference(record.independenceReview), 'utf8')),
  );
  if (
    review.reviewer === review.author ||
    record.personas.some(({ actors }) => actors.includes(review.reviewer)) ||
    new Set(receiptHashes).size !== receiptHashes.length ||
    JSON.stringify([...receiptHashes].sort()) !==
      JSON.stringify([...review.evaluationReceiptSha256s].sort())
  )
    throw new Error('TS独立評価の限定reviewと実記録が一致しません');
  const applicationSourceSha256 = await hashDirectory(path.join(root, 'src'));
  for (const reference of record.performance) {
    const metric = TypescriptPerformanceEvidenceSchema.parse(
      JSON.parse(await readFile(await verifyReference(reference.rawEvidence), 'utf8')),
    );
    if (metric.kind !== reference.kind) throw new Error('TS raw性能指標が取り違えられています');
    if (
      (metric.sourceCommit !== record.sourceCommit ||
        metric.manifestSha256 !== record.manifestSha256) &&
      !reference.reuseReason
    )
      throw new Error(`TS性能証拠の再利用条件がありません: ${metric.kind}`);
    await verifyReference(metric.harness);
    await verifyTypescriptPerformanceImports(root, metric.sourceCommit);
    const lesson = metric.exerciseId.slice(0, -4);
    const chapter = lesson.slice(0, -4);
    if (
      metric.applicationSourceSha256 !== applicationSourceSha256 ||
      metric.dependencyLockSha256 !== (await hashFile(path.join(root, 'package-lock.json'))) ||
      metric.workloadSourceSha256 !==
        (await hashDirectory(
          path.join(
            root,
            `content/typescript/chapters/${chapter}/lessons/${lesson}/exercises/${metric.exerciseId}`,
          ),
        ))
    )
      throw new Error(`TS capture時の実source/課題が変わっています: ${metric.kind}`);
    checkTypescriptPerformance(metric, metric.samplesMs);
  }
  const lazyGzipBytes = await measureTypescriptLazyJavaScript(dist);
  if (lazyGzipBytes > 2_500_000) throw new Error(`TS初回遅延JS予算超過: ${String(lazyGzipBytes)}`);
  return { simulatedPairs: 45, lazyGzipBytes, publicationApproval: 'pending' };
}

async function main(args: readonly string[]): Promise<void> {
  if (args.length !== 3)
    throw new Error('使い方: verifyTypescriptAcceptance.ts <record.json> <dist> <source-commit>');
  console.log(
    JSON.stringify(
      await verifyTypescriptAcceptance(JSON.parse(await readFile(args[0]!, 'utf8')), {
        repositoryRoot: process.cwd(),
        dist: args[1]!,
        sourceCommit: args[2]!,
      }),
    ),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
