import { expect } from 'vitest';
import {
  createCoverageReport,
  type CoverageReport,
} from '../../scripts/content/reportConceptCoverage';
import {
  loadAuthoringCourse,
  type AuthoringCoursePackage,
} from '../../scripts/content/compileCourse';

export type ChapterCoverageDiagnostic =
  | {
      readonly kind: 'slide-metadata' | 'exercise-metadata';
      readonly lessonId: string;
      readonly locationId: string;
    }
  | {
      readonly kind: 'concept';
      readonly lessonId: string;
      readonly locationId: string;
      readonly detail: CoverageReport['unmetRequirements'][number];
    };

const coverageByCourseRoot = new Map<string, Promise<CoverageReport>>();
const authoringByCourseRoot = new Map<string, Promise<AuthoringCoursePackage>>();

/** 同じTest process内ではCourse全体のCoverage集計を再利用する。 */
function coverageForCourse(courseRoot: string): Promise<CoverageReport> {
  const existing = coverageByCourseRoot.get(courseRoot);
  if (existing !== undefined) return existing;
  const created = createCoverageReport(courseRoot);
  coverageByCourseRoot.set(courseRoot, created);
  return created;
}

/** Lesson集合の照合に使うAuthoring Course読込結果を再利用する。 */
function authoringForCourse(courseRoot: string): Promise<AuthoringCoursePackage> {
  const existing = authoringByCourseRoot.get(courseRoot);
  if (existing !== undefined) return existing;
  const created = loadAuthoringCourse(courseRoot);
  authoringByCourseRoot.set(courseRoot, created);
  return created;
}

/** Slide／Exercise IDから所属Lesson IDを抽出する。 */
function lessonIdFromLocation(locationId: string): string {
  const [scopedLessonId] = locationId.split('/', 1);
  if (scopedLessonId !== undefined && /-l\d+$/u.test(scopedLessonId)) return scopedLessonId;
  const basename = locationId.slice(locationId.lastIndexOf('/') + 1);
  const match = /^(.*-l\d+)-(?:s|g|r|e)\d+$/u.exec(basename);
  return match?.[1] ?? locationId;
}

/** 指定Chapterに属するMetadata不足とConcept診断だけを安定順序で返す。 */
export function diagnosticsForChapter(
  report: CoverageReport,
  chapterId: string,
): readonly ChapterCoverageDiagnostic[] {
  const chapterPrefix = `${chapterId}-l`;
  const diagnostics: ChapterCoverageDiagnostic[] = [];

  for (const locationId of report.missingSlideMetadata) {
    if (locationId.startsWith(chapterPrefix)) {
      diagnostics.push({
        kind: 'slide-metadata',
        lessonId: lessonIdFromLocation(locationId),
        locationId,
      });
    }
  }
  for (const locationId of report.missingExerciseMetadata) {
    if (locationId.startsWith(chapterPrefix)) {
      diagnostics.push({
        kind: 'exercise-metadata',
        lessonId: lessonIdFromLocation(locationId),
        locationId,
      });
    }
  }
  for (const detail of report.unmetRequirements) {
    const locationId = detail.slideId ?? detail.exerciseId ?? detail.lessonId;
    if (detail.lessonId.startsWith(chapterPrefix) || locationId.startsWith(chapterPrefix)) {
      diagnostics.push({
        kind: 'concept',
        lessonId: detail.lessonId || lessonIdFromLocation(locationId),
        locationId,
        detail,
      });
    }
  }

  return diagnostics.toSorted((left, right) =>
    `${left.locationId}/${left.kind}`.localeCompare(`${right.locationId}/${right.kind}`, 'en'),
  );
}

/** 読込済み結果からChapterのLesson集合とCoverage不足ゼロを検証する。 */
export function assertChapterConceptCoverage(
  report: CoverageReport,
  chapterId: string,
  actualLessonIds: readonly string[],
  expectedLessonIds: readonly string[],
): void {
  expect(
    expectedLessonIds.length,
    `${chapterId}: Lesson IDを1件以上指定してください`,
  ).toBeGreaterThan(0);
  expect(
    expectedLessonIds.every((lessonId) => lessonId.startsWith(`${chapterId}-`)),
    `${chapterId}: 別ChapterのLesson IDが混在しています`,
  ).toBe(true);
  expect(actualLessonIds, `${chapterId}: Lesson集合が期待と一致しません`).toEqual(
    expectedLessonIds,
  );

  const diagnostics = diagnosticsForChapter(report, chapterId);
  const diagnosedLessonIds = new Set(diagnostics.map(({ lessonId }) => lessonId));
  expect(
    [...diagnosedLessonIds].every((lessonId) => expectedLessonIds.includes(lessonId)),
    `${chapterId}: 想定外のLesson診断があります`,
  ).toBe(true);
  expect(diagnostics, `${chapterId}: Concept Coverageを完了してください`).toEqual([]);
}

/** 移行済みChapterだけを読込み、Lesson集合とCoverage不足ゼロを検証する。 */
export async function expectChapterConceptCoverage(
  chapterId: string,
  expectedLessonIds: readonly string[],
  courseRoot = 'content/html-css',
): Promise<void> {
  const [report, authoring] = await Promise.all([
    coverageForCourse(courseRoot),
    authoringForCourse(courseRoot),
  ]);
  const chapter = authoring.runtime.phases
    .flatMap(({ chapters }) => chapters)
    .find(({ id }) => id === chapterId);
  if (chapter === undefined) throw new Error(`Chapterが見つかりません: ${chapterId}`);
  assertChapterConceptCoverage(
    report,
    chapterId,
    chapter.lessons.map(({ id }) => id),
    expectedLessonIds,
  );
}
