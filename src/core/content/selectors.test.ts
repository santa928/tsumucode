import { describe, expect, it } from 'vitest';
import { fixtureCourse, fixtureCourseIndex } from '../../../tests/fixtures/course';
import {
  findExercise,
  findExerciseOwner,
  findLesson,
  findLessonOutline,
  findSlide,
  findSlideInCourse,
  findSlideOwner,
  resolveWorkspaceExerciseLocations,
  resolveWorkspaceLessonIds,
} from './selectors';

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

  it('Course IndexだけでLesson、Slide所有Lesson、Exercise所有Lessonを検索する', () => {
    const lesson = findLessonOutline(fixtureCourseIndex, 'lesson-first-heading');

    expect(lesson.title).toBe('見出しを置く');
    expect(findSlideOwner(fixtureCourseIndex, 'slide-html-role')).toEqual({
      lesson,
      slide: lesson.slides[0],
    });
    expect(findExerciseOwner(fixtureCourseIndex, 'exercise-first-heading')).toEqual({
      lesson,
      exercise: lesson.exercises[0],
    });
  });

  it('共有workspaceは現在工程までのExerciseと所有Lessonだけを教材順で返す', () => {
    const index = structuredClone(fixtureCourseIndex);
    const chapter = index.phases[0]!.chapters[0]!;
    const sourceLesson = chapter.lessons[0]!;
    const sourceExercise = sourceLesson.exercises[0]!;
    const firstLesson = {
      ...sourceLesson,
      id: 'lesson-guided-step-1',
      exercises: [{ ...sourceExercise, id: 'exercise-guided-step-1' }],
    };
    const secondLesson = {
      ...sourceLesson,
      id: 'lesson-guided-step-2',
      exercises: [{ ...sourceExercise, id: 'exercise-guided-step-2' }],
    };
    chapter.lessons = [firstLesson, secondLesson];

    expect(resolveWorkspaceExerciseLocations(index, 'exercise-guided-step-2')).toEqual([
      {
        lessonId: 'lesson-guided-step-1',
        exerciseId: 'exercise-guided-step-1',
      },
      {
        lessonId: 'lesson-guided-step-2',
        exerciseId: 'exercise-guided-step-2',
      },
    ]);
    expect(resolveWorkspaceLessonIds(index, 'exercise-guided-step-2')).toEqual([
      'lesson-guided-step-1',
      'lesson-guided-step-2',
    ]);
  });

  it('同じLesson内にある未来Exerciseをworkspace対象へ含めない', () => {
    const index = structuredClone(fixtureCourseIndex);
    const lesson = index.phases[0]!.chapters[0]!.lessons[0]!;
    const source = lesson.exercises[0]!;
    lesson.exercises = [
      { ...source, id: 'exercise-step-1' },
      { ...source, id: 'exercise-step-2' },
      { ...source, id: 'exercise-step-3' },
    ];

    expect(resolveWorkspaceExerciseLocations(index, 'exercise-step-2')).toEqual([
      { lessonId: lesson.id, exerciseId: 'exercise-step-1' },
      { lessonId: lesson.id, exerciseId: 'exercise-step-2' },
    ]);
  });

  it('Indexに存在しないIDは対象entityを示す日本語Errorにする', () => {
    expect(() => findLessonOutline(fixtureCourseIndex, 'missing')).toThrow(
      'Lessonが見つかりません: missing',
    );
    expect(() => findSlideOwner(fixtureCourseIndex, 'missing')).toThrow(
      'Slideが見つかりません: missing',
    );
    expect(() => findExerciseOwner(fixtureCourseIndex, 'missing')).toThrow(
      'Exerciseが見つかりません: missing',
    );
    expect(() => resolveWorkspaceExerciseLocations(fixtureCourseIndex, 'missing')).toThrow(
      'ExerciseがCourseにありません: missing',
    );
  });
});
