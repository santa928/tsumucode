import { describe, expect, it } from 'vitest';
import { loadChapterPackage } from '../../scripts/content/loadChapterPackage';

describe('html-css-ch13', () => {
  it('1件の独立Capstoneだけを持つ', async () => {
    const loaded = await loadChapterPackage('content/html-css/chapters/html-css-ch13/chapter.yaml');
    expect(loaded.chapter.estimatedMinutes).toBe(120);
    expect(loaded.lessons.map((lesson) => lesson.id)).toEqual(['html-css-ch13-l01']);
    expect(loaded.lessons[0]?.kind).toBe('capstone');
    expect(loaded.slides.filter((slide) => slide.frontmatter.kind === 'concept')).toHaveLength(0);
    expect(loaded.exercises.map((exercise) => exercise.id)).toEqual(['html-css-ch13-l01-e01']);
    expect(
      loaded.exercises[0]?.kind === 'capstone' &&
        loaded.exercises[0].projectId === 'html-css-capstone-landing',
    ).toBe(true);
    expect(loaded.exercises[0]?.countsTowardStandardExerciseTotal).toBe(false);
  });
});
