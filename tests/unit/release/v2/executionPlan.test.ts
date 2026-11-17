// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  TEST_SUITES,
  assertChromiumCoverage,
  testCommand,
} from '../../../../scripts/release/v2/executionPlan';
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
  it('新しいテストを含む一覧と2群の全件一致を検証する', () => {
    const all = ['existing-a', 'existing-b', 'new-file/case'];
    expect(() => {
      assertChromiumCoverage(all, [['existing-a'], ['existing-b', 'new-file/case']]);
    }).not.toThrow();
    expect(() => {
      assertChromiumCoverage(all, [['existing-a'], ['existing-b']]);
    }).toThrow();
    expect(() => {
      assertChromiumCoverage(all, [
        ['existing-a', 'new-file/case'],
        ['existing-b', 'new-file/case'],
      ]);
    }).toThrow();
    expect(() => {
      assertChromiumCoverage(all, [['existing-a'], ['existing-b', 'new-file/case', 'unexpected']]);
    }).toThrow();
  });
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
              : suite.suite === 'native-python' || suite.suite === 'native-python-fixtures'
                ? '--config=playwright.python-local.config.ts'
                : '--config=playwright.learning-native.config.ts';
      expect(testCommand(suite.suite, false)).toEqual([
        'test',
        config,
        ...suite.args,
        '--grep-invert',
        suite.suite === 'browser-chromium-2'
          ? expect.stringContaining('@visual-extended|')
          : suite.suite === 'native-python'
            ? '@visual-extended|python-published-fixtures\\.spec\\.ts'
            : '@visual-extended',
        '--workers=1',
        '--retries=0',
      ]);
      expect(testCommand(suite.suite, true)).toEqual([
        'test',
        config,
        ...suite.args,
        '--grep-invert',
        suite.suite === 'browser-chromium-2'
          ? expect.stringContaining('@visual-extended|')
          : suite.suite === 'native-python'
            ? '@visual-extended|python-published-fixtures\\.spec\\.ts'
            : '@visual-extended',
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

it('assigns Python fixture chunks to one fixed native suite and rejects forged ownership', async () => {
  const { createExecutionPlan } = await import('../../../../scripts/release/v2/executionPlan');
  const pythonPlan = { ...plan, targets: [{ ...fixture, runtimeKind: 'python', mode: 'cpython' }] };
  const inputs = manifests();
  inputs.find((item) => item.suite === 'native-python-fixtures')!.tests = [
    { key: 'fixture/chunk-1', exerciseIds: ['exercise'] },
    { key: 'fixture/chunk-2', exerciseIds: ['exercise'] },
  ];
  const execution = createExecutionPlan(pythonPlan, inputs);
  const requirement = execution.requirements.find(
    (item) => item.suite === 'native-python-fixtures',
  )!;
  expect(requirement.producerJobId).toBe('python_fixtures');
  expect(requirement.targets).toEqual(
    [
      'test/native-python-fixtures/fixture/chunk-1',
      'test/native-python-fixtures/fixture/chunk-2',
      fixture.key,
    ].sort(),
  );
  const missing = structuredClone(inputs);
  missing
    .find((item) => item.suite === 'native-python-fixtures')!
    .tests.forEach((row) => {
      row.exerciseIds = [];
    });
  expect(() => createExecutionPlan(pythonPlan, missing)).toThrow(
    'Missing or duplicated actual fixture driver',
  );
  const duplicate = structuredClone(inputs);
  duplicate.find((item) => item.suite === 'native-python')!.tests[0]!.exerciseIds = ['exercise'];
  expect(() => createExecutionPlan(pythonPlan, duplicate)).toThrow(
    'Missing or duplicated actual fixture driver',
  );
  const wrongProducer = structuredClone(inputs);
  wrongProducer.find((item) => item.suite === 'native-python-fixtures')!.producerJobId = 'boundary';
  expect(() => createExecutionPlan(pythonPlan, wrongProducer)).toThrow(
    'Missing or untrusted test producer',
  );
});
