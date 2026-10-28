// @vitest-environment node
import { describe, expect, it } from 'vitest';
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
  const definitions: [string, string, string][] = [
    ['browser-chromium-1', 'browser', 'chromium'],
    ['browser-chromium-2', 'browser', 'chromium'],
    ['browser-firefox', 'browser', 'firefox'],
    ['browser-webkit', 'browser', 'webkit'],
    ['browser-public', 'public_boundary', 'chromium'],
    ['browser-performance', 'performance', 'chromium'],
    ['native-python', 'boundary', ''],
  ];
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
