import { describe, expect, it } from 'vitest';
import { loadChapterPackage } from '../../scripts/content/loadChapterPackage';
import { assertChapterContract } from './helpers/assertChapterContract';

describe('html-css-ch07', () => {
  it('新概念を増やさずProfile Cardを統合する', async () => {
    await assertChapterContract({
      chapterId: 'html-css-ch07',
      lessonIds: ['html-css-ch07-l01'],
      conceptSlideIds: [],
      standardExerciseIds: ['html-css-ch07-l01-e01'],
      estimatedMinutes: 35,
    });

    const chapter = await loadChapterPackage(
      'content/html-css/chapters/html-css-ch07/chapter.yaml',
    );
    expect(chapter.slides.map((slide) => slide.frontmatter.kind)).toEqual(['reflection']);
  });
});
