import { describe, expect, it } from 'vitest';
import { fixtureCourse } from '../../../tests/fixtures/course';
import { findExercise, findLesson, findSlide, findSlideInCourse } from './selectors';

describe('教材selector', () => {
  it('Course階層からLessonを永続IDで検索する', () => {
    expect(findLesson(fixtureCourse, 'lesson-first-heading').title).toBe('見出しを置く');
  });

  it('Lesson内からSlideを永続IDで検索する', () => {
    const lesson = findLesson(fixtureCourse, 'lesson-first-heading');

    expect(findSlide(lesson, 'slide-html-role').title).toBe('HTMLは意味を伝える');
  });

  it('Course全体からSlideと所有Lessonを検索する', () => {
    const result = findSlideInCourse(fixtureCourse, 'slide-html-role');

    expect(result).toEqual({
      lesson: findLesson(fixtureCourse, 'lesson-first-heading'),
      slide: findSlide(findLesson(fixtureCourse, 'lesson-first-heading'), 'slide-html-role'),
    });
  });

  it('Lesson内からExerciseを永続IDで検索する', () => {
    const lesson = findLesson(fixtureCourse, 'lesson-first-heading');

    expect(findExercise(lesson, 'exercise-first-heading').title).toBe('h1見出しを追加する');
  });

  it('存在しないLessonを日本語Errorにする', () => {
    expect(() => findLesson(fixtureCourse, 'missing')).toThrow('Lessonが見つかりません: missing');
  });

  it('存在しないSlideを日本語Errorにする', () => {
    const lesson = findLesson(fixtureCourse, 'lesson-first-heading');

    expect(() => findSlide(lesson, 'missing')).toThrow('Slideが見つかりません: missing');
    expect(() => findSlideInCourse(fixtureCourse, 'missing')).toThrow(
      'Slideが見つかりません: missing',
    );
  });

  it('存在しないExerciseを日本語Errorにする', () => {
    const lesson = findLesson(fixtureCourse, 'lesson-first-heading');

    expect(() => findExercise(lesson, 'missing')).toThrow('Exerciseが見つかりません: missing');
  });
});
