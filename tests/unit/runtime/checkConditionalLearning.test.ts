// @vitest-environment node
/** 通常教材の元TSを固定Compilerで調べ、型成功と学習条件を区別する。 */
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadAuthoringCourse } from '../../../scripts/content/compileCourse';
import { compileTypeScript } from '../../../src/adapters/runtime/typescript/compileTypeScript';
import {
  checkConditionalLearning,
  type ConditionalLearningProfile,
} from '../../../src/adapters/runtime/typescript/checkConditionalLearning';
import { isConditionalLearningResult } from '../../../src/adapters/runtime/typescript/workerContract';

const require = createRequire(import.meta.url);
const directory = path.dirname(require.resolve('typescript'));
const libraries = Object.fromEntries(
  readdirSync(directory)
    .filter((name) => /^lib\..*\.d\.ts$/u.test(name))
    .map((name) => [name, readFileSync(path.join(directory, name), 'utf8')]),
);
let exercises: Awaited<ReturnType<typeof loadAuthoringCourse>>['exercises'];
beforeAll(async () => {
  exercises = (await loadAuthoringCourse('content/typescript')).exercises;
});

for (const [id, profile] of [
  ['typescript-ch03-l01-e01', 'union-result-v1'],
  ['typescript-ch03-l02-e01', 'optional-hint-v1'],
] as const) {
  describe(`${profile}の有限な型条件`, () => {
    it('通常Fixtureの型診断と、分岐・別解・条件回避の学習条件を区別する', () => {
      const exercise = exercises.find((exercise) => exercise.id === id)!;
      for (const fixture of exercise.fixtures) {
        const source = fixture.files.find((file) => file.path === 'main.ts')!.content;
        const files = { 'main.ts': source };
        const compiled = compileTypeScript(files, libraries);
        if (
          fixture.expectedDiagnosticCodes?.some((code) => code.startsWith('typescript-type-error-'))
        ) {
          expect(compiled.status, fixture.id).toBe('type-error');
          if (compiled.status !== 'ready')
            expect(
              compiled.diagnostics.map(({ code }) => `typescript-type-error-${String(code)}`),
              fixture.id,
            ).toEqual(fixture.expectedDiagnosticCodes);
          expect(compiled).not.toHaveProperty('files');
          continue;
        }
        expect(compiled.status, fixture.id).toBe('ready');
        const result = checkConditionalLearning(files, libraries, profile);
        expect(isConditionalLearningResult(result, profile), fixture.id).toBe(true);
        expect(result.status, fixture.id).toBe('ready');
        if (result.status !== 'ready') continue;
        const expected =
          fixture.id !== 'error-after-output' &&
          !fixture.expectedFeedbackRuleIds.includes(id + '-r01');
        expect(Object.values(result.facts).every(Boolean), fixture.id).toBe(expected);
        expect(files['main.ts']).toBe(source);
        expect(result).not.toHaveProperty('files');
        expect(result).not.toHaveProperty('diagnostics');
      }
    }, 120_000);

    it('型の弱化・予約名・検査予算・lib障害を合格にしない', () => {
      const source = exercises
        .find((exercise) => exercise.id === id)!
        .solutionFiles.find((file) => file.path === 'main.ts')!.content;
      const broadened =
        profile === 'union-result-v1'
          ? source.replace('points: number', 'points: any')
          : source.replace('hint?: string', 'hint?: any');
      const result = checkConditionalLearning({ 'main.ts': broadened }, libraries, profile);
      expect(result.status).toBe('ready');
      if (result.status === 'ready') expect(Object.values(result.facts).every(Boolean)).toBe(false);
      expect(checkConditionalLearning({ '__tsumucode_copy.ts': '' }, libraries, profile)).toEqual({
        status: 'system-error',
      });
      expect(
        checkConditionalLearning({ 'main.ts': source + ' '.repeat(8192) }, libraries, profile),
      ).toEqual({ status: 'system-error' });
      expect(checkConditionalLearning({ 'main.ts': source }, {}, profile)).toEqual({
        status: 'system-error',
      });
    }, 20_000);

    it('他profile・余分なpayload・成立しないprobeをWorker境界で拒否する', () => {
      const source = exercises
        .find((exercise) => exercise.id === id)!
        .solutionFiles.find((file) => file.path === 'main.ts')!.content;
      const result = checkConditionalLearning({ 'main.ts': source }, libraries, profile);
      expect(result.status).toBe('ready');
      if (result.status !== 'ready') return;
      expect(isConditionalLearningResult(result, profile)).toBe(true);
      const other: ConditionalLearningProfile =
        profile === 'union-result-v1' ? 'optional-hint-v1' : 'union-result-v1';
      expect(isConditionalLearningResult(result, other)).toBe(false);
      expect(isConditionalLearningResult({ ...result, files: {} }, profile)).toBe(false);
      expect(
        isConditionalLearningResult(
          { ...result, facts: { ...result.facts, positiveProbeAccepted: false } },
          profile,
        ),
      ).toBe(false);
      expect(
        isConditionalLearningResult(
          { ...result, facts: { ...result.facts, parameterAnnotationAccepted: false } },
          profile,
        ),
      ).toBe(false);
      expect(isConditionalLearningResult({ status: 'system-error', profile }, profile)).toBe(false);
    }, 20_000);
  });
}
