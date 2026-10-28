// @vitest-environment node
import { describe, expect, it } from 'vitest';
const target = {
  key: 'topic/lesson/persistence',
  kind: 'persistence',
  courseId: 'topic',
  lessonId: 'lesson',
  inputDigest: 'a'.repeat(64),
};
function report() {
  return {
    rows: [{ key: target.key, inputDigest: target.inputDigest }],
    knownCourses: ['topic', 'dormant'],
    workspaces: 2,
    synthetic: true,
  };
}
function browser(value: unknown) {
  return {
    suites: [
      {
        specs: [
          {
            tests: [
              {
                results: [
                  {
                    attachments: [
                      {
                        name: 'release-persistence-v1',
                        contentType: 'application/json',
                        body: Buffer.from(JSON.stringify(value)).toString('base64'),
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
describe('actual persistence observation', () => {
  it('binds synthetic roundtrip observations to every current published target and known course', async () => {
    const { readPersistenceCoverage } =
      await import('../../../../scripts/release/v2/persistenceCoverage');
    expect(readPersistenceCoverage(browser(report()), [target], ['topic', 'dormant'], 2)).toEqual([
      target.key,
    ]);
  });
  it.each(['missing', 'stale', 'duplicate', 'unknown', 'dormant', 'workspace', 'not-synthetic'])(
    'rejects %s evidence',
    async (failure) => {
      const { readPersistenceCoverage } =
        await import('../../../../scripts/release/v2/persistenceCoverage');
      const value = report();
      if (failure === 'missing') value.rows = [];
      if (failure === 'stale') value.rows[0]!.inputDigest = 'b'.repeat(64);
      if (failure === 'duplicate') value.rows.push(value.rows[0]!);
      if (failure === 'unknown') value.rows[0]!.key = 'unknown';
      if (failure === 'dormant') value.knownCourses.pop();
      if (failure === 'workspace') value.workspaces = 1;
      if (failure === 'not-synthetic') value.synthetic = false;
      expect(() =>
        readPersistenceCoverage(browser(value), [target], ['topic', 'dormant'], 2),
      ).toThrow();
    },
  );
});
