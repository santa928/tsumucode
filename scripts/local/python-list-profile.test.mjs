import { expect, it } from 'vitest';
import { parsePythonAnalysis } from './python-profile.mjs';
import { validateRun, PYTHON_PROFILE_ID } from './protocol.mjs';
import { expectedPythonOutput } from '../../src/core/runtime/pythonLessonProfiles.mjs';
import { pythonFixedFixtures } from '../../src/core/runtime/pythonFixedFixtures.mjs';

it.each([
  ['values', 'list-values-update-v1', '3\n4\n'],
  ['iterate', 'list-iterate-sum-v1', '9\n'],
])('Listの%s課題を固定IDと無入力の採点ケースで受け付ける', (suffix, profile, output) => {
  const input = {
    apiVersion: 1,
    exerciseId: `python-basics-ch01-l05-${suffix}-e01`,
    runtimeProfileId: PYTHON_PROFILE_ID,
    contentRevision: 'list-r1',
    runId: 'list-run',
    exerciseSessionId: 'list-session',
    executionRevision: 1,
    files: { 'main.py': '' },
  };
  expect(validateRun(input, 'javascript-r1', 'list-r1')).toBe(input);
  expect(expectedPythonOutput(profile, [])).toBe(output);
  expect(pythonFixedFixtures(profile)).toEqual([
    { id: 'list', inputLines: [], expectedOutput: output },
  ]);
});

it.each(['list-values-update-v1', 'list-iterate-sum-v1'])(
  '%sは欠落・余剰・文字列のfactを採点へ通さない',
  (profile) => {
    const packet = {
      version: '3.14.2',
      supported: true,
      numericVariablePrinted: false,
      sameVariableAdditionPrinted: false,
      listValuesUpdated: profile === 'list-values-update-v1',
      listIteratedSummed: profile === 'list-iterate-sum-v1',
    };
    expect(parsePythonAnalysis(JSON.stringify(packet), '', 0, profile)).toEqual(packet);
    for (const changed of [
      { ...packet, listValuesUpdated: undefined },
      { ...packet, listIteratedSummed: 'true' },
      { ...packet, listReferenceSummed: true },
    ]) {
      expect(() => parsePythonAnalysis(JSON.stringify(changed), '', 0, profile)).toThrow();
    }
  },
);
