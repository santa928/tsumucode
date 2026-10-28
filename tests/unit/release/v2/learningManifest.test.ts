// @vitest-environment node
import { it, expect } from 'vitest';
import { createExecutionPlan, TEST_SUITES } from '../../../../scripts/release/v2/executionPlan';
import { parseTestList, verifyTestExecution } from '../../../../scripts/release/v2/testManifest';
const target = (engine: string) => ({
  key: 'topic/lesson/learning-engine/' + engine,
  kind: 'learning-engine',
  engine,
  courseId: 'topic',
  lessonId: 'lesson',
  inputDigest: 'a'.repeat(64),
});
const plan = {
  schemaVersion: 1,
  inventoryDigest: 'b'.repeat(64),
  parent: null,
  publishedCourses: ['topic'],
  targets: ['chromium', 'firefox', 'webkit'].map(target),
};
function manifests() {
  return TEST_SUITES.map((row) => ({
    suite: row.suite,
    producerJobId: row.producerJobId,
    project: row.project,
    tests: [
      {
        key: row.suite + '/case',
        exerciseIds: [],
        ...(['browser-chromium-1', 'browser-firefox', 'browser-webkit'].includes(row.suite)
          ? { lessonKeys: ['topic/lesson'] }
          : {}),
      },
    ],
  }));
}
it('owns each new lesson engine only through the exact independently frozen project test', () => {
  const result = createExecutionPlan(plan, manifests());
  for (const [suite, engine] of [
    ['browser-chromium-1', 'chromium'],
    ['browser-firefox', 'firefox'],
    ['browser-webkit', 'webkit'],
  ])
    expect(result.requirements.find((row) => row.suite === suite)?.targets).toContain(
      target(engine!).key,
    );
});
it.each(['missing', 'wrong-lesson', 'duplicate'])('refuses %s actual engine driver', (kind) => {
  const rows = manifests();
  if (kind === 'missing') delete rows[2]!.tests[0]!.lessonKeys;
  if (kind === 'wrong-lesson') rows[2]!.tests[0]!.lessonKeys = ['topic/another'];
  if (kind === 'duplicate') rows[1]!.tests[0]!.lessonKeys = ['topic/lesson'];
  expect(() => createExecutionPlan(plan, rows)).toThrow(/lesson|learning/iu);
});
it('does not let actual execution change a frozen lesson annotation', () => {
  const report = {
    errors: [],
    suites: [
      {
        specs: [
          {
            id: 'actual',
            tests: [
              {
                projectName: 'chromium',
                expectedStatus: 'passed',
                annotations: [{ type: 'release-lesson', description: 'topic/lesson' }],
                results: [],
              },
            ],
          },
        ],
      },
    ],
  };
  const frozen = parseTestList(report, 'browser-chromium-1', 'browser', 'chromium');
  expect(frozen.tests[0]?.lessonKeys).toEqual(['topic/lesson']);
  const actual = structuredClone(report);
  Object.assign(actual, { stats: { expected: 1, unexpected: 0, flaky: 0, skipped: 0 } });
  Object.assign(actual.suites[0]!.specs[0]!.tests[0]!, {
    status: 'expected',
    results: [{ status: 'passed', retry: 0 }],
  });
  expect(verifyTestExecution(actual, frozen)).toHaveLength(1);
  actual.suites[0]!.specs[0]!.tests[0]!.annotations[0]!.description = 'topic/another';
  expect(() => verifyTestExecution(actual, frozen)).toThrow();
});
