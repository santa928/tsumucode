import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadChapterPackage } from '../../scripts/content/loadChapterPackage';

describe('loadChapterPackage', () => {
  it('fixture Chapterをschemaと全Source参照込みで読める', async () => {
    const chapter = await loadChapterPackage(
      path.resolve('tests/fixtures/course-release/chapter/chapter.yaml'),
    );

    expect(chapter.chapter.id).toBe('fixture-chapter');
    expect(chapter.lessons).toHaveLength(1);
    expect(chapter.slides.filter((slide) => slide.frontmatter.kind === 'concept')).toHaveLength(5);
    expect(
      chapter.exercises.filter((exercise) => exercise.countsTowardStandardExerciseTotal),
    ).toHaveLength(1);
  });

  it('Exerciseが参照するSource Fileの欠落を拒否する', async () => {
    await expect(
      loadChapterPackage(path.resolve('tests/fixtures/course-release/broken-chapter/chapter.yaml')),
    ).rejects.toThrow('starter/missing.html');
  });
});
