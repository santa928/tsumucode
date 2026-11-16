import { expect, it } from 'vitest';
import { summarizeManifestDiagnostic } from '../local/manifestDiagnosticSummary.mjs';

it('emits only the two fixed test names and bounded classification', () => {
  const annotation = JSON.stringify({
    phase: 'history',
    round: 2,
    beforeCapped: 1,
    afterCapped: 1,
    grew: false,
    status: null,
  });
  const input = {
    suites: [
      {
        specs: [
          {
            title: 'python-practice/python-practice-ch02-l01 actual learning UI',
            tests: [
              {
                status: 'unexpected',
                annotations: [{ type: 'manifest-learning-diagnostic', description: annotation }],
                arbitrary: 'private-marker',
              },
            ],
          },
          {
            title: 'python-practice/python-practice-ch03-l01 actual learning UI',
            tests: [{ status: 'expected', annotations: [] }],
          },
        ],
      },
    ],
  };
  const output = summarizeManifestDiagnostic(input);
  expect(output.tests.map((row: { lesson: string }) => row.lesson)).toEqual(['ch02', 'ch03']);
  expect(JSON.stringify(output)).not.toContain('private-marker');
  expect(() => summarizeManifestDiagnostic({ suites: [] })).toThrow(
    'Diagnostic selection mismatch',
  );
  const altered = structuredClone(input);
  altered.suites[0]!.specs[0]!.tests[0]!.annotations[0]!.description = JSON.stringify({
    phase: 'history',
    round: 2,
    beforeCapped: 1,
    afterCapped: 1,
    grew: false,
    status: null,
    extra: 'private-marker',
  });
  expect(() => summarizeManifestDiagnostic(altered)).toThrow('Invalid diagnostic annotation');
});
