// @vitest-environment node
/** 登録した原稿の掲載例を固定Compilerで検査し、前提コードの参照と診断を対応付ける。 */
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadAuthoringCourse } from '../../scripts/content/compileCourse';
import { compileTypeScript } from '../../src/adapters/runtime/typescript/compileTypeScript';

const require = createRequire(import.meta.url);
const directory = path.dirname(require.resolve('typescript'));
const libraries = Object.fromEntries(
  readdirSync(directory)
    .filter((name) => /^lib\..*\.d\.ts$/u.test(name))
    .map((name) => [name, readFileSync(path.join(directory, name), 'utf8')]),
);

describe('Questionの登録済み掲載例', () => {
  it('形・欠落・誤型・範囲外・型エイリアスを掲載どおりに検査する', async () => {
    const course = await loadAuthoringCourse(path.resolve('content/typescript'));
    const lesson = course.runtime.phases[0]!.chapters[1]!.lessons[0]!;
    const examples = lesson.slides.map(({ blocks }) =>
      blocks.filter((block) => block.type === 'code'),
    );
    expect(examples.map((codes) => codes.length)).toEqual([1, 1, 1, 2]);
    const prefix = examples[0]![0]!.code.split('const question')[0]!;
    const sources = [
      examples[0]![0]!.code,
      examples[1]![0]!.code,
      examples[2]![0]!.code,
      prefix + examples[3]![0]!.code,
      examples[3]![1]!.code,
    ];
    sources.forEach((source, index) => {
      const result = compileTypeScript({ 'main.ts': source }, libraries);
      const expectedError = index === 1 ? 2741 : index === 2 ? 2322 : undefined;
      expect(result.status).toBe(expectedError ? 'type-error' : 'ready');
      if (expectedError && result.status !== 'ready') {
        expect(result.diagnostics).toEqual([
          expect.objectContaining({ file: 'main.ts', code: expectedError }),
        ]);
        expect(result).not.toHaveProperty('files');
      }
      if (index === 4 && result.status === 'ready')
        // 固定Compilerのstrict directiveだけが残り、型名や値の作成は出力されない。
        expect(result.files['main.js']?.trim()).toBe('"use strict";');
    });
    expect(lesson.slides[3]!.codeReferenceSlideId).toBe(lesson.slides[0]!.id);
  }, 30_000);
});
