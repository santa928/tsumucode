import { describe, expect, it } from 'vitest';
import { fixtureCourse } from '../../../tests/fixtures/course';
import { validationRule } from '../../../tests/fixtures/validation';
import type { Exercise } from '../../core/content/types';
import { selectBrowserConsoleRuntime } from './browserConsoleRuntime';
const base = fixtureCourse.phases[0]!.chapters[0]!.lessons[0]!.exercises[0]!;
const exercise: Exercise = {
  ...base,
  id: 'javascript-ch03-l05-e01',
  runtime: {
    kind: 'javascript',
    entryFile: 'script.js',
    sourceType: 'script',
    capabilityProfile: 'core',
    primaryOutput: 'console',
  },
  validationRules: [
    {
      ...validationRule(),
      target: { kind: 'javascript-console' },
      assertion: {
        kind: 'javascript-console',
        operator: 'equals',
        expected: [{ level: 'log', text: '10' }],
      },
    },
  ],
};
describe('Closure Console runtime selection', () => {
  it.each(['javascript-ch03-l05-e01', 'javascript-ch03-l05-e02', 'javascript-ch03-l05-e03'])(
    '有限対象%sの実行と採点を一組で選ぶ',
    (id) => {
      const target = { ...exercise, id };
      const selected = selectBrowserConsoleRuntime(target, [target]);
      expect(selected?.createExecution().environment.mode).toBe('console');
      expect(selected?.createValidator()).toBeDefined();
    },
  );
  it('対象外ID・DOMルール混入・module・previewの時に片側だけ切り替えない', () => {
    expect(
      selectBrowserConsoleRuntime({ ...exercise, id: 'javascript-ch00-l01-e01' }, [exercise]),
    ).toBeUndefined();
    expect(
      selectBrowserConsoleRuntime(exercise, [
        exercise,
        { ...exercise, validationRules: [validationRule()] },
      ]),
    ).toBeUndefined();
    expect(
      selectBrowserConsoleRuntime(
        { ...exercise, runtime: { ...exercise.runtime!, sourceType: 'module' } },
        [exercise],
      ),
    ).toBeUndefined();
    expect(
      selectBrowserConsoleRuntime(
        { ...exercise, runtime: { ...exercise.runtime!, primaryOutput: 'preview' } },
        [exercise],
      ),
    ).toBeUndefined();
    expect(selectBrowserConsoleRuntime(exercise, [])).toBeUndefined();
  });
});
