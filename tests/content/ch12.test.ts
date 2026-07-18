import { describe, expect, it } from 'vitest';
import { loadChapterPackage } from '../../scripts/content/loadChapterPackage';

describe('html-css-ch12', () => {
  it('5工程が1つのProfile workspaceを共有する', async () => {
    const loaded = await loadChapterPackage('content/html-css/chapters/html-css-ch12/chapter.yaml');
    expect(loaded.chapter.estimatedMinutes).toBe(80);
    expect(loaded.lessons.map((lesson) => lesson.id)).toEqual([
      'html-css-ch12-l01',
      'html-css-ch12-l02',
      'html-css-ch12-l03',
      'html-css-ch12-l04',
      'html-css-ch12-l05',
    ]);
    expect(loaded.lessons.every((lesson) => lesson.kind === 'guided-project')).toBe(true);
    expect(loaded.slides.filter((slide) => slide.frontmatter.kind === 'concept')).toHaveLength(0);
    expect(loaded.exercises).toHaveLength(5);
    expect(
      loaded.exercises.every(
        (exercise) =>
          exercise.kind === 'guided-project' && exercise.projectId === 'html-css-profile-project',
      ),
    ).toBe(true);
    expect(
      loaded.exercises.every((exercise) => exercise.workspaceId === 'html-css-profile-project'),
    ).toBe(true);
    expect(loaded.exercises.every((exercise) => !exercise.countsTowardStandardExerciseTotal)).toBe(
      true,
    );
  });
});
