import { readFile } from 'node:fs/promises';
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
  loaded = await loadChapterPackage('content/html-css/chapters/html-css-ch00/chapter.yaml');
});

describe('html-css-ch00', () => {
  it('2 lessons、6枚以上の段階Slide、2 exercisesを固定順で持つ', async () => {
    await assertChapterContract({
      chapterId: 'html-css-ch00',
      lessonIds: ['html-css-ch00-l01', 'html-css-ch00-l02'],
      conceptSlideIds: [
        'html-css-ch00-l01-s01',
        'html-css-ch00-l01-s02',
        'html-css-ch00-l01-s03',
        'html-css-ch00-l01-s04',
        'html-css-ch00-l02-s01',
        'html-css-ch00-l02-s02',
      ],
      standardExerciseIds: ['html-css-ch00-l01-e01', 'html-css-ch00-l02-e01'],
      estimatedMinutes: 20,
    });
  });

  it('役割理解からFile往復までをread→実習到達へ接続する', async () => {
    expectLessonMastery(loaded, 'html-css-ch00-l01', {
      beforeExercise: {
        'web-page-three-roles': 'read',
        'html-role': 'read',
        'css-role': 'read',
      },
      exerciseLevel: 'fill',
      requiredConceptIds: ['html-role', 'css-role'],
    });
    expectLessonMastery(loaded, 'html-css-ch00-l02', {
      beforeExercise: {
        'edit-save-preview-validate': 'read',
        'file-tab': 'read',
      },
      exerciseLevel: 'transform',
      requiredConceptIds: ['edit-save-preview-validate', 'file-tab'],
    });
    await expectChapterConceptCoverage('html-css-ch00', ['html-css-ch00-l01', 'html-css-ch00-l02']);
  }, 60_000);

  it('導入演習で未習のCustom PropertyとGridを編集させない', async () => {
    const starter = await readFile(
      'content/html-css/chapters/html-css-ch00/lessons/html-css-ch00-l02/exercises/html-css-ch00-l02-e01/starter/styles.css',
      'utf8',
    );

    expect(starter).not.toMatch(/--accent|var\(|display:\s*grid/iu);
  });
});
