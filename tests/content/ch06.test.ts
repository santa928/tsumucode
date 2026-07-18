import { describe, it } from 'vitest';
import { assertChapterContract } from './helpers/assertChapterContract';

describe('html-css-ch06', () => {
  it('文字と色の固定教材数を持つ', async () => {
    await assertChapterContract({
      chapterId: 'html-css-ch06',
      lessonIds: [
        'html-css-ch06-l01',
        'html-css-ch06-l02',
        'html-css-ch06-l03',
        'html-css-ch06-l04',
      ],
      conceptSlideIds: [
        'html-css-ch06-l01-s01',
        'html-css-ch06-l01-s02',
        'html-css-ch06-l02-s01',
        'html-css-ch06-l02-s02',
        'html-css-ch06-l03-s01',
        'html-css-ch06-l03-s02',
        'html-css-ch06-l04-s01',
        'html-css-ch06-l04-s02',
      ],
      standardExerciseIds: [
        'html-css-ch06-l01-e01',
        'html-css-ch06-l02-e01',
        'html-css-ch06-l03-e01',
        'html-css-ch06-l04-e01',
      ],
      estimatedMinutes: 45,
    });
  });
});
