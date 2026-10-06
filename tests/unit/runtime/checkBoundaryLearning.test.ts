// @vitest-environment node
/** 通常教材の元TSを固定Compilerで調べ、型成功と学習条件を区別する。 */
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadAuthoringCourse } from '../../../scripts/content/compileCourse';
import { compileTypeScript } from '../../../src/adapters/runtime/typescript/compileTypeScript';
import { checkBoundaryLearning } from '../../../src/adapters/runtime/typescript/checkBoundaryLearning';
import type { TypeScriptBoundaryProfile } from '../../../src/core/content/typeScriptBoundaryContract';
import { isBoundaryLearningResult } from '../../../src/adapters/runtime/typescript/workerContract';

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
  ['typescript-ch05-l01-e01', 'dom-event-v1'],
  ['typescript-ch05-l02-e01', 'unknown-points-v1'],
  ['typescript-ch05-l03-e01', 'async-unknown-v1'],
] as const) {
  describe(`${profile}の有限な型条件`, () => {
    it('式の括弧を付けた合法な別解でも型と値の関係を保つ', () => {
      const exercise = exercises.find((exercise) => exercise.id === id)!;
      const source = exercise.fixtures
        .find((fixture) => fixture.id === 'parenthesized')!
        .files.find((file) => file.path === 'main.ts')!.content;
      expect(source).toMatch(/\((?:event|value|mode)\)/u);
      const files = { 'main.ts': source };
      expect(compileTypeScript(files, libraries).status).toBe('ready');
      const result = checkBoundaryLearning(files, libraries, profile);
      expect(isBoundaryLearningResult(result, profile)).toBe(true);
      expect(result.status).toBe('ready');
      if (result.status === 'ready') expect(Object.values(result.facts).every(Boolean)).toBe(true);
      expect(files['main.ts']).toBe(source);
    }, 20_000);

    it('通常Fixtureの型診断と、境界確認・別解・条件回避の学習条件を区別する', () => {
      const exercise = exercises.find((exercise) => exercise.id === id)!;
      for (const fixture of exercise.fixtures) {
        const source = fixture.files.find((file) => file.path === 'main.ts')!.content;
        const files = { 'main.ts': source };
        const compiled = compileTypeScript(files, libraries);
        if (
          fixture.expectedStatus === 'code-error' &&
          fixture.expectedDiagnosticCodes?.some((code) => code.startsWith('typescript-'))
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
        const result = checkBoundaryLearning(files, libraries, profile);
        expect(isBoundaryLearningResult(result, profile), fixture.id).toBe(true);
        expect(result.status, fixture.id).toBe('ready');
        if (result.status !== 'ready') continue;
        const expected =
          fixture.expectedStatus !== 'code-error' &&
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
      const broadened = source.replace(/Event|unknown/u, 'any');
      const result = checkBoundaryLearning({ 'main.ts': broadened }, libraries, profile);
      expect(result.status).toBe('ready');
      if (result.status === 'ready') expect(Object.values(result.facts).every(Boolean)).toBe(false);
      expect(checkBoundaryLearning({ '__tsumucode_copy.ts': '' }, libraries, profile)).toEqual({
        status: 'system-error',
      });
      expect(
        checkBoundaryLearning({ 'main.ts': source + ' '.repeat(8192) }, libraries, profile),
      ).toEqual({ status: 'system-error' });
      expect(checkBoundaryLearning({ 'main.ts': source }, {}, profile)).toEqual({
        status: 'system-error',
      });
    }, 20_000);

    it('他profile・余分なpayload・成立しないprobeをWorker境界で拒否する', () => {
      const source = exercises
        .find((exercise) => exercise.id === id)!
        .solutionFiles.find((file) => file.path === 'main.ts')!.content;
      const result = checkBoundaryLearning({ 'main.ts': source }, libraries, profile);
      expect(result.status).toBe('ready');
      if (result.status !== 'ready') return;
      expect(isBoundaryLearningResult(result, profile)).toBe(true);
      const other: TypeScriptBoundaryProfile =
        profile === 'dom-event-v1' ? 'unknown-points-v1' : 'dom-event-v1';
      expect(isBoundaryLearningResult(result, other)).toBe(false);
      expect(isBoundaryLearningResult({ ...result, files: {} }, profile)).toBe(false);
      expect(
        isBoundaryLearningResult(
          { ...result, facts: { ...result.facts, positiveProbeAccepted: false } },
          profile,
        ),
      ).toBe(false);
      expect(
        isBoundaryLearningResult(
          { ...result, facts: { ...result.facts, typeContractAccepted: false } },
          profile,
        ),
      ).toBe(false);
      expect(isBoundaryLearningResult({ status: 'system-error', profile }, profile)).toBe(false);
    }, 20_000);
  });
}

/** 部分例にはSlide本文で指定された関数・null確認の文脈を付け、型エラー例も照合する。 */
describe('Chapter 05の表示コード', () => {
  it('12枚の最小例を実Compilerで確認する', async () => {
    for (const suffix of ['01', '02', '03']) {
      const lesson = `typescript-ch05-l${suffix}`;
      const root = `content/typescript/chapters/typescript-ch05/lessons/${lesson}`;
      const solution = exercises
        .find(({ id }) => id === `${lesson}-e01`)!
        .solutionFiles.find(({ path }) => path === 'main.ts')!.content;
      for (const slide of ['01', '02', '03', '04']) {
        const markdown = readFileSync(`${root}/slides/s${slide}.md`, 'utf8');
        const code = markdown.match(/```ts\n([\s\S]*?)\n```/u)?.[1];
        expect(code, `${lesson}-s${slide}`).toBeDefined();
        if (code === undefined) throw new Error('表示コードがありません');
        let context = code;
        if (suffix === '01' && slide === '03')
          context = `${solution.slice(0, solution.indexOf('const output'))}
const output = document.querySelector('#output');
const answer = document.querySelector('#answer');
if (output !== null && answer !== null) { ${code} }`;
        if (suffix === '01' && slide === '04')
          context = `function readAnswer(event: Event): string { ${code} return '対象が違います'; }`;
        if (suffix === '02' && slide === '02')
          context = `function valid(value: unknown): boolean { return ${code} }`;
        if (suffix === '02' && slide === '03')
          context = `function formatPoints(value: unknown): string { ${code} }`;
        if (suffix === '02' && slide === '04')
          context = `${solution.slice(0, solution.indexOf('const output'))}\n${code}`;
        if (suffix === '03' && ['02', '03'].includes(slide))
          context = `${solution.slice(0, solution.indexOf('async function show'))}
async function show(mode: LoadMode): Promise<void> {
const output = document.querySelector('#output');
if (output === null) return;
${code}
}`;
        if (suffix === '03' && slide === '04')
          context = `${solution.slice(0, solution.indexOf('const success'))}
const success = document.querySelector('#success');
if (success !== null) { ${code} }`;
        const compiled = compileTypeScript({ 'main.ts': context }, libraries);
        if (suffix === '02' && slide === '01') {
          expect(compiled.status).toBe('type-error');
          if (compiled.status === 'type-error')
            expect(compiled.diagnostics.map(({ code }) => code)).toEqual([18046]);
        } else expect(compiled.status, `${lesson}-s${slide}`).toBe('ready');
      }
    }
  }, 60_000);
});
