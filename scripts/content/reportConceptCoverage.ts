/** Concept Graphと教材Metadataの移行状況を副作用なく集計し、CLIで可視化する。 */
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { MasteryDiagnostic } from './conceptMastery';
import { loadAuthoringCourse } from './compileCourse';

export interface CoverageReport {
  readonly missingSlideMetadata: readonly string[];
  readonly missingExerciseMetadata: readonly string[];
  readonly unmetRequirements: readonly MasteryDiagnostic[];
}

/** Diagnosticを実行環境に依存しない比較Keyへ変換する。 */
function diagnosticKey(diagnostic: MasteryDiagnostic): string {
  return [
    diagnostic.lessonId,
    diagnostic.slideId ?? '',
    diagnostic.exerciseId ?? '',
    diagnostic.conceptId,
    diagnostic.kind,
  ].join('/');
}

/** 1 Courseの未移行Metadataと習得条件不足を安定順序で返す。 */
export async function createCoverageReport(courseRoot: string): Promise<CoverageReport> {
  const authoring = await loadAuthoringCourse(courseRoot);
  return {
    missingSlideMetadata: [...authoring.missingSlideMetadata].toSorted(),
    missingExerciseMetadata: [...authoring.missingExerciseMetadata].toSorted(),
    unmetRequirements: [...authoring.masteryDiagnostics].toSorted((left, right) =>
      diagnosticKey(left).localeCompare(diagnosticKey(right), 'en'),
    ),
  };
}

/** Coverage Reportを人が確認できる行指向Textへ変換する。 */
function formatCoverageReport(report: CoverageReport): string {
  const missingCount =
    report.missingSlideMetadata.length +
    report.missingExerciseMetadata.length +
    report.unmetRequirements.length;
  if (missingCount === 0) return 'coverage complete\n';

  const lines = ['coverage incomplete'];
  for (const location of report.missingSlideMetadata) {
    lines.push(`[slide-metadata] ${location}`);
  }
  for (const location of report.missingExerciseMetadata) {
    lines.push(`[exercise-metadata] ${location}`);
  }
  for (const diagnostic of report.unmetRequirements) {
    lines.push(
      `[concept] kind=${diagnostic.kind} lesson=${diagnostic.lessonId || '-'} slide=${diagnostic.slideId ?? '-'} exercise=${diagnostic.exerciseId ?? '-'} concept=${diagnostic.conceptId} actual=${diagnostic.actualLevel ?? 'none'} required=${diagnostic.requiredLevel}`,
    );
  }
  return `${lines.join('\n')}\n`;
}

/** CLI引数のCourse Rootを検証し、Coverage不足を終了Codeへ反映する。 */
async function main(): Promise<void> {
  if (process.argv.length > 3) {
    throw new Error('Usage: tsx scripts/content/reportConceptCoverage.ts [course-root]');
  }
  const courseRoot = path.resolve(process.argv[2] ?? 'content/html-css');
  const report = await createCoverageReport(courseRoot);
  process.stdout.write(formatCoverageReport(report));
  if (
    report.missingSlideMetadata.length > 0 ||
    report.missingExerciseMetadata.length > 0 ||
    report.unmetRequirements.length > 0
  ) {
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await main();
}
