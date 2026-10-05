// @vitest-environment node
/** 新規2Lessonの掲載例を前提の型と組み合わせ、診断と生成結果を確認する。 */
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { expect, it } from 'vitest';
import { loadAuthoringCourse } from '../../scripts/content/compileCourse';
import { compileTypeScript } from '../../src/adapters/runtime/typescript/compileTypeScript';

const require = createRequire(import.meta.url);
const directory = path.dirname(require.resolve('typescript'));
const libraries = Object.fromEntries(
  readdirSync(directory)
    .filter((name) => /^lib\..*\.d\.ts$/u.test(name))
    .map((name) => [name, readFileSync(path.join(directory, name), 'utf8')]),
);

it.each(['typescript-ch03-l01', 'typescript-ch03-l02'])(
  '%sの掲載例が説明した型診断と結果へ対応する',
  async (id) => {
    const course = await loadAuthoringCourse('content/typescript');
    const lesson = course.runtime.phases
      .flatMap((p) => p.chapters.flatMap((c) => c.lessons))
      .find((l) => l.id === id)!;
    const code = lesson.slides.map((s) =>
      s.blocks
        .filter((b) => b.type === 'code')
        .map((b) => b.code)
        .join('\n'),
    );
    const shape = code[0]!.split('const ')[0]!;
    for (const [index, source] of [
      code[0]!,
      shape + code[1]!,
      shape + code[2]! + code[3]!,
    ].entries()) {
      const result = compileTypeScript({ 'main.ts': source }, libraries);
      expect(result.status).toBe(index === 1 ? 'type-error' : 'ready');
      if (index === 1 && result.status !== 'ready')
        expect(result.diagnostics.map((d) => d.code)).toEqual([id.endsWith('01') ? 2339 : 18048]);
      if (index === 2 && result.status === 'ready') {
        expect(result.files['main.js']).toContain('function');
        expect(result.files['main.js']).not.toContain('interface');
        expect(result.files['main.js']).not.toContain('type Result');
      }
    }
    expect(lesson.slides[1]!.codeReferenceSlideId).toBe(lesson.slides[0]!.id);
    expect(lesson.slides[3]!.codeReferenceSlideId).toBe(lesson.slides[2]!.id);
  },
  30_000,
);
