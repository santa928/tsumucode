import type { LegacyCourseEvidence } from './legacy';
import { InventorySchema } from './schema';

/** Migration diagnostics only: old source/method/scope are carried verbatim, never re-approved. */
export function compareLegacy(inventoryInput: unknown, legacy: readonly LegacyCourseEvidence[]) {
  const inventory = InventorySchema.parse(inventoryInput);
  if (new Set(legacy.map((row) => row.courseId)).size !== legacy.length)
    throw new Error('Duplicate legacy course');
  return {
    status: 'shadow-only' as const,
    courses: inventory.courses
      .filter((course) => course.publicationStatus === 'published')
      .map((course) => {
        const old = legacy.find((row) => row.courseId === course.id);
        const expected = new Set(course.lessons.map((lesson) => lesson.id));
        const rows = old?.contentLessons ?? [];
        const coverage = old?.coverage;
        const exact =
          rows.length === expected.size &&
          new Set(rows.map((row) => row.lessonId)).size === rows.length &&
          rows.every((row) => expected.has(row.lessonId));
        const validRows = rows.every(
          (row) =>
            row.sourceHashMatches &&
            row.authorId !== row.reviewerId &&
            row.examplesExecuted &&
            row.decision === 'approved' &&
            row.accuracy === 'approved' &&
            row.goalExerciseAlignment === 'approved' &&
            row.unexplainedTerms === 0 &&
            row.hintLeakage === 0,
        );
        const complete =
          coverage &&
          coverage.missingLessonIds.length === 0 &&
          coverage.extraLessonIds.length === 0 &&
          coverage.duplicateReviewLessonIds.length === 0 &&
          coverage.duplicateSourceLessonIds.length === 0;
        const approval = old?.records.find((record) => record.kind === 'approval');
        return {
          courseId: course.id,
          contentRows:
            !old || !rows.length
              ? ('missing' as const)
              : exact && validRows && complete
                ? ('valid' as const)
                : ('invalid' as const),
          publication: !approval
            ? ('unknown' as const)
            : approval.declaredStatus === 'approved'
              ? ('recorded-approved-unbound' as const)
              : ('pending' as const),
          learnerApproval:
            old?.format === 'legacy'
              ? ('historical-only' as const)
              : ('new-evidence-required' as const),
          originalRecords: old?.records ?? [],
          coverage: coverage ?? null,
          missingRecordPaths: old?.missingRecordPaths ?? [],
          // A current live deployment and unchanged learner content must be established independently.
          currentDeployment: 'unverified' as const,
        };
      }),
  };
}
