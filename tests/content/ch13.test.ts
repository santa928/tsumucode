import { readFile } from 'node:fs/promises';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  loadChapterPackage,
  type LoadedChapterPackage,
} from '../../scripts/content/loadChapterPackage';
import { expectChapterConceptCoverage } from './concept-coverage';
import { expectLessonMastery } from './helpers/expectLessonMastery';

let loaded: LoadedChapterPackage;

beforeAll(async () => {
  loaded = await loadChapterPackage('content/html-css/chapters/html-css-ch13/chapter.yaml');
});

describe('html-css-ch13', () => {
  it('1件の独立Capstoneだけを持つ', async () => {
    expect(loaded.chapter.estimatedMinutes).toBe(120);
    expect(loaded.lessons.map((lesson) => lesson.id)).toEqual(['html-css-ch13-l01']);
    expect(loaded.lessons[0]?.kind).toBe('capstone');
    expect(loaded.slides.filter((slide) => slide.frontmatter.kind === 'concept')).toHaveLength(0);
    expect(loaded.exercises.map((exercise) => exercise.id)).toEqual(['html-css-ch13-l01-e01']);
    expect(
      loaded.exercises[0]?.kind === 'capstone' &&
        loaded.exercises[0].projectId === 'html-css-capstone-landing',
    ).toBe(true);
    expect(loaded.exercises[0]?.countsTowardStandardExerciseTotal).toBe(false);
  });

  it('要件Traceをcomposeしてから3段階の独立制作と監査へ接続する', async () => {
    expectLessonMastery(loaded, 'html-css-ch13-l01', {
      beforeExercise: { 'capstone-requirement-trace': 'compose' },
      exerciseLevel: 'compose',
      requiredConceptIds: ['capstone-requirement-trace'],
    });
    expect(loaded.exercises[0]?.steps?.map(({ id }) => id)).toEqual([
      'translate-semantic-requirements',
      'choose-layout-and-boundaries',
      'audit-operation-and-contrast',
    ]);
    await expectChapterConceptCoverage('html-css-ch13', ['html-css-ch13-l01']);
  }, 60_000);

  it('Brief単体で採点Hook、Poster Asset、Card境界を取得できる', async () => {
    const brief = await readFile(
      'content/html-css/chapters/html-css-ch13/lessons/html-css-ch13-l01/brief.md',
      'utf8',
    );

    for (const hook of [
      'data-capstone-page',
      'data-event-poster',
      'data-event-grid',
      'data-event-card',
      'data-capstone-action',
    ]) {
      expect(brief).toContain(`\`${hook}\``);
    }
    expect(brief).toContain('`asset:stack-day-poster`');
    expect(brief).toMatch(/Card[^\n]*360px以下/u);
  });

  it('Cardを3件以上要求し、1件だけのfixtureを不合格にする', () => {
    const exercise = loaded.exercises[0]!;
    expect(
      exercise.validationRules.some(
        ({ target, assertion }) =>
          target.kind === 'selector' &&
          target.selector === '[data-event-card]' &&
          assertion.kind === 'count' &&
          assertion.operator === 'gte' &&
          assertion.expected === 3,
      ),
    ).toBe(true);
    expect(
      exercise.fixtures.some(
        ({ id, expectedFeedbackRuleIds }) =>
          id.includes('insufficient-cards') &&
          expectedFeedbackRuleIds.includes('html-css-ch13-l01-e01-r07-card-count'),
      ),
    ).toBe(true);
  });

  it('Header、Main、Footerを個別に1件要求し、Header重複fixtureを不合格にする', () => {
    const exercise = loaded.exercises[0]!;
    for (const selector of ['header', 'main', 'footer']) {
      expect(
        exercise.validationRules.some(
          ({ target, assertion }) =>
            target.kind === 'selector' &&
            target.selector === selector &&
            assertion.kind === 'count' &&
            assertion.operator === 'equals' &&
            assertion.expected === 1,
        ),
      ).toBe(true);
    }
    expect(
      exercise.fixtures.some(
        ({ id, expectedFeedbackRuleIds }) =>
          id.includes('duplicate-landmarks') &&
          expectedFeedbackRuleIds.includes('html-css-ch13-l01-e01-r01') &&
          expectedFeedbackRuleIds.includes('html-css-ch13-l01-e01-r01-main') &&
          expectedFeedbackRuleIds.includes('html-css-ch13-l01-e01-r01-footer'),
      ),
    ).toBe(true);
  });
});
