import { describe, it } from 'vitest';
import { assertChapterContract } from './helpers/assertChapterContract';

describe('html-css-ch08', () => {
  it('Flexbox教材の固定配分を持つ', async () => {
    await assertChapterContract({
      chapterId: 'html-css-ch08',
      lessonIds: [
        'html-css-ch08-l01',
        'html-css-ch08-l02',
        'html-css-ch08-l03',
        'html-css-ch08-l04',
        'html-css-ch08-l05',
      ],
      conceptSlideIds: [
        'html-css-ch08-l01-s01',
        'html-css-ch08-l01-s02',
        'html-css-ch08-l02-s01',
        'html-css-ch08-l02-s02',
        'html-css-ch08-l03-s01',
        'html-css-ch08-l03-s02',
        'html-css-ch08-l04-s01',
        'html-css-ch08-l04-s02',
        'html-css-ch08-l05-s01',
        'html-css-ch08-l05-s02',
      ],
      standardExerciseIds: [
        'html-css-ch08-l01-e01',
        'html-css-ch08-l02-e01',
        'html-css-ch08-l03-e01',
        'html-css-ch08-l04-e01',
        'html-css-ch08-l05-e01',
      ],
      estimatedMinutes: 55,
    });
  });
});
