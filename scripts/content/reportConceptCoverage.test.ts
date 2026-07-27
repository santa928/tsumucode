/** 教材Metadata移行Reportが不足を決定的な順序で返すことを検証する。 */
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createCoverageReport } from './reportConceptCoverage';

const COURSE_ROOT = path.resolve(process.cwd(), 'content/html-css');

describe('createCoverageReport', () => {
  it('全Lesson移行後はMetadata不足と未習Conceptを残さない', async () => {
    const report = await createCoverageReport(COURSE_ROOT);

    expect(report.missingSlideMetadata).toEqual([]);
    expect(report.missingExerciseMetadata).toEqual([]);
    expect(report.unmetRequirements).toEqual([]);
    expect(report.missingSlideMetadata).toEqual([...report.missingSlideMetadata].toSorted());
    expect(report.missingExerciseMetadata).toEqual([...report.missingExerciseMetadata].toSorted());
  }, 60_000);
});
