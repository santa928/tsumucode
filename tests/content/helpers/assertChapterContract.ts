import path from 'node:path';
import { expect } from 'vitest';
import { loadChapterPackage } from '../../../scripts/content/loadChapterPackage';

export interface ChapterContractExpectation {
  readonly chapterId: string;
  readonly lessonIds: readonly string[];
  readonly conceptSlideIds: readonly string[];
  readonly standardExerciseIds: readonly string[];
  readonly estimatedMinutes: number;
}

const CONCEPT_KINDS = new Set(['concept', 'comparison', 'diagram', 'code']);

/** 章SourceのID、順序、集計、時間を1つの期待値で検証する。 */
export async function assertChapterContract(expected: ChapterContractExpectation): Promise<void> {
  const loaded = await loadChapterPackage(
    path.resolve(`content/html-css/chapters/${expected.chapterId}/chapter.yaml`),
  );
  expect(loaded.chapter.id).toBe(expected.chapterId);
  expect(loaded.chapter.estimatedMinutes).toBe(expected.estimatedMinutes);
  expect(loaded.lessons.map(({ id }) => id)).toEqual(expected.lessonIds);
  expect(
    loaded.slides
      .filter(({ frontmatter }) => CONCEPT_KINDS.has(frontmatter.kind))
      .map(({ frontmatter }) => frontmatter.id),
  ).toEqual(expected.conceptSlideIds);
  expect(
    loaded.exercises
      .filter(({ countsTowardStandardExerciseTotal }) => countsTowardStandardExerciseTotal)
      .map(({ id }) => id),
  ).toEqual(expected.standardExerciseIds);
}
