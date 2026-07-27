import { readFile } from 'node:fs/promises';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  loadChapterPackage,
  type LoadedChapterPackage,
} from '../../scripts/content/loadChapterPackage';
import { expectChapterConceptCoverage } from './concept-coverage';
import { expectLessonMastery } from './helpers/expectLessonMastery';

let loaded: LoadedChapterPackage;

/** ch12のExercise authoring directoryを返す。 */
function exerciseDirectory(lessonNumber: string): string {
  return `content/html-css/chapters/html-css-ch12/lessons/html-css-ch12-l${lessonNumber}/exercises/html-css-ch12-l${lessonNumber}-e01`;
}

beforeAll(async () => {
  loaded = await loadChapterPackage('content/html-css/chapters/html-css-ch12/chapter.yaml');
});

describe('html-css-ch12', () => {
  it('5工程が1つのProfile workspaceを共有する', async () => {
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

  it('設計からPolishまでをGuideのcompose CheckpointからProject実装へ接続する', async () => {
    expectLessonMastery(loaded, 'html-css-ch12-l01', {
      beforeExercise: { audience: 'compose', outline: 'compose' },
      exerciseLevel: 'compose',
      requiredConceptIds: ['audience', 'outline'],
    });
    expectLessonMastery(loaded, 'html-css-ch12-l02', {
      beforeExercise: { navigation: 'compose', hero: 'compose' },
      exerciseLevel: 'compose',
      requiredConceptIds: ['navigation', 'hero'],
    });
    expectLessonMastery(loaded, 'html-css-ch12-l03', {
      beforeExercise: { skills: 'compose', works: 'compose' },
      exerciseLevel: 'compose',
      requiredConceptIds: ['skills', 'works'],
    });
    expectLessonMastery(loaded, 'html-css-ch12-l04', {
      beforeExercise: { contact: 'compose', responsive: 'compose' },
      exerciseLevel: 'compose',
      requiredConceptIds: ['contact', 'responsive'],
    });
    expectLessonMastery(loaded, 'html-css-ch12-l05', {
      beforeExercise: { polish: 'compose' },
      exerciseLevel: 'compose',
      requiredConceptIds: ['polish'],
    });
    await expectChapterConceptCoverage('html-css-ch12', [
      'html-css-ch12-l01',
      'html-css-ch12-l02',
      'html-css-ch12-l03',
      'html-css-ch12-l04',
      'html-css-ch12-l05',
    ]);
  }, 60_000);

  it('各工程のSolutionを次工程のStarterへそのまま引き継ぐ', async () => {
    const ordered = ['01', '02', '03', '04', '05'].map((suffix) =>
      loaded.exercises.find(({ id }) => id === `html-css-ch12-l${suffix}-e01`),
    );

    for (let index = 0; index < ordered.length - 1; index += 1) {
      const current = ordered[index];
      const next = ordered[index + 1];
      expect(current, `工程${String(index + 1)}が見つかる`).toBeDefined();
      expect(next, `工程${String(index + 2)}が見つかる`).toBeDefined();
      for (const solution of current!.solutionFiles) {
        const currentNumber = String(index + 1).padStart(2, '0');
        const nextNumber = String(index + 2).padStart(2, '0');
        const [solutionContent, starterContent] = await Promise.all([
          readFile(`${exerciseDirectory(currentNumber)}/solution/${solution.path}`, 'utf8'),
          readFile(`${exerciseDirectory(nextNumber)}/starter/${solution.path}`, 'utf8'),
        ]);
        expect(starterContent, `${current!.id} ${solution.path} → ${next!.id}`).toBe(
          solutionContent,
        );
      }
    }
  });

  it('Solutionで変えるFileは必ず学習者向けStepに明示する', async () => {
    for (const [index, exercise] of loaded.exercises.entries()) {
      const lessonNumber = String(index + 1).padStart(2, '0');
      const steppedFiles = new Set((exercise.steps ?? []).map(({ file }) => file));
      for (const solution of exercise.solutionFiles) {
        const [starterContent, solutionContent] = await Promise.all([
          readFile(`${exerciseDirectory(lessonNumber)}/starter/${solution.path}`, 'utf8'),
          readFile(`${exerciseDirectory(lessonNumber)}/solution/${solution.path}`, 'utf8'),
        ]);
        if (starterContent === solutionContent) continue;
        expect(steppedFiles, `${exercise.id}の未指示変更: ${solution.path}`).toContain(
          solution.path,
        );
      }
    }
  });

  it('Guided Solutionへ既習化されていないCSS表現を持ち込まない', async () => {
    const unsupported =
      /scroll-behavior|clamp\(|\d+(?:\.\d+)?vw|box-shadow|rgb\([^)]*\/|\d+(?:\.\d+)?ch\b|:not\(|place-items|overflow-wrap|aspect-ratio/iu;

    for (const [index, exercise] of loaded.exercises.entries()) {
      const lessonNumber = String(index + 1).padStart(2, '0');
      for (const file of exercise.solutionFiles.filter(({ language }) => language === 'css')) {
        const content = await readFile(
          `${exerciseDirectory(lessonNumber)}/solution/${file.path}`,
          'utf8',
        );
        expect(content, `${exercise.id} ${file.path}`).not.toMatch(unsupported);
      }
    }
  });

  it('最終AuditはFocus Indicatorを実効Computed Styleで測り、無効化fixtureを落とす', () => {
    const exercise = loaded.exercises.find(({ id }) => id === 'html-css-ch12-l05-e01');
    expect(exercise).toBeDefined();
    expect(
      exercise!.validationRules.some(
        ({ assertion }) =>
          assertion.kind === 'focus-visible-style' && assertion.property === 'outline-width',
      ),
    ).toBe(true);
    expect(
      exercise!.fixtures.some(
        ({ id, expectedFeedbackRuleIds }) =>
          id.includes('focus-indicator-disabled') &&
          expectedFeedbackRuleIds.includes('html-css-ch12-l05-e01-r06'),
      ),
    ).toBe(true);
  });
});
