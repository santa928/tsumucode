// @vitest-environment node
import { describe, expect, it } from 'vitest';
function list() {
  return {
    errors: [],
    suites: [
      {
        specs: [
          {
            id: 'case-id',
            file: 'fixture.spec.ts',
            title: 'case',
            tests: [
              {
                projectName: 'chromium',
                expectedStatus: 'passed',
                results: [],
                annotations: [{ type: 'release-exercise', description: 'exercise' }],
              },
            ],
          },
        ],
      },
    ],
  };
}
describe('independent source test inventory', () => {
  it('freezes declared test IDs and semantic exercise annotations before execution', async () => {
    const { parseTestList, verifyTestExecution } =
      await import('../../../../scripts/release/v2/testManifest');
    const frozen = parseTestList(list(), 'browser-chromium-1', 'browser', 'chromium');
    expect(frozen.tests).toEqual([{ key: 'case-id/chromium', exerciseIds: ['exercise'] }]);
    const actual = list();
    Reflect.set(actual.suites[0]!.specs[0]!.tests[0]!, 'status', 'expected');
    Reflect.set(actual.suites[0]!.specs[0]!.tests[0]!, 'results', [{ status: 'passed', retry: 0 }]);
    Reflect.set(actual, 'stats', { expected: 1, unexpected: 0, skipped: 0, flaky: 0 });
    expect(verifyTestExecution(actual, frozen)).toEqual([
      'test/browser-chromium-1/case-id/chromium',
    ]);
  });
  it.each(['empty', 'duplicate', 'project', 'executed-list', 'collection-error', 'static-skip'])(
    'refuses %s test collection',
    async (failure) => {
      const { parseTestList } = await import('../../../../scripts/release/v2/testManifest');
      const input = list(),
        test = input.suites[0]!.specs[0]!.tests[0]!;
      if (failure === 'empty') input.suites = [];
      if (failure === 'duplicate') input.suites.push(input.suites[0]!);
      if (failure === 'project') test.projectName = 'webkit';
      if (failure === 'executed-list') Reflect.set(test, 'results', [{ status: 'passed' }]);
      if (failure === 'collection-error')
        Reflect.set(input, 'errors', [{ message: 'collection failed' }]);
      if (failure === 'static-skip') test.expectedStatus = 'skipped';
      expect(() => parseTestList(input, 'browser-chromium-1', 'browser', 'chromium')).toThrow();
    },
  );
  it.each(['missing', 'extra', 'duplicate', 'skipped', 'flaky', 'failed', 'wrong-project'])(
    'refuses %s execution despite a plausible successful summary',
    async (failure) => {
      const { parseTestList, verifyTestExecution } =
        await import('../../../../scripts/release/v2/testManifest');
      const frozen = parseTestList(list(), 'browser-chromium-1', 'browser', 'chromium');
      const actual = list();
      const test = actual.suites[0]!.specs[0]!.tests[0]!;
      Reflect.set(test, 'status', 'expected');
      Reflect.set(test, 'results', [{ status: 'passed', retry: 0 }]);
      Reflect.set(actual, 'stats', { expected: 1, unexpected: 0, skipped: 0, flaky: 0 });
      if (failure === 'missing') actual.suites = [];
      if (failure === 'extra')
        actual.suites.push({ specs: [{ ...actual.suites[0]!.specs[0]!, id: 'other' }] });
      if (failure === 'duplicate') actual.suites.push(actual.suites[0]!);
      if (failure === 'skipped') Reflect.set(test, 'results', [{ status: 'skipped', retry: 0 }]);
      if (failure === 'flaky') Reflect.set(test, 'status', 'flaky');
      if (failure === 'failed') Reflect.set(test, 'results', [{ status: 'failed', retry: 0 }]);
      if (failure === 'wrong-project') test.projectName = 'webkit';
      expect(() => verifyTestExecution(actual, frozen)).toThrow();
    },
  );
});
