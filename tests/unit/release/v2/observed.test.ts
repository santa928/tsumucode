// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { InventorySchema, PlanSchema } from '../../../../scripts/release/v2/schema';
import { createExecutionPlan, TEST_SUITES } from '../../../../scripts/release/v2/executionPlan';
const target = {
  key: 'topic/lesson/exercise/authored/check/browser',
  kind: 'fixture',
  courseId: 'topic',
  lessonId: 'lesson',
  exerciseId: 'exercise',
  fixtureId: 'check',
  caseKind: 'authored',
  runtimeKind: 'html-css',
  mode: 'browser',
  inputDigest: 'a'.repeat(64),
  sourceDigest: 'b'.repeat(64),
  expectedStatus: 'pass',
};
const plan = PlanSchema.parse({
  schemaVersion: 1,
  inventoryDigest: 'c'.repeat(64),
  parent: null,
  publishedCourses: ['topic'],
  targets: [target],
});
const manifests = TEST_SUITES.map(({ suite, producerJobId, project }) => ({
  suite,
  producerJobId,
  project,
  tests: [
    {
      key: 'case-' + suite + '/' + project,
      exerciseIds: suite === 'browser-chromium-1' ? ['exercise'] : [],
    },
  ],
}));
const execution = createExecutionPlan(plan, manifests);
const inventory = InventorySchema.parse({
  schemaVersion: 1,
  fingerprintVersion: 1,
  courses: [
    {
      id: 'topic',
      revision: '1',
      publicationStatus: 'published',
      runner: 'html-css',
      lessons: [
        {
          id: 'lesson',
          kind: 'standard',
          learnerDigest: 'a'.repeat(64),
          exerciseDigest: 'b'.repeat(64),
          navigationDigest: 'c'.repeat(64),
          persistenceDigest: 'd'.repeat(64),
          exercises: [],
        },
      ],
    },
  ],
});
function report() {
  return {
    errors: [],
    stats: { expected: 1, unexpected: 0, flaky: 0, skipped: 0 },
    suites: [
      {
        specs: [
          {
            id: 'case-browser-chromium-1',
            tests: [
              {
                projectName: 'chromium',
                expectedStatus: 'passed',
                status: 'expected',
                annotations: [{ type: 'release-exercise', description: 'exercise' }],
                results: [
                  {
                    status: 'passed',
                    retry: 0,
                    attachments: [
                      {
                        name: 'release-fixtures-v1',
                        contentType: 'application/json',
                        body: Buffer.from(
                          JSON.stringify([
                            {
                              schemaVersion: 1,
                              key: target.key,
                              inputDigest: target.inputDigest,
                              sourceDigest: target.sourceDigest,
                              actualStatus: 'pass',
                            },
                          ]),
                        ).toString('base64'),
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
describe('test observations join frozen tests and actual runtime inputs', () => {
  it('returns only actual tested IDs and matching fixture observations', async () => {
    const { observeTestSuite } = await import('../../../../scripts/release/v2/observed');
    expect(
      observeTestSuite('browser-chromium-1', report(), plan, execution, inventory).sort(),
    ).toEqual(
      execution.requirements.find(({ suite }) => suite === 'browser-chromium-1')!.targets.sort(),
    );
  });
  it.each(['no-fixture', 'wrong-source', 'wrong-test', 'skipped', 'unknown-suite'])(
    'rejects %s without a receipt',
    async (failure) => {
      const { observeTestSuite } = await import('../../../../scripts/release/v2/observed');
      const input = report();
      const test = input.suites[0]!.specs[0]!.tests[0]!;
      if (failure === 'no-fixture') test.results[0]!.attachments = [];
      if (failure === 'wrong-source')
        test.results[0]!.attachments[0]!.body = Buffer.from(
          JSON.stringify([
            {
              schemaVersion: 1,
              key: target.key,
              inputDigest: target.inputDigest,
              sourceDigest: '0'.repeat(64),
              actualStatus: 'pass',
            },
          ]),
        ).toString('base64');
      if (failure === 'wrong-test') input.suites[0]!.specs[0]!.id = 'other';
      if (failure === 'skipped') test.status = 'skipped';
      expect(() =>
        observeTestSuite(
          failure === 'unknown-suite' ? 'other' : 'browser-chromium-1',
          input,
          plan,
          execution,
          inventory,
        ),
      ).toThrow();
    },
  );
});
