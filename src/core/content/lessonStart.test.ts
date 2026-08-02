import { describe, expect, it } from 'vitest';
import { fixtureCourse, fixtureCourseIndex } from '../../../tests/fixtures/course';
import { lessonStartTarget, lessonStartTargetPath } from './lessonStart';

describe('lessonStartTarget', () => {
  it('standard Lessonは先頭Slideを開始targetとして選ぶ', () => {
    const lesson = fixtureCourse.phases[0]!.chapters[0]!.lessons[0]!;

    expect(lessonStartTarget(lesson)).toEqual({
      kind: 'slide',
      targetId: 'slide-html-role',
    });
  });

  it('Lesson本文を持たないCourse Index outlineでも同じ開始targetを選ぶ', () => {
    const lesson = fixtureCourseIndex.phases[0]!.chapters[0]!.lessons[0]!;

    expect(lessonStartTarget(lesson)).toEqual({
      kind: 'slide',
      targetId: 'slide-html-role',
    });
  });

  it('型付きtargetを既存のSlide／Exercise Routeへ変換する', () => {
    expect(
      lessonStartTargetPath('html-css', 'lesson-first-heading', {
        kind: 'slide',
        targetId: 'slide-html-role',
      }),
    ).toBe('/courses/html-css/lessons/lesson-first-heading/slides/slide-html-role');
    expect(
      lessonStartTargetPath('html-css', 'lesson-first-heading', {
        kind: 'exercise',
        targetId: 'exercise-first-heading',
      }),
    ).toBe('/courses/html-css/lessons/lesson-first-heading/exercises/exercise-first-heading');
  });
});
