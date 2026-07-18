import { describe, it } from 'vitest';
import { assertChapterContract } from './helpers/assertChapterContract';

describe('html-css-ch00', () => {
  it('2 lessons、5 concept slides、2 exercisesを固定順で持つ', async () => {
    await assertChapterContract({
      chapterId: 'html-css-ch00',
      lessonIds: ['html-css-ch00-l01', 'html-css-ch00-l02'],
      conceptSlideIds: [
        'html-css-ch00-l01-s01',
        'html-css-ch00-l01-s02',
        'html-css-ch00-l01-s03',
        'html-css-ch00-l02-s01',
        'html-css-ch00-l02-s02',
      ],
      standardExerciseIds: ['html-css-ch00-l01-e01', 'html-css-ch00-l02-e01'],
      estimatedMinutes: 20,
    });
  });
});
