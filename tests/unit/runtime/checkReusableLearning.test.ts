// @vitest-environment node
/** 通常教材の元TSを固定Compilerで調べ、型成功と学習条件を区別する。 */
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadAuthoringCourse } from '../../../scripts/content/compileCourse';
import { compileTypeScript } from '../../../src/adapters/runtime/typescript/compileTypeScript';
import {
  checkReusableLearning,
  type ReusableLearningProfile,
} from '../../../src/adapters/runtime/typescript/checkReusableLearning';
import { isReusableLearningResult } from '../../../src/adapters/runtime/typescript/workerContract';

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
  ['typescript-ch04-l01-e01', 'number-callback-v1'],
  ['typescript-ch04-l02-e01', 'generic-identity-v1'],
  ['typescript-ch04-l03-e01', 'readonly-copy-v1'],
] as const) {
  describe(`${profile}の有限な型条件`, () => {
    it('式の括弧を付けた合法な別解でも型と値の関係を保つ', () => {
      const exercise = exercises.find((exercise) => exercise.id === id)!;
      const source = exercise.fixtures
        .find((fixture) => fixture.id === 'parenthesized')!
        .files.find((file) => file.path === 'main.ts')!.content;
      expect(source).toMatch(/\(\((?:value|2|original)\)\)/u);
      const files = { 'main.ts': source };
      expect(compileTypeScript(files, libraries).status).toBe('ready');
      const result = checkReusableLearning(files, libraries, profile);
      expect(isReusableLearningResult(result, profile)).toBe(true);
      expect(result.status).toBe('ready');
      if (result.status === 'ready') expect(Object.values(result.facts).every(Boolean)).toBe(true);
      expect(files['main.ts']).toBe(source);
    }, 20_000);

    it('通常Fixtureの型診断と、再利用・別解・条件回避の学習条件を区別する', () => {
      const exercise = exercises.find((exercise) => exercise.id === id)!;
      for (const fixture of exercise.fixtures) {
        const source = fixture.files.find((file) => file.path === 'main.ts')!.content;
        const files = { 'main.ts': source };
        const compiled = compileTypeScript(files, libraries);
        if (fixture.expectedStatus === 'code-error' && fixture.id !== 'error-after-output') {
          expect(compiled.status, fixture.id).toBe('type-error');
          if (compiled.status !== 'ready' && fixture.expectedDiagnosticCodes)
            expect(
              compiled.diagnostics.map(({ code }) => `typescript-type-error-${String(code)}`),
              fixture.id,
            ).toEqual(fixture.expectedDiagnosticCodes);
          expect(compiled).not.toHaveProperty('files');
          continue;
        }
        expect(compiled.status, fixture.id).toBe('ready');
        const result = checkReusableLearning(files, libraries, profile);
        expect(isReusableLearningResult(result, profile), fixture.id).toBe(true);
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
      const broadened = source.replace(/number|readonly number\[\]/u, 'any');
      const result = checkReusableLearning({ 'main.ts': broadened }, libraries, profile);
      expect(result.status).toBe('ready');
      if (result.status === 'ready') expect(Object.values(result.facts).every(Boolean)).toBe(false);
      expect(checkReusableLearning({ '__tsumucode_copy.ts': '' }, libraries, profile)).toEqual({
        status: 'system-error',
      });
      expect(
        checkReusableLearning({ 'main.ts': source + ' '.repeat(8192) }, libraries, profile),
      ).toEqual({ status: 'system-error' });
      expect(checkReusableLearning({ 'main.ts': source }, {}, profile)).toEqual({
        status: 'system-error',
      });
    }, 20_000);

    it('他profile・余分なpayload・成立しないprobeをWorker境界で拒否する', () => {
      const source = exercises
        .find((exercise) => exercise.id === id)!
        .solutionFiles.find((file) => file.path === 'main.ts')!.content;
      const result = checkReusableLearning({ 'main.ts': source }, libraries, profile);
      expect(result.status).toBe('ready');
      if (result.status !== 'ready') return;
      expect(isReusableLearningResult(result, profile)).toBe(true);
      const other: ReusableLearningProfile =
        profile === 'number-callback-v1' ? 'generic-identity-v1' : 'number-callback-v1';
      expect(isReusableLearningResult(result, other)).toBe(false);
      expect(isReusableLearningResult({ ...result, files: {} }, profile)).toBe(false);
      expect(
        isReusableLearningResult(
          { ...result, facts: { ...result.facts, positiveProbeAccepted: false } },
          profile,
        ),
      ).toBe(false);
      expect(
        isReusableLearningResult(
          { ...result, facts: { ...result.facts, typeContractAccepted: false } },
          profile,
        ),
      ).toBe(false);
      expect(isReusableLearningResult({ status: 'system-error', profile }, profile)).toBe(false);
    }, 20_000);
  });
}
