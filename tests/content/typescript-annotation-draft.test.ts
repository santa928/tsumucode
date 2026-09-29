// @vitest-environment node
/** 未登録の型注釈教材を通常Compilerで読み、表示例と参照を検証する。公開可否は判定しない。 */
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadAuthoringLessonDraft } from '../../scripts/content/compileCourse';
import { readYamlFile } from '../../scripts/content/io';
import {
  ConceptCatalogSourceSchema,
  GlossarySourceSchema,
} from '../../scripts/content/sourceSchema';
import { compileTypeScript } from '../../src/adapters/runtime/typescript/compileTypeScript';

const root = path.resolve('docs/quality/typescript-ch01-l02-draft');
const bundle = await loadAuthoringLessonDraft(root, 'typescript');
const require = createRequire(import.meta.url);
const libraryDirectory = path.dirname(require.resolve('typescript'));
const libraries = Object.fromEntries(
  readdirSync(libraryDirectory)
    .filter((name) => /^lib\..*\.d\.ts$/u.test(name))
    .map((name) => [name, readFileSync(path.join(libraryDirectory, name), 'utf8')]),
);

describe('未登録TypeScript型注釈Lesson', () => {
  it('4枚・15分・実在する参照を持ち、未実装の前提を消さない', async () => {
    const lesson = bundle.runtime;
    expect(lesson.slides).toHaveLength(4);
    expect(lesson.estimatedMinutes).toBe(15);
    expect(lesson.prerequisiteLessonIds).toEqual(['typescript-ch01-l01']);
    const glossary = await readYamlFile(root, 'glossary.yaml', GlossarySourceSchema);
    const concepts = await readYamlFile(root, 'concepts.yaml', ConceptCatalogSourceSchema);
    for (const ref of lesson.glossaryRefs)
      expect(glossary.entries.some(({ id }) => id === ref)).toBe(true);
    const slideIds = lesson.slides.map(({ id }) => id);
    for (const entry of glossary.entries) expect(slideIds).toContain(entry.firstSlideId);
    for (const slide of lesson.slides) {
      for (const ref of slide.teachesConceptIds)
        expect(concepts.concepts.some(({ id }) => id === ref)).toBe(true);
    }
    const exercise = bundle.authoringExercises[0]!;
    expect(exercise.runtime?.kind).toBe('typescript');
    expect(exercise.fixtures).toHaveLength(12);
    expect(lesson.exercises[0]).not.toHaveProperty('solutionFiles');
    expect(lesson.exercises[0]).not.toHaveProperty('fixtures');
    for (const id of exercise.relatedSlideIds) expect(slideIds).toContain(id);
  });

  for (const slide of bundle.runtime.slides) {
    it(slide.id + 'の掲載例は説明どおりの型検査結果になる', () => {
      for (const block of slide.blocks) {
        if (block.type !== 'code') continue;
        const result = compileTypeScript({ 'main.ts': block.code }, libraries);
        expect(result.status).toBe(slide.id.endsWith('s02') ? 'type-error' : 'ready');
        if (slide.id.endsWith('s02') && result.status !== 'ready') {
          expect(result.diagnostics).toEqual(
            expect.arrayContaining([expect.objectContaining({ code: 2322, line: 1 })]),
          );
          expect(result).not.toHaveProperty('files');
        }
      }
    });
  }
});
