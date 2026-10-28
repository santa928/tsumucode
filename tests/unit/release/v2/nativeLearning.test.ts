// @vitest-environment node
import { expect, it } from 'vitest';
import {
  TEST_SUITES,
  testCommand,
  createExecutionPlan,
} from '../../../../scripts/release/v2/executionPlan';
it('collects Native learning for every existing browser engine from the real Native producer', () => {
  for (const engine of ['chromium', 'firefox', 'webkit']) {
    const suite = 'native-learning-' + engine;
    expect(TEST_SUITES.find((row) => row.suite === suite)).toMatchObject({
      project: engine,
      producerJobId: 'boundary',
    });
    expect(testCommand(suite, true)).toContain('--config=playwright.learning-native.config.ts');
  }
});
it('binds new Next lessons to Native UI drivers and cannot substitute public-only tests', () => {
  const targets = ['chromium', 'firefox', 'webkit'].map((engine) => ({
    key: 'future-topic/lesson/learning-engine/' + engine,
    kind: 'learning-engine',
    runtimeKind: 'next',
    courseId: 'future-topic',
    lessonId: 'lesson',
    engine,
    inputDigest: 'a'.repeat(64),
  }));
  const plan = {
    schemaVersion: 1,
    inventoryDigest: 'b'.repeat(64),
    parent: null,
    publishedCourses: ['future-topic'],
    targets,
  };
  const manifests = TEST_SUITES.map((row) => ({
    suite: row.suite,
    producerJobId: row.producerJobId,
    project: row.project,
    tests: [
      {
        key: row.suite + '/case',
        exerciseIds: [],
        ...(row.suite.startsWith('native-learning-')
          ? { lessonKeys: ['future-topic/lesson'] }
          : {}),
      },
    ],
  }));
  const execution = createExecutionPlan(plan, manifests);
  for (const engine of ['chromium', 'firefox', 'webkit'])
    expect(
      execution.requirements.find((row) => row.suite === 'native-learning-' + engine)?.targets,
    ).toContain('future-topic/lesson/learning-engine/' + engine);
});
