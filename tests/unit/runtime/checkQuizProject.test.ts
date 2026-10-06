// @vitest-environment node
/** 通常教材の元TSを固定Compilerで調べ、型成功と学習条件を区別する。 */
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { runInNewContext } from 'node:vm';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadAuthoringCourse } from '../../../scripts/content/compileCourse';
import { compileTypeScript } from '../../../src/adapters/runtime/typescript/compileTypeScript';
import ts from 'typescript';
import { inspectQuizProject } from '../../../src/adapters/runtime/typescript/inspectQuizProject';
import { checkQuizProject } from '../../../src/adapters/runtime/typescript/checkQuizProject';
import type { TypeScriptQuizProjectProfile } from '../../../src/core/content/typeScriptQuizProjectContract';
import { isQuizProjectResult } from '../../../src/adapters/runtime/typescript/workerContract';

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
  ['typescript-ch06-l01-e01', 'quiz-data-v1'],
  ['typescript-ch06-l02-e01', 'quiz-state-v1'],
  ['typescript-ch06-l03-e01', 'quiz-boundary-v1'],
] as const) {
  describe(`${profile}の有限な型条件`, () => {
    it('式の括弧を付けた合法な別解でも型と値の関係を保つ', () => {
      const exercise = exercises.find((exercise) => exercise.id === id)!;
      const source = exercise.fixtures
        .find((fixture) => fixture.id === 'parenthesized')!
        .files.find((file) => file.path === 'main.ts')!.content;
      expect(source).toContain("category: ('web')");
      expect(source).toContain("text: ('Webページの骨組みを作るのは？')");
      expect(source).toContain("choices: [('HTML'), ('CSS')]");
      expect(source).toContain("correct: ('HTML')");
      expect(source).toContain('(event).currentTarget');
      expect(source).toContain("console.log(('準備できました'))");
      if (profile === 'quiz-boundary-v1') {
        expect(source).toContain('(await loadQuestions((mode)))');
        expect(source).toContain('const decoded: Question[] = ([])');
      }
      const files = Object.fromEntries(
        exercise.fixtures
          .find((fixture) =>
            fixture.files.some((file) => file.path === 'main.ts' && file.content === source),
          )!
          .files.filter((file) => file.path.endsWith('.ts'))
          .map((file) => [file.path, file.content]),
      );
      expect(compileTypeScript(files, libraries).status).toBe('ready');
      const result = checkQuizProject(files, libraries, profile);
      expect(isQuizProjectResult(result, profile)).toBe(true);
      expect(result.status).toBe('ready');
      if (result.status === 'ready') expect(Object.values(result.facts).every(Boolean)).toBe(true);
      expect(files['main.ts']).toBe(source);
    }, 20_000);

    it('通常Fixtureの型診断と、境界確認・別解・条件回避の学習条件を区別する', () => {
      const exercise = exercises.find((exercise) => exercise.id === id)!;
      for (const fixture of exercise.fixtures) {
        const source = fixture.files.find((file) => file.path === 'main.ts')!.content;
        const files = Object.fromEntries(
          exercise.fixtures
            .find((fixture) =>
              fixture.files.some((file) => file.path === 'main.ts' && file.content === source),
            )!
            .files.filter((file) => file.path.endsWith('.ts'))
            .map((file) => [file.path, file.content]),
        );
        const compiled = compileTypeScript(files, libraries);
        if (
          fixture.expectedStatus === 'code-error' &&
          fixture.expectedDiagnosticCodes?.some((code) => code.startsWith('typescript-'))
        ) {
          expect(compiled.status, fixture.id).toBe('type-error');
          if (compiled.status === 'ready') throw new Error('型診断が必要です');
          expect(
            [
              ...new Set(
                compiled.diagnostics.map(({ code }) => `typescript-type-error-${String(code)}`),
              ),
            ],
            fixture.id,
          ).toEqual(fixture.expectedDiagnosticCodes);
          if (id === 'typescript-ch06-l01-e01' && fixture.id === 'starter')
            expect(compiled.diagnostics).toHaveLength(4);
          expect(compiled).not.toHaveProperty('files');
          continue;
        }
        expect(compiled.status, fixture.id).toBe('ready');
        const result = checkQuizProject(files, libraries, profile);
        expect(isQuizProjectResult(result, profile), fixture.id).toBe(true);
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
      const exercise = exercises.find((exercise) => exercise.id === id)!;
      const files = Object.fromEntries(
        exercise.solutionFiles
          .filter((file) => file.path.endsWith('.ts'))
          .map((file) => [file.path, file.content]),
      );
      const source = files['main.ts']!;
      const broadened = source.replace('event: Event', 'event: any');
      expect(broadened).toContain('event: any');
      const result = checkQuizProject({ ...files, 'main.ts': broadened }, libraries, profile);
      expect(result.status).toBe('ready');
      if (result.status === 'ready') expect(Object.values(result.facts).every(Boolean)).toBe(false);
      expect(checkQuizProject({ '__tsumucode_copy.ts': '' }, libraries, profile)).toEqual({
        status: 'system-error',
      });
      expect(
        checkQuizProject({ ...files, 'main.ts': source + ' '.repeat(8192) }, libraries, profile),
      ).toEqual({ status: 'system-error' });
      for (const excessive of [';'.repeat(2048), '('.repeat(65) + '0' + ')'.repeat(65)])
        expect(checkQuizProject({ ...files, 'main.ts': excessive }, libraries, profile)).toEqual({
          status: 'system-error',
        });
      expect(checkQuizProject(files, {}, profile)).toEqual({
        status: 'system-error',
      });
    }, 20_000);

    it('他profile・余分なpayload・成立しないprobeをWorker境界で拒否する', () => {
      const exercise = exercises.find((exercise) => exercise.id === id)!;
      const files = Object.fromEntries(
        exercise.solutionFiles
          .filter((file) => file.path.endsWith('.ts'))
          .map((file) => [file.path, file.content]),
      );
      const result = checkQuizProject(files, libraries, profile);
      expect(result.status).toBe('ready');
      if (result.status !== 'ready') return;
      expect(isQuizProjectResult(result, profile)).toBe(true);
      const other: TypeScriptQuizProjectProfile =
        profile === 'quiz-data-v1' ? 'quiz-state-v1' : 'quiz-data-v1';
      expect(isQuizProjectResult(result, other)).toBe(false);
      expect(isQuizProjectResult({ ...result, files: {} }, profile)).toBe(false);
      expect(
        isQuizProjectResult(
          { ...result, facts: { ...result.facts, positiveProbeAccepted: false } },
          profile,
        ),
      ).toBe(false);
      expect(
        isQuizProjectResult(
          { ...result, facts: { ...result.facts, typeContractAccepted: false } },
          profile,
        ),
      ).toBe(false);
      expect(isQuizProjectResult({ status: 'system-error', profile }, profile)).toBe(false);
    }, 20_000);
  });
}

describe('unknown境界の条件分割とError条件式', () => {
  const guards = `
  if (typeof value !== 'object' || value === null ||
      !('category' in value) || !('text' in value) ||
      !('choices' in value) || !('correct' in value)) {
    return undefined;
  }
  if (value.category !== 'web' && value.category !== 'logic') return undefined;
  if (typeof value.text !== 'string' || typeof value.correct !== 'string') {
    return undefined;
  }
  if (!Array.isArray(value.choices) || value.choices.length !== 2) return undefined;
  const first: unknown = value.choices[0];
  const second: unknown = value.choices[1];
  if (typeof first !== 'string' || typeof second !== 'string') return undefined;
  if (value.correct !== first && value.correct !== second) return undefined;
  return {
    category: value.category,
    text: value.text,
    choices: [first, second],
    correct: value.correct,
  };
`;

  function alternativeFiles(): Readonly<Record<string, string>> {
    const exercise = exercises.find((exercise) => exercise.id === 'typescript-ch06-l03-e01')!;
    const files = Object.fromEntries(
      exercise.solutionFiles
        .filter((file) => file.path.endsWith('.ts'))
        .map((file) => [file.path, file.content]),
    );
    const source = files['main.ts']!;
    const start = source.indexOf('function decodeQuestion(');
    const body = source.indexOf('{', start);
    const end = source.indexOf('\n}\n', body);
    const rewritten = source.slice(0, body + 1) + guards + source.slice(end);
    return {
      ...files,
      'main.ts': rewritten.replace(
        "if (error instanceof Error) return { kind: 'failed', message: error.message };\n    return { kind: 'failed', message: '不明な失敗です' };",
        "return { kind: 'failed', message: error instanceof Error ? error.message : '不明な失敗です' };",
      ),
    };
  }

  it('ブロックと連続early return、長さの先行確認、実Errorの条件式を3工程で扱う', () => {
    const files = alternativeFiles();
    expect(files['main.ts']).toContain('message: error instanceof Error ?');
    expect(compileTypeScript(files, libraries).status).toBe('ready');
    for (const profile of ['quiz-data-v1', 'quiz-state-v1', 'quiz-boundary-v1'] as const) {
      const inspected = inspectQuizProject(
        ts.createSourceFile('main.ts', files['main.ts']!, ts.ScriptTarget.ES2023, true),
        profile,
      );
      expect(Object.values(inspected).every(Boolean), profile).toBe(true);
    }
    const result = checkQuizProject(files, libraries, 'quiz-boundary-v1');
    expect(result.status).toBe('ready');
    if (result.status === 'ready') expect(Object.values(result.facts).every(Boolean)).toBe(true);
  }, 20_000);

  it('分割した条件の欠落、確認前の副作用、固定Errorへの置換を受け入れない', () => {
    const source = alternativeFiles()['main.ts']!;
    for (const mutated of [
      source.replace(' || value.choices.length !== 2', ''),
      source.replace("typeof second !== 'string'", "typeof first !== 'string'"),
      source.replace('    return undefined;', "    console.log('失敗'); return undefined;"),
      source.replace(
        "error instanceof Error ? error.message : '不明な失敗です'",
        "'不明な失敗です'",
      ),
    ]) {
      expect(mutated).not.toBe(source);
      const inspected = inspectQuizProject(
        ts.createSourceFile('main.ts', mutated, ts.ScriptTarget.ES2023, true),
        'quiz-boundary-v1',
      );
      expect(inspected.programShapeAccepted).toBe(true);
      expect(inspected.usesLearningValues).toBe(false);
    }
  });
});

it('3工程の掲載9例を実Compilerで確認し、Checklistは前提コード参照へ分ける', () => {
  let count = 0;
  for (const suffix of ['01', '02', '03'])
    for (const slide of ['01', '02', '03', '04']) {
      const markdown = readFileSync(
        `content/typescript/chapters/typescript-ch06/lessons/typescript-ch06-l${suffix}/slides/s${slide}.md`,
        'utf8',
      );
      const code = markdown.match(/```ts\n([\s\S]*?)\n```/u)?.[1];
      if (slide === '04') {
        expect(code).toBeUndefined();
        continue;
      }
      expect(code).toBeDefined();
      expect(compileTypeScript({ 'main.ts': code! }, libraries).status).toBe('ready');
      count += 1;
    }
  expect(count).toBe(9);
}, 30000);

it('Guideの別題材を実Compilerと実JSで確認し、1件不正の配列を成功にしない', () => {
  const guide = readFileSync(
    'content/typescript/chapters/typescript-ch06/lessons/typescript-ch06-l03/guide.md',
    'utf8',
  );
  const code = guide.match(/```ts\n([\s\S]*?)\n```/u)?.[1];
  expect(code).toBeDefined();
  const compiled = compileTypeScript({ 'main.ts': code! }, libraries);
  expect(compiled.status).toBe('ready');
  if (compiled.status !== 'ready') throw new Error('掲載例の型検査が必要です');
  const main = compiled.files['main.js']!;
  const values = runInNewContext(
    `${main}\nJSON.stringify([
      readLabel(null), readLabel({ text: 1 }), readLabel({ text: '' }),
      collectLabels([{ text: '先頭' }, { text: 1 }, { text: '末尾' }]),
      collectLabels([{ text: '先頭' }, { text: '末尾' }])
    ])`,
  ) as string;
  expect(JSON.parse(values)).toEqual([
    null,
    null,
    { text: '' },
    { kind: 'bad' },
    { kind: 'ok', labels: [{ text: '先頭' }, { text: '末尾' }] },
  ]);
}, 10_000);
