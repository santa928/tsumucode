import { describe, it } from 'vitest';
import { assertChapterContract } from './helpers/assertChapterContract';

describe('html-css-ch10', () => {
  it('Responsive教材の固定配分を持つ', async () => {
    await assertChapterContract({
      chapterId: 'html-css-ch10',
      lessonIds: [
        'html-css-ch10-l01',
        'html-css-ch10-l02',
        'html-css-ch10-l03',
        'html-css-ch10-l04',
        'html-css-ch10-l05',
      ],
      conceptSlideIds: [
        'html-css-ch10-l01-s01',
        'html-css-ch10-l01-s02',
        'html-css-ch10-l02-s01',
        'html-css-ch10-l02-s02',
        'html-css-ch10-l03-s01',
        'html-css-ch10-l03-s02',
        'html-css-ch10-l04-s01',
        'html-css-ch10-l04-s02',
        'html-css-ch10-l05-s01',
        'html-css-ch10-l05-s02',
      ],
      standardExerciseIds: [
        'html-css-ch10-l01-e01',
        'html-css-ch10-l02-e01',
        'html-css-ch10-l03-e01',
        'html-css-ch10-l04-e01',
        'html-css-ch10-l05-e01',
      ],
      estimatedMinutes: 60,
    });
  });
});
