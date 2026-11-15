// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest';
import { compileCourse, loadAuthoringCourse } from '../../../scripts/content/compileCourse';
import { buildInventory } from '../../../scripts/release/v2/inventory';
import { planRelease } from '../../../scripts/release/v2/plan';
import { fixtureFiles } from '../../../scripts/release/v2/fixtureSource';
import { createPythonFixtureObservations } from '../../../scripts/release/v2/pythonCoverage';
import {
  readBrowserCoverage,
  type FixtureObservation,
} from '../../../scripts/release/v2/browserCoverage';

let courses: Awaited<ReturnType<typeof loadAuthoringCourse>>[];
let targets: ReturnType<typeof planRelease>['targets'];
beforeAll(async () => {
  const ids = ['python-practice', 'python-oop'];
  courses = await Promise.all(ids.map((id) => loadAuthoringCourse(`content/${id}`)));
  targets = planRelease(
    buildInventory(await Promise.all(ids.map((id) => compileCourse(`content/${id}`)))),
  ).targets;
});

/** 合成観測は照合ロジックの負例用であり、実UI・fixture実行の証拠ではない。 */
function synthetic(mode: 'pyodide' | 'cpython') {
  const rows: FixtureObservation[] = [];
  for (const course of courses.filter((item) => item.runtime.publicationStatus === 'published'))
    for (const exercise of course.exercises)
      for (const fixture of exercise.fixtures)
        rows.push(
          ...createPythonFixtureObservations(course, {
            exerciseId: exercise.id,
            fixtureId: fixture.id,
            mode,
            files: fixtureFiles(exercise, fixture.files),
            ...(mode === 'pyodide' ? { inputLines: fixture.inputLines } : {}),
            actualStatus:
              mode === 'cpython'
                ? (fixture.expectedLocalStatus ?? fixture.expectedStatus)
                : fixture.expectedStatus,
          }),
        );
  return rows;
}

function report(rows: FixtureObservation[], project: string) {
  return {
    stats: { expected: 1, unexpected: 0, flaky: 0, skipped: 0 },
    suites: [
      {
        specs: [
          {
            tests: [
              {
                projectName: project,
                status: 'expected',
                expectedStatus: 'passed',
                results: [
                  {
                    status: 'passed',
                    retry: 0,
                    attachments: [
                      {
                        name: 'release-fixtures-v1',
                        contentType: 'application/json',
                        body: Buffer.from(JSON.stringify(rows)).toString('base64'),
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

describe('Python published fixture attachment contract (synthetic only)', () => {
  it.each(['pyodide', 'cpython'] as const)(
    'matches every %s target only with its exact rows',
    (mode) => {
      const required = targets.filter(
        (target) => target.kind === 'fixture' && target.mode === mode,
      );
      const rows = synthetic(mode);
      const project = mode === 'pyodide' ? 'chromium' : '';
      const published = new Set(
        courses
          .filter((course) => course.runtime.publicationStatus === 'published')
          .map((course) => course.runtime.id),
      );
      const expected =
        (published.has('python-practice') ? 68 : 0) + (published.has('python-oop') ? 184 : 0);
      expect(expected).toBeGreaterThan(0);
      expect(required).toHaveLength(expected);
      expect(rows).toHaveLength(expected);
      expect(readBrowserCoverage(report(rows, project), required, project)).toHaveLength(expected);
      expect(() =>
        readBrowserCoverage(report(rows.slice(1), project), required, project),
      ).toThrow();
      expect(() =>
        readBrowserCoverage(report([...rows, rows[0]!], project), required, project),
      ).toThrow();
      const altered = structuredClone(rows);
      altered[0]!.sourceDigest = '0'.repeat(64);
      expect(() => readBrowserCoverage(report(altered, project), required, project)).toThrow();
    },
  );
});
