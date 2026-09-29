// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkScoreNumberAnnotation } from '../../../src/adapters/runtime/typescript/checkScoreNumberAnnotation';
import { checkTypeScript } from '../../../src/adapters/runtime/typescript/compileTypeScript';

const require = createRequire(import.meta.url);
const directory = path.dirname(require.resolve('typescript'));
const libraries = Object.fromEntries(
  readdirSync(directory)
    .filter((name) => /^lib\..*\.d\.ts$/u.test(name))
    .map((name) => [name, readFileSync(path.join(directory, name), 'utf8')]),
);
const fixtures = JSON.parse(
  readFileSync('tests/fixtures/typescript-annotation-pilot.json', 'utf8'),
) as { id: string; source: string }[];

// 元コードと正負probeの3 Programを検査する結合テスト用。共有CIでは5秒を超える。
// 製品Workerの期限や性能受入条件は変更せず、正しさのassertionを最後まで実行する。
const compilerIntegrationTimeoutMs = 10_000;

describe('型注釈Lesson専用の信頼側検査', () => {
  it.each(fixtures)(
    '$idの型条件を実Compilerで区別し、元コードと診断を漏らさない',
    ({ id, source }) => {
      const files = { 'main.ts': source };
      const result = checkScoreNumberAnnotation(files, libraries);
      expect(files).toEqual({ 'main.ts': source });
      expect(result.status).toBe('ready');
      if (result.status !== 'ready') throw new Error('検査不能');
      expect(Object.values(result.facts).every(Boolean)).toBe(
        ['solution', 'alternative', 'wrong-value'].includes(id),
      );
      expect(result).not.toHaveProperty('diagnostics');
      expect(result).not.toHaveProperty('files');
    },
    compilerIntegrationTimeoutMs,
  );

  it.each([
    'const score: number = 2; console.log(score);',
    'let score: number = -(1 + 1); score *= -1; score++; --score; console.log(score);',
  ])(
    '別解を独立して実Compilerで検証する: %s',
    (source) => {
      const result = checkScoreNumberAnnotation({ 'main.ts': source }, libraries);
      expect(result.status === 'ready' && Object.values(result.facts).every(Boolean)).toBe(true);
    },
    compilerIntegrationTimeoutMs,
  );

  it('型検査専用経路はJSを返さない', () => {
    expect(checkTypeScript({ 'main.ts': 'let score: number = 2;' }, libraries)).toEqual({
      status: 'valid',
    });
  });

  it.each([
    'let score: number = 0; { let score: number = 2; console.log(score); }',
    'let score: number = 2; if (false) console.log(score);',
    'let score: number = 2; console.log = () => {}; console.log(score);',
    'export let score: number = 2; console.log(score);',
    'let score: number = 2; console.log(score); console.log(2);',
    'let score: number = 2; score = (console.log(2), 2); console.log(score);',
    'let score: number = 2; console?.log(score);',
  ])('grammar外を環境失敗でなく未達factにする: %s', (source) => {
    const result = checkScoreNumberAnnotation({ 'main.ts': source }, libraries);
    expect(result.status).toBe('ready');
    if (result.status === 'ready') expect(result.facts.programShapeAccepted).toBe(false);
  });

  it('実コメントの抑制とreferenceだけを検出し、文字列の見かけを抑制にしない', () => {
    for (const comment of [
      '// @ts-expect-error',
      '/* @ts-nocheck */',
      '/// <reference lib="dom" />',
    ]) {
      const result = checkScoreNumberAnnotation(
        { 'main.ts': `${comment}\nlet score: number = 2; console.log(score);` },
        libraries,
      );
      expect(result.status === 'ready' && result.facts.forbiddenEscapeAbsent).toBe(false);
    }
    const result = checkScoreNumberAnnotation(
      { 'main.ts': 'let score: number = 2; console.log("@ts-ignore");' },
      libraries,
    );
    expect(result.status === 'ready' && result.facts.forbiddenEscapeAbsent).toBe(true);
  });

  it('size/depth/node上限・予約衝突・標準lib障害は採点不能にする', () => {
    const valid = 'let score: number = 2; console.log(score);';
    for (const source of [
      ' '.repeat(8_193),
      `let score: number = ${'('.repeat(70)}2${')'.repeat(70)}; console.log(score);`,
      `let score: number = 2; ${'score++;'.repeat(700)} console.log(score);`,
    ]) {
      expect(checkScoreNumberAnnotation({ 'main.ts': source }, libraries)).toEqual({
        status: 'system-error',
      });
    }
    expect(
      checkScoreNumberAnnotation(
        { 'main.ts': valid, '__tsumucode_probe_positive.ts': '' },
        libraries,
      ),
    ).toEqual({ status: 'system-error' });
    expect(checkScoreNumberAnnotation({ 'main.ts': valid }, {})).toEqual({
      status: 'system-error',
    });
  });
});
