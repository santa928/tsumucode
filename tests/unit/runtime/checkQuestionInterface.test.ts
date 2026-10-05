// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkQuestionInterface } from '../../../src/adapters/runtime/typescript/checkQuestionInterface';
import { compileTypeScript } from '../../../src/adapters/runtime/typescript/compileTypeScript';
import { isQuestionInterfaceResult } from '../../../src/adapters/runtime/typescript/workerContract';

const require = createRequire(import.meta.url);
const libraryDirectory = path.dirname(require.resolve('typescript'));
const libraries = Object.fromEntries(
  readdirSync(libraryDirectory)
    .filter((name) => /^lib\..*\.d\.ts$/u.test(name))
    .map((name) => [name, readFileSync(path.join(libraryDirectory, name), 'utf8')]),
);
const solution = readFileSync(
  'content/typescript/chapters/typescript-ch02/lessons/typescript-ch02-l01/exercises/typescript-ch02-l01-e01/solution/main.ts',
  'utf8',
);

/** 型成功と学習条件の成立を別々に確かめ、元ソースが書き換わらないことも確認する。 */
function inspect(source: string) {
  const files = { 'main.ts': source };
  expect(compileTypeScript(files, libraries).status).toBe('ready');
  const result = checkQuestionInterface(files, libraries);
  expect(isQuestionInterfaceResult(result)).toBe(true);
  expect(files['main.ts']).toBe(source);
  expect(result).not.toHaveProperty('files');
  expect(result).not.toHaveProperty('sourceMaps');
  return result.status === 'ready' && Object.values(result.facts).every(Boolean);
}

describe('Question/interface演習の有限な型条件', () => {
  it('原稿と改名・項目順・配列表記・添字の別解を受け入れる', () => {
    expect(inspect(solution)).toBe(true);
    expect(
      inspect(
        solution
          .replaceAll('Question', 'QuizItem')
          .replaceAll('question', 'item')
          .replace('string[]', 'Array<string>')
          .replace('correctIndex: 0', 'correctIndex: 1 - 1')
          .replace(
            'item.choices.at(item.correctIndex)',
            'item["choices"].at(item["correctIndex"])',
          ),
      ),
    ).toBe(true);
    expect(
      inspect(
        solution.replace(
          '  prompt: string;\n  choices: string[];',
          '  choices: string[];\n  "prompt": string;',
        ),
      ),
    ).toBe(true);
  }, 30_000);

  it('必須項目の欠落と各項目の誤型を通常Compilerが拒否する', () => {
    const variants = [
      solution.replace("  prompt: 'HTMLが受け持つものは？',\n", ''),
      solution.replace("  choices: ['内容', '見た目'],\n", ''),
      solution.replace('  correctIndex: 0,\n', ''),
      solution.replace("prompt: 'HTMLが受け持つものは？'", 'prompt: 1'),
      solution.replace("choices: ['内容', '見た目']", 'choices: 1'),
      solution.replace('correctIndex: 0', "correctIndex: '0'"),
    ];
    variants.forEach((source, index) => {
      const result = compileTypeScript({ 'main.ts': source }, libraries);
      expect(result.status).toBe('type-error');
      expect(result).not.toHaveProperty('files');
      if (result.status !== 'ready')
        expect(result.diagnostics.map(({ code }) => code)).toContain(index < 3 ? 2741 : 2322);
    });
  }, 30_000);

  it('型成功でもany・assertion・診断抑制・形の拡大・固定表示を学習達成にしない', () => {
    const variants = [
      solution.replace('question: Question', 'question: any'),
      '// @ts-nocheck\n' + solution,
      '// @ts-ignore\n' + solution,
      solution.replace('correctIndex: number;', 'correctIndex: any;'),
      solution
        .replace('correctIndex: number;', 'correctIndex?: number;')
        .replace('question.correctIndex)', 'question.correctIndex!)'),
      solution
        .replace('correctIndex: number;', 'correctIndex: number | string;')
        .replace('question.correctIndex)', '(question.correctIndex as number))'),
      solution.replace('question: Question', 'question') + '\n',
      solution.replace('interface Question {', 'type Question = {'),
      solution.replace(
        'console.log(question.choices.at(question.correctIndex));',
        'console.log("内容");',
      ),
      solution.replace("prompt: 'HTMLが受け持つものは？'", "prompt: '別の問題'"),
      solution.replace('correctIndex: 0', 'correctIndex: 0 as number'),
      solution.replace('correctIndex: 0', 'correctIndex: -2'),
      solution.replace('correctIndex: 0', 'correctIndex: 0.5'),
      solution
        .replace('const question', 'let question')
        .replace('console.log', 'question.correctIndex = 0;\nconsole.log'),
    ];
    variants.forEach((source) => {
      expect(inspect(source)).toBe(false);
    });
    // 診断抑制の文字列を表示するだけではdirectiveと扱わないが、固定表示自体は未達。
    expect(
      inspect(
        solution.replace(
          'console.log(question.choices.at(question.correctIndex));',
          'console.log("@ts-nocheck");',
        ),
      ),
    ).toBe(false);
  }, 45_000);

  it('範囲外や別の位置は形の型条件を満たすため、動作条件とのANDを必要とする', () => {
    expect(inspect(solution.replace('correctIndex: 0', 'correctIndex: 10'))).toBe(true);
    expect(inspect(solution.replace('correctIndex: 0', 'correctIndex: 1'))).toBe(true);
  }, 30_000);

  it('未知構文は未達、予約file・予算超過・標準lib障害は環境失敗として閉じる', () => {
    const unsupported = checkQuestionInterface(
      { 'main.ts': solution + '\ninterface Question {}' },
      libraries,
    );
    expect(unsupported.status).toBe('ready');
    if (unsupported.status === 'ready') expect(unsupported.facts.programShapeAccepted).toBe(false);
    expect(checkQuestionInterface({ '__tsumucode_negative.ts': '' }, libraries)).toEqual({
      status: 'system-error',
    });
    expect(checkQuestionInterface({ 'main.ts': solution + ' '.repeat(8_192) }, libraries)).toEqual({
      status: 'system-error',
    });
    expect(checkQuestionInterface({ 'main.ts': solution }, {})).toEqual({ status: 'system-error' });
  });

  it('Workerの余分なpayload・成立しないprobe・異なるprofileのfactを拒否する', () => {
    const result = checkQuestionInterface({ 'main.ts': solution }, libraries);
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(isQuestionInterfaceResult(result)).toBe(true);
    expect(isQuestionInterfaceResult({ ...result, files: {} })).toBe(false);
    expect(
      isQuestionInterfaceResult({
        ...result,
        facts: { ...result.facts, interfaceAnnotationAccepted: false },
      }),
    ).toBe(false);
    expect(
      isQuestionInterfaceResult({
        ...result,
        facts: { ...result.facts, negativeProbesRejected: false },
      }),
    ).toBe(false);
    expect(isQuestionInterfaceResult({ status: 'system-error', facts: result.facts })).toBe(false);
    expect(
      isQuestionInterfaceResult({ status: 'ready', facts: { explicitNumberAnnotation: true } }),
    ).toBe(false);
  }, 15_000);
});
