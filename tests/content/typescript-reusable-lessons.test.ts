// @vitest-environment node
/** 新3教材の掲載例を必要な前提と組み合わせ、型診断と消去後の処理を確認する。 */
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

it.each(['01', '02', '03'])(
  '再利用Lesson%sの型診断と実行に残る処理を照合する',
  async (suffix) => {
    const course = await loadAuthoringCourse('content/typescript');
    const lesson = course.runtime.phases
      .flatMap((phase) => phase.chapters.flatMap((chapter) => chapter.lessons))
      .find((lesson) => lesson.id === `typescript-ch04-l${suffix}`)!;
    const code = lesson.slides.map((slide) =>
      slide.blocks
        .filter((block) => block.type === 'code')
        .map((block) => block.code)
        .join('\n'),
    );
    const first = compileTypeScript({ 'main.ts': code[0]! }, libraries);
    if (suffix === '01') expect(first.status).toBe('ready');
    else {
      expect(first.status).toBe('type-error');
      if (first.status !== 'ready')
        expect(first.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(
          suffix === '02' ? [2322, 2345] : [2339],
        );
    }
    const source = code.slice(1).join('\n');
    const result = compileTypeScript({ 'main.ts': source }, libraries);
    expect(result.status).toBe('ready');
    if (result.status === 'ready') {
      expect(result.files['main.js']).toContain('console.log');
      expect(result.files['main.js']).not.toContain('readonly');
      expect(result.files['main.js']).not.toContain('type Operation');
      expect(result.files['main.js']).not.toContain('<T>');
      expect(result.files['main.js']).toContain(
        suffix === '01'
          ? 'operation(value)'
          : suffix === '02'
            ? 'return value'
            : 'original.push(4)',
      );
    }
  },
  30_000,
);
