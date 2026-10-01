// @vitest-environment node
/** 導入2教材のCourse登録で、順序・初出・採点・配信境界の回帰を検出する。 */
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadAuthoringCourse } from '../../scripts/content/compileCourse';
import { splitCourseArtifacts } from '../../scripts/content/splitCourseArtifacts';

describe('TypeScript導入draft Course', () => {
  it('型推論から型注釈へ進み、用語と概念の初出を一本化する', async () => {
    const authoring = await loadAuthoringCourse(path.resolve('content/typescript'));
    const course = authoring.runtime;
    const lessons = course.phases.flatMap(({ chapters }) =>
      chapters.flatMap(({ lessons }) => lessons),
    );
    expect(course.publicationStatus).toBe('draft');
    expect(course.prerequisites).toEqual(['javascript']);
    expect(course.revision).toBe('2026-10-01.1');
    expect(course.progressMigrations).toEqual([]);
    expect(course.expectedTotals).toEqual({
      chapters: 1,
      lessons: 2,
      conceptSlides: 7,
      standardExercises: 2,
      guidedProjectLessons: 0,
      capstoneLessons: 0,
      estimatedMinutes: 30,
    });
    expect(lessons.flatMap(({ slides }) => slides)).toHaveLength(8);
    expect(lessons.map(({ id }) => id)).toEqual(['typescript-ch01-l01', 'typescript-ch01-l02']);
    expect(lessons[1]!.prerequisiteLessonIds).toEqual([lessons[0]!.id]);
    expect(lessons[0]!.nextLessonId).toBe(lessons[1]!.id);
    expect(course.glossary.find(({ id }) => id === 'type-inference')?.firstSlideId).toBe(
      'typescript-ch01-l01-s01',
    );
    expect(course.glossary.find(({ id }) => id === 'type-annotation')?.firstSlideId).toBe(
      'typescript-ch01-l02-s01',
    );
    expect(new Set(course.glossary.map(({ id }) => id)).size).toBe(course.glossary.length);
    expect(
      course.concepts.find(({ id }) => id === 'typescript-number-annotation')
        ?.prerequisiteConceptIds,
    ).toEqual(['typescript-number-inference']);
    expect(authoring.masteryDiagnostics).toEqual([]);
    expect(authoring.missingSlideMetadata).toEqual([]);
    expect(authoring.missingExerciseMetadata).toEqual([]);
  });

  it('通常配信の2Lessonに専用型条件を残し、解答・fixtureを含めない', async () => {
    const authoring = await loadAuthoringCourse(path.resolve('content/typescript'));
    const artifacts = splitCourseArtifacts(authoring.runtime);
    expect(artifacts.index.publicationStatus).toBe('draft');
    for (const [index, lesson] of artifacts.lessons.entries()) {
      const exercise = lesson.lesson.exercises[0]!;
      expect(exercise.runtime?.kind).toBe('typescript');
      expect(
        exercise.validationRules.find(({ target }) => target.kind === 'typescript-learning')
          ?.assertion,
      ).toEqual({
        kind: 'typescript-learning',
        profile: index === 0 ? 'score-number-inference-v1' : 'score-number-annotation-v1',
      });
      expect(exercise).not.toHaveProperty('solutionFiles');
      expect(exercise).not.toHaveProperty('fixtures');
    }
    expect(authoring.exercises.map(({ fixtures }) => fixtures.length)).toEqual([13, 12]);
  });
});
