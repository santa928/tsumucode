import { readFile } from 'node:fs/promises';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  loadAuthoringCourse,
  type AuthoringCoursePackage,
} from '../../scripts/content/compileCourse';
import { CourseManifestSchema } from '../../src/core/content/schema';
import type { CourseManifest } from '../../src/core/content/types';

let course: CourseManifest;
let authoring: AuthoringCoursePackage;

beforeAll(async () => {
  course = CourseManifestSchema.parse(
    JSON.parse(await readFile('public/generated/content/courses/html-css.json', 'utf8')) as unknown,
  );
  authoring = await loadAuthoringCourse('content/html-css');
}, 60_000);

describe('独自教材本文の完成度', () => {
  it('95 Concept Slideが中心概念1つ、十分な説明、具体例、次操作を持つ', () => {
    const conceptKinds = new Set(['concept', 'comparison', 'diagram', 'code']);
    const slides = course.phases
      .flatMap(({ chapters }) => chapters)
      .flatMap(({ lessons }) => lessons)
      .flatMap(({ slides: lessonSlides }) => lessonSlides)
      .filter(({ kind }) => conceptKinds.has(kind));
    expect(slides).toHaveLength(95);
    for (const slide of slides) {
      expect(slide.concept, slide.id).toBeTruthy();
      expect(slide.blocks.length, slide.id).toBeGreaterThanOrEqual(3);
      const prose = slide.blocks
        .flatMap((block) =>
          block.type === 'paragraph' || block.type === 'callout'
            ? [block.text]
            : block.type === 'list'
              ? block.items
              : block.type === 'practice'
                ? [block.prompt, block.expectedAction]
                : [],
        )
        .join('');
      expect(prose.length, slide.id).toBeGreaterThanOrEqual(100);
      expect(prose, slide.id).not.toMatch(/TODO|TBD|Lorem|仮文|ここに|Progate/iu);
      expect(prose, slide.id).toMatch(/次|試|確認|見て|書いて/u);
      const practices = slide.blocks.filter((block) => block.type === 'practice');
      expect(practices, slide.id).toHaveLength(1);
      expect(practices[0]?.estimatedMinutes, slide.id).toBeLessThanOrEqual(5);
    }
  });

  it('全Exerciseが3段階Hintを持ち、Standardは独立したStarter、Solution、別解を持つ', () => {
    const allExercises = authoring.exercises;
    expect(allExercises).toHaveLength(51);
    for (const exercise of allExercises) {
      expect(
        exercise.hints.map(({ level }) => level),
        exercise.id,
      ).toEqual([1, 2, 3]);
      expect(exercise.instructions.length, exercise.id).toBeGreaterThanOrEqual(1);
      expect(exercise.relatedSlideIds.length, exercise.id).toBeGreaterThanOrEqual(1);
      expect(
        exercise.validationRules.every(
          ({ hintId, relatedSlideId }) => Boolean(hintId) && Boolean(relatedSlideId),
        ),
        exercise.id,
      ).toBe(true);
    }
    const exercises = allExercises.filter(
      ({ countsTowardStandardExerciseTotal }) => countsTowardStandardExerciseTotal,
    );
    expect(exercises).toHaveLength(45);
    for (const exercise of exercises) {
      const starter = JSON.stringify(exercise.files.map(({ path, content }) => [path, content]));
      const solution = JSON.stringify(
        exercise.solutionFiles.map(({ path, content }) => [path, content]),
      );
      expect(starter, exercise.id).not.toBe(solution);
      const alternative = exercise.fixtures.find(({ expectedStatus }) => expectedStatus === 'pass');
      expect(alternative, exercise.id).toBeDefined();
      expect(JSON.stringify(alternative?.files), exercise.id).not.toBe(solution);
    }
  });

  it('Project LessonがBrief、Guide、Checklistを持つ', () => {
    const projects = course.phases
      .flatMap(({ chapters }) => chapters)
      .flatMap(({ lessons }) => lessons)
      .filter((lesson) => lesson.kind !== 'standard');
    expect(projects).toHaveLength(6);
    for (const lesson of projects) {
      expect(lesson.project.brief.length, lesson.id).toBeGreaterThanOrEqual(2);
      expect(lesson.project.guide.length, lesson.id).toBeGreaterThanOrEqual(2);
      expect(lesson.project.checklist.length, lesson.id).toBeGreaterThanOrEqual(1);
    }
  });
});
