import { beforeAll, describe, expect, it } from 'vitest';
import {
  loadChapterPackage,
  type LoadedChapterPackage,
} from '../../scripts/content/loadChapterPackage';
import { expectChapterConceptCoverage } from './concept-coverage';
import { assertChapterContract } from './helpers/assertChapterContract';
import { expectLessonMastery } from './helpers/expectLessonMastery';

let loaded: LoadedChapterPackage;

beforeAll(async () => {
  loaded = await loadChapterPackage('content/html-css/chapters/html-css-ch07/chapter.yaml');
});

describe('html-css-ch07', () => {
  it('新構文を増やさずProfile Cardを統合する', async () => {
    await assertChapterContract({
      chapterId: 'html-css-ch07',
      lessonIds: ['html-css-ch07-l01'],
      conceptSlideIds: [],
      standardExerciseIds: ['html-css-ch07-l01-e01'],
      estimatedMinutes: 35,
    });

    expect(loaded.slides.map((slide) => slide.frontmatter.kind)).toEqual(['reflection']);
  });

  it('既習ConceptをProfile Card統合のread→composeへ接続する', async () => {
    expectLessonMastery(loaded, 'html-css-ch07-l01', {
      beforeExercise: { 'profile-card-integration': 'read' },
      exerciseLevel: 'compose',
      requiredConceptIds: ['profile-card-integration'],
    });
    await expectChapterConceptCoverage('html-css-ch07', ['html-css-ch07-l01']);
  }, 60_000);
});
