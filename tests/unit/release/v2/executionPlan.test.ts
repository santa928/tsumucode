// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { TEST_SUITES, testCommand } from '../../../../scripts/release/v2/executionPlan';
const fixture = {
  key: 'topic/lesson/exercise/solution/solution/browser',
  kind: 'fixture',
  courseId: 'topic',
  lessonId: 'lesson',
  exerciseId: 'exercise',
  workspaceId: 'exercise',
  fixtureId: 'solution',
  caseKind: 'solution',
  runtimeKind: 'html-css',
  mode: 'browser',
  inputDigest: 'a'.repeat(64),
  sourceDigest: 'b'.repeat(64),
  expectedStatus: 'pass',
};
const plan = {
  schemaVersion: 1,
  inventoryDigest: 'c'.repeat(64),
  parent: null,
  publishedCourses: ['topic'],
  targets: [
    fixture,
    {
      key: 'topic/lesson/persistence',
      kind: 'persistence',
      courseId: 'topic',
      lessonId: 'lesson',
      inputDigest: 'd'.repeat(64),
    },
  ],
};
function manifests() {
  const definitions: readonly (readonly [string, string, string])[] = TEST_SUITES.map(
    (row) => [row.suite, row.producerJobId, row.project] as const,
  );
  return definitions.map(([suite, producerJobId, project]) => ({
    suite,
    producerJobId,
    project,
    tests: [
      { key: suite + '/case', exerciseIds: suite === 'browser-chromium-1' ? ['exercise'] : [] },
    ],
  }));
}
describe('workflow execution plan', () => {
  it.each(TEST_SUITES)(
    '$suiteはretryなしの固定範囲を実行し、候補Browserだけ初回traceを有効にする',
    (suite) => {
      const config =
        suite.producerJobId === 'browser'
          ? '--config=playwright.qualification.config.ts'
          : suite.suite === 'browser-public'
            ? '--config=playwright.config.ts'
            : suite.suite === 'browser-performance'
              ? '--config=playwright.performance.config.ts'
              : suite.suite === 'native-python'
                ? '--config=playwright.python-local.config.ts'
                : '--config=playwright.learning-native.config.ts';
      expect(testCommand(suite.suite, false)).toEqual([
        'test',
        config,
        ...suite.args,
        '--grep-invert',
        '@visual-extended',
        '--workers=1',
        '--retries=0',
      ]);
      expect(testCommand(suite.suite, true)).toEqual([
        'test',
        config,
        ...suite.args,
        '--grep-invert',
        '@visual-extended',
        '--list',
        '--reporter=json',
      ]);
    },
  );

  it('assigns independent test IDs, fixtures and persistence to fixed same-run producers', async () => {
    const { createExecutionPlan } = await import('../../../../scripts/release/v2/executionPlan');
    const execution = createExecutionPlan(plan, manifests());
    expect(
      execution.requirements.find((item) => item.suite === 'browser-chromium-1'),
    ).toMatchObject({
      producerJobId: 'browser',
      targets: ['test/browser-chromium-1/browser-chromium-1/case', fixture.key],
    });
    expect(
      execution.requirements.find((item) => item.suite === 'browser-public')?.targets,
    ).toContain('topic/lesson/persistence');
    expect(execution.requirements.some((item) => item.suite === 'native-next')).toBe(false);
    expect(execution.requirements.some((item) => item.suite === 'browser-performance')).toBe(true);
    expect(execution.requirements.some((item) => item.suite === 'native-isolation')).toBe(false);
  });
  it.each([
    'missing-suite',
    'duplicate-suite',
    'wrong-producer',
    'missing-driver',
    'duplicate-driver',
  ])('rejects %s before expensive qualification', async (failure) => {
    const { createExecutionPlan } = await import('../../../../scripts/release/v2/executionPlan');
    const inputs = manifests();
    if (failure === 'missing-suite') inputs.pop();
    if (failure === 'duplicate-suite') inputs.push(inputs[0]!);
    if (failure === 'wrong-producer') inputs[0]!.producerJobId = 'forged';
    if (failure === 'missing-driver') inputs[0]!.tests[0]!.exerciseIds = [];
    if (failure === 'duplicate-driver') inputs[1]!.tests[0]!.exerciseIds = ['exercise'];
    expect(() => createExecutionPlan(plan, inputs)).toThrow();
  });
});
