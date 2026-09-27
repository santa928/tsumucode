import { describe, expect, it } from 'vitest';
import { fixtureCourseIndex } from '../../../tests/fixtures/course';
import { readingLessons, resolveReadingResume } from './readingTargets';

const lesson = fixtureCourseIndex.phases[0]!.chapters[0]!.lessons[0]!;
const position = {
  scope: 'library' as const,
  courseId: fixtureCourseIndex.id,
  lessonId: lesson.id,
  slideId: lesson.slides[0]!.id,
  mode: 'continuous' as const,
};

describe('読書しおりの所属確認', () => {
  it('現存する同LessonのSlideだけへ復帰し、存在しないSlideはLesson目次へ戻す', () => {
    expect(resolveReadingResume(fixtureCourseIndex, position, false)).toEqual({
      path: `/library/html-css/lessons/${lesson.id}/read?slide=${position.slideId}`,
      stale: false,
    });
    expect(
      resolveReadingResume(fixtureCourseIndex, { ...position, slideId: 'removed-slide' }, false),
    ).toEqual({ path: `/library/html-css/lessons/${lesson.id}/read`, stale: true });
  });
  it('消えたLessonやCourse取り違えは本文へ転送しない', () => {
    expect(
      resolveReadingResume(fixtureCourseIndex, { ...position, lessonId: 'removed-lesson' }, false),
    ).toEqual({ path: '/library/html-css', stale: true });
    expect(
      resolveReadingResume(fixtureCourseIndex, { ...position, courseId: 'javascript' }, false),
    ).toEqual({ path: '/library/html-css', stale: true });
  });
  it('試用対象外の保存値からCourse全体へ抜ける導線を生成しない', () => {
    expect(readingLessons(fixtureCourseIndex, true)).toEqual([]);
    expect(resolveReadingResume(fixtureCourseIndex, position, true)).toEqual({
      path: '/library/pilot',
      stale: true,
    });
    expect(readingLessons(fixtureCourseIndex, false)).toContainEqual(lesson);
  });
});
