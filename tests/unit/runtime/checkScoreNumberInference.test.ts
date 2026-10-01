// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkScoreNumberInference } from '../../../src/adapters/runtime/typescript/checkScoreNumberInference';

const require = createRequire(import.meta.url);
const directory = path.dirname(require.resolve('typescript'));
const libraries = Object.fromEntries(
  readdirSync(directory)
    .filter((name) => /^lib\..*\.d\.ts$/u.test(name))
    .map((name) => [name, readFileSync(path.join(directory, name), 'utf8')]),
);

describe('型推論Lesson専用の信頼側検査', () => {
  it.each([
    'let score = 0; score = 2; console.log(score);',
    'let score = 1; score += 1; console.log(score);',
    'let score = 3; console.log(score);',
  ])(
    '注釈なしのnumber推論だけを型条件として認める: %s',
    (source) => {
      const files = { 'main.ts': source };
      const result = checkScoreNumberInference(files, libraries);
      expect(result.status).toBe('ready');
      expect(result.status === 'ready' && Object.values(result.facts).every(Boolean)).toBe(true);
      expect(files).toEqual({ 'main.ts': source });
      expect(result).not.toHaveProperty('diagnostics');
      expect(result).not.toHaveProperty('files');
    },
    10_000,
  );

  it.each([
    'let score: number = 2; console.log(score);',
    'let score: any = 2; console.log(score);',
    'let score = 2 as number; console.log(score);',
    '// @ts-ignore\nlet score = 2; console.log(score);',
    'let score = 2; console.log(2);',
    'const score = 2; console.log(score);',
    'let score = 2; { let score = 2; console.log(score); }',
  ])('今回の推論と再代入の練習範囲外を未達にする: %s', (source) => {
    const result = checkScoreNumberInference({ 'main.ts': source }, libraries);
    expect(result.status).toBe('ready');
    expect(result.status === 'ready' && Object.values(result.facts).every(Boolean)).toBe(false);
  });

  it('上限・予約衝突・標準lib障害は未達と区別する', () => {
    for (const files of [
      { 'main.ts': ' '.repeat(8_193) },
      { 'main.ts': 'let score = 2;', '__tsumucode_probe_positive.ts': '' },
    ])
      expect(checkScoreNumberInference(files, libraries)).toEqual({ status: 'system-error' });
    expect(
      checkScoreNumberInference({ 'main.ts': 'let score = 2; console.log(score);' }, {}),
    ).toEqual({ status: 'system-error' });
  });
});
