import { describe, expect, it } from 'vitest';
import { fixtureCourse } from '../../../tests/fixtures/course';
import type { CourseManifest, Lesson, Slide } from '../../core/content/types';
import {
  buildCourseSlideSequence,
  buildLibrarySlidePath,
  resolveCourseSlideContext,
} from './courseSlideSequence';

/** Fixture Slideを識別可能な別Slideとして複製する。 */
function createSlide(source: Slide, id: string): Slide {
  return {
    ...structuredClone(source),
    id,
    title: `Slide ${id}`,
  };
}

/** Fixture Lessonを任意のSlide列を持つstandard Lessonとして複製する。 */
function createLesson(source: Lesson, id: string, slideIds: readonly string[]): Lesson {
  if (source.kind !== 'standard') throw new Error('Fixture Lessonがstandardではありません');
  const slides = slideIds.map((slideId) => createSlide(source.slides[0]!, slideId));
  return {
    ...structuredClone(source),
    id,
    title: `Lesson ${id}`,
    slides,
    completion: {
      ...source.completion,
      finalSlideId: slides.at(-1)?.id ?? source.completion.finalSlideId,
    },
  };
}

/** Phase／Chapter／Lesson境界を含む著者順検証用Courseを作る。 */
function createSequencedCourse(): CourseManifest {
  const course = structuredClone(fixtureCourse);
  const sourcePhase = course.phases[0]!;
  const sourceChapter = sourcePhase.chapters[0]!;
  const sourceLesson = sourceChapter.lessons[0]!;
  const lessonA = createLesson(sourceLesson, 'lesson-a', ['slide-a1', 'slide-a2']);
  const lessonB = createLesson(sourceLesson, 'lesson-b', ['slide-b1']);
  const lessonC = createLesson(sourceLesson, 'lesson-c', ['slide-c1']);

  course.phases = [
    {
      ...structuredClone(sourcePhase),
      id: 'phase-one',
      chapters: [
        {
          ...structuredClone(sourceChapter),
          id: 'chapter-authored-first',
          sequence: 99,
          lessons: [lessonA],
        },
        {
          ...structuredClone(sourceChapter),
          id: 'chapter-authored-second',
          sequence: 0,
          lessons: [lessonB],
        },
      ],
    },
    {
      ...structuredClone(sourcePhase),
      id: 'phase-two',
      chapters: [
        {
          ...structuredClone(sourceChapter),
          id: 'chapter-final',
          sequence: 1,
          lessons: [lessonC],
        },
      ],
    },
  ];
  return course;
}

describe('buildCourseSlideSequence', () => {
  it('配列の著者順を保って全Slideを連結し、Course全体とLesson内の位置を付ける', () => {
    const sequence = buildCourseSlideSequence(createSequencedCourse());

    expect(sequence.map(({ slide }) => slide.id)).toEqual([
      'slide-a1',
      'slide-a2',
      'slide-b1',
      'slide-c1',
    ]);
    expect(sequence[2]).toMatchObject({
      phase: { id: 'phase-one' },
      chapter: { id: 'chapter-authored-second', sequence: 0 },
      lesson: { id: 'lesson-b' },
      courseSlideIndex: 2,
      courseSlideCount: 4,
      lessonIndex: 1,
      lessonCount: 3,
      slideIndex: 0,
      slideCount: 1,
      path: '/library/html-css/lessons/lesson-b/slides/slide-b1',
    });
  });

  it('Lesson／Chapter／Phase境界を越えるpreviousとnextを解決する', () => {
    const course = createSequencedCourse();

    const first = resolveCourseSlideContext(course, 'lesson-a', 'slide-a1');
    expect(first).toMatchObject({
      current: { slide: { id: 'slide-a1' } },
      next: { slide: { id: 'slide-a2' } },
    });
    expect(first).not.toHaveProperty('previous');
    expect(resolveCourseSlideContext(course, 'lesson-b', 'slide-b1')).toMatchObject({
      previous: { slide: { id: 'slide-a2' } },
      current: { slide: { id: 'slide-b1' } },
      next: { slide: { id: 'slide-c1' } },
    });
    const last = resolveCourseSlideContext(course, 'lesson-c', 'slide-c1');
    expect(last).toMatchObject({
      previous: { slide: { id: 'slide-b1' } },
      current: { slide: { id: 'slide-c1' } },
    });
    expect(last).not.toHaveProperty('next');
  });

  it('空Lesson、Course内で重複するSlide ID、所有Lessonと異なるURLを拒否する', () => {
    const emptyLessonCourse = createSequencedCourse();
    emptyLessonCourse.phases[0]!.chapters[0]!.lessons[0]!.slides = [];
    expect(() => buildCourseSlideSequence(emptyLessonCourse)).toThrow(/Slideがありません/);

    const duplicateCourse = createSequencedCourse();
    duplicateCourse.phases[0]!.chapters[1]!.lessons[0]!.slides[0]!.id = 'slide-a1';
    expect(() => buildCourseSlideSequence(duplicateCourse)).toThrow(
      /Slide IDがCourse内で重複しています/,
    );

    const course = createSequencedCourse();
    expect(() => resolveCourseSlideContext(course, 'lesson-b', 'slide-a1')).toThrow(
      /LessonとSlideの組み合わせが見つかりません/,
    );
  });
});

describe('buildLibrarySlidePath', () => {
  it('Library専用のHash Router内部Pathを返す', () => {
    expect(buildLibrarySlidePath('html-css', 'lesson-a', 'slide-a1')).toBe(
      '/library/html-css/lessons/lesson-a/slides/slide-a1',
    );
  });
});
