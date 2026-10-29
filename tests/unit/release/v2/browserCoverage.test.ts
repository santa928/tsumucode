// @vitest-environment node
import { describe, expect, it } from 'vitest';
const target = {
  key: 'topic/lesson/exercise/authored/wrong/browser',
  kind: 'fixture',
  courseId: 'topic',
  lessonId: 'lesson',
  exerciseId: 'exercise',
  fixtureId: 'wrong',
  caseKind: 'authored',
  runtimeKind: 'html-css',
  mode: 'browser',
  inputDigest: 'a'.repeat(64),
  sourceDigest: 'b'.repeat(64),
  expectedStatus: 'incomplete',
};
const row = {
  schemaVersion: 1,
  key: target.key,
  inputDigest: target.inputDigest,
  sourceDigest: target.sourceDigest,
  actualStatus: 'incomplete',
};
function report(observation: unknown = row) {
  return {
    stats: { expected: 1, unexpected: 0, flaky: 0, skipped: 0 },
    suites: [
      {
        specs: [
          {
            tests: [
              {
                projectName: 'chromium',
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
                        body: Buffer.from(JSON.stringify([observation])).toString('base64'),
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
describe('actual fixture coverage from browser reports', () => {
  it('reads actual observations only from successful matching project execution', async () => {
    const { readBrowserCoverage } = await import('../../../../scripts/release/v2/browserCoverage');
    expect(readBrowserCoverage(report(), [target], 'chromium')).toEqual([target.key]);
  });
  it.each([
    'missing',
    'duplicate',
    'extra',
    'source',
    'exercise',
    'status',
    'failed',
    'flaky',
    'skipped',
    'project',
    'path-only',
    'no-tests',
  ])('refuses %s evidence instead of stamping requested targets as passed', async (failure) => {
    const { readBrowserCoverage } = await import('../../../../scripts/release/v2/browserCoverage');
    const data = report();
    const test = data.suites[0]!.specs[0]!.tests[0]!;
    const result = test.results[0]!;
    if (failure === 'missing') result.attachments = [];
    if (failure === 'duplicate') result.attachments.push(result.attachments[0]!);
    if (failure === 'extra')
      result.attachments[0]!.body = Buffer.from(
        JSON.stringify([row, { ...row, key: 'extra' }]),
      ).toString('base64');
    if (failure === 'source')
      result.attachments[0]!.body = Buffer.from(
        JSON.stringify([{ ...row, sourceDigest: 'c'.repeat(64) }]),
      ).toString('base64');
    if (failure === 'exercise')
      result.attachments[0]!.body = Buffer.from(
        JSON.stringify([{ ...row, inputDigest: 'c'.repeat(64) }]),
      ).toString('base64');
    if (failure === 'status')
      result.attachments[0]!.body = Buffer.from(
        JSON.stringify([{ ...row, actualStatus: 'pass' }]),
      ).toString('base64');
    if (failure === 'failed') result.status = 'failed';
    if (failure === 'flaky') data.stats.flaky = 1;
    if (failure === 'skipped') data.stats.skipped = 1;
    if (failure === 'project') test.projectName = 'firefox';
    if (failure === 'path-only') Reflect.deleteProperty(result.attachments[0]!, 'body');
    if (failure === 'no-tests') data.suites = [];
    expect(() => readBrowserCoverage(data, [target], 'chromium')).toThrow();
  });
});
