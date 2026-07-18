import { describe, it } from 'vitest';
import { assertChapterContract } from './helpers/assertChapterContract';

describe('html-css-ch02', () => {
  it('意味のある文章構造教材の固定IDと配分を持つ', async () => {
    await assertChapterContract({
      chapterId: 'html-css-ch02',
      lessonIds: [
        'html-css-ch02-l01',
        'html-css-ch02-l02',
        'html-css-ch02-l03',
        'html-css-ch02-l04',
      ],
      conceptSlideIds: [
        'html-css-ch02-l01-s01',
        'html-css-ch02-l01-s02',
        'html-css-ch02-l02-s01',
        'html-css-ch02-l02-s02',
        'html-css-ch02-l03-s01',
        'html-css-ch02-l03-s02',
        'html-css-ch02-l03-s03',
        'html-css-ch02-l04-s01',
        'html-css-ch02-l04-s02',
      ],
      standardExerciseIds: [
        'html-css-ch02-l01-e01',
        'html-css-ch02-l02-e01',
        'html-css-ch02-l03-e01',
        'html-css-ch02-l04-e01',
      ],
      estimatedMinutes: 40,
    });
  });
});
