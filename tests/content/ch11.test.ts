import { describe, it } from 'vitest';
import { assertChapterContract } from './helpers/assertChapterContract';

describe('html-css-ch11', () => {
  it('a11y教材の固定配分を持つ', async () => {
    await assertChapterContract({
      chapterId: 'html-css-ch11',
      lessonIds: [
        'html-css-ch11-l01',
        'html-css-ch11-l02',
        'html-css-ch11-l03',
        'html-css-ch11-l04',
      ],
      conceptSlideIds: [
        'html-css-ch11-l01-s01',
        'html-css-ch11-l01-s02',
        'html-css-ch11-l02-s01',
        'html-css-ch11-l02-s02',
        'html-css-ch11-l03-s01',
        'html-css-ch11-l03-s02',
        'html-css-ch11-l04-s01',
        'html-css-ch11-l04-s02',
      ],
      standardExerciseIds: [
        'html-css-ch11-l01-e01',
        'html-css-ch11-l02-e01',
        'html-css-ch11-l03-e01',
        'html-css-ch11-l04-e01',
      ],
      estimatedMinutes: 40,
    });
  });
});
