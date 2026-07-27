import { expect } from 'vitest';
import { masteryRank } from '../../../scripts/content/conceptMastery';
import type { LoadedChapterPackage } from '../../../scripts/content/loadChapterPackage';
import type { MasteryLevel } from '../../../src/core/content/types';

interface LessonMasteryExpectation {
  readonly beforeExercise: Readonly<Record<string, MasteryLevel>>;
  readonly exerciseLevel: MasteryLevel;
  readonly requiredConceptIds: readonly string[];
}

/** 1 Lessonの明示Metadata、実習直前Level、実習到達Level、要求Conceptを検証する。 */
export function expectLessonMastery(
  loaded: LoadedChapterPackage,
  lessonId: string,
  expectation: LessonMasteryExpectation,
): void {
  const lesson = loaded.lessons.find(({ id }) => id === lessonId);
  if (lesson === undefined) throw new Error(`Lessonが見つかりません: ${lessonId}`);
  const slides = loaded.slides.filter(({ frontmatter }) =>
    frontmatter.id.startsWith(`${lessonId}-`),
  );
  const exercises = loaded.exercises.filter(({ id }) => id.startsWith(`${lessonId}-`));
  expect(exercises, `${lessonId}: Standard Exerciseを1件にしてください`).toHaveLength(1);
  const exercise = exercises[0];
  if (exercise === undefined) throw new Error(`Exerciseが見つかりません: ${lessonId}`);

  for (const { frontmatter } of slides) {
    expect(frontmatter.layout, `${frontmatter.id}: layout`).toBeDefined();
    expect(frontmatter.teachesConceptIds, `${frontmatter.id}: teachesConceptIds`).toBeDefined();
    expect(frontmatter.masteryTarget, `${frontmatter.id}: masteryTarget`).toBeDefined();
    expect(frontmatter.screenBudget, `${frontmatter.id}: screenBudget`).toBeDefined();
  }

  for (const [conceptId, expectedLevel] of Object.entries(expectation.beforeExercise)) {
    const levels = slides.flatMap(({ frontmatter }) =>
      frontmatter.teachesConceptIds?.includes(conceptId) && frontmatter.masteryTarget !== undefined
        ? [frontmatter.masteryTarget]
        : [],
    );
    const actualLevel = levels.toSorted((left, right) => masteryRank(right) - masteryRank(left))[0];
    expect(actualLevel, `${lessonId}/${conceptId}: 実習直前Level`).toBeDefined();
    expect(
      masteryRank(actualLevel ?? 'seen'),
      `${lessonId}/${conceptId}: 実習直前Level`,
    ).toBeGreaterThanOrEqual(masteryRank(expectedLevel));
  }

  expect(exercise.requiresConcepts, `${exercise.id}: requiresConcepts`).toBeDefined();
  expect(exercise.scaffoldLevel, `${exercise.id}: scaffoldLevel`).toBe(expectation.exerciseLevel);
  expect(exercise.steps, `${exercise.id}: steps`).toBeDefined();
  expect(
    exercise.requiresConcepts?.map(({ conceptId }) => conceptId).toSorted(),
    `${exercise.id}: required Concept集合`,
  ).toEqual([...expectation.requiredConceptIds].toSorted());
  expect(
    exercise.requiresConcepts?.length ?? 0,
    `${exercise.id}: 新たに書かせるConceptは最大2件`,
  ).toBeLessThanOrEqual(2);
}
