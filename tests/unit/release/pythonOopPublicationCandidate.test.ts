// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { compileCourse } from '../../../scripts/content/compileCourse';
import { compileLearningPaths } from '../../../scripts/content/learningPaths';
import { buildSplitContentDelivery } from '../../../scripts/content/splitContentDelivery';
import { summarizeLearningPathProgress } from '../../../src/features/progress/learningPathProgress';
import type { CourseProgress, LessonProgress } from '../../../src/core/persistence/contracts';

describe('Python OOP publication candidate', () => {
  it('publishes the fixed OOP course as an optional Path step without changing existing completion', async () => {
    const paths = await compileLearningPaths('content/learning-paths');
    const python = paths.find((value) => value.id === 'python-basics');
    if (!python) throw Error('Python Path is missing');
    expect(python.steps).toEqual([
      { courseId: 'python-basics', role: 'required', prerequisiteCourseIds: [] },
      {
        courseId: 'python-practice',
        role: 'recommended',
        prerequisiteCourseIds: ['python-basics'],
      },
      {
        courseId: 'python-oop',
        role: 'recommended',
        prerequisiteCourseIds: ['python-basics', 'python-practice'],
      },
    ]);
    expect(python.description).toContain('選択コースでデータ処理やClassの設計を実践できます');
    expect(python.description).toContain('未対応のブラウザでは実行前に入力します');
    expect(python.description).toContain('「練習実行」は採点されず');
    const compiled = await Promise.all(
      ['python-basics', 'python-practice', 'python-oop'].map((id) =>
        compileCourse(`content/${id}`),
      ),
    );
    const oop = compiled.find(({ runtime }) => runtime.id === 'python-oop');
    expect(oop?.runtime).toMatchObject({
      publicationStatus: 'published',
      prerequisites: ['python-basics', 'python-practice'],
      expectedTotals: {
        chapters: 4,
        lessons: 9,
        conceptSlides: 34,
        standardExercises: 8,
        guidedProjectLessons: 1,
      },
    });
    const catalog = buildSplitContentDelivery(compiled, [python]).catalog;
    expect(catalog.courses.find(({ id }) => id === 'python-oop')).toMatchObject({
      publicationStatus: 'published',
      title: 'PythonのClassとobjectの設計',
    });
    const basics = catalog.courses.find(({ id }) => id === 'python-basics');
    if (!basics || !basics.lessonStarts[0]) throw Error('Python basics lessons are missing');
    const now = '2026-11-14T00:00:00.000Z';
    const lessons = Object.fromEntries(
      basics.lessonStarts.map(({ lessonId }) => {
        const progress: LessonProgress = {
          lessonId,
          viewedSlideIds: [],
          passedExerciseIds: [],
          passedChecklistItemIds: [],
          passedRuleIds: [],
          passedViewportIds: [],
          currentComplete: true,
          firstCompletedAt: now,
        };
        return [lessonId, progress];
      }),
    );
    const complete: CourseProgress = {
      courseId: basics.id,
      contentRevision: basics.revision,
      lessons,
      currentLessonId: basics.lessonStarts[0].lessonId,
      currentComplete: true,
      firstCompletedAt: now,
      updatedAt: now,
    };
    const progress = new Map([[basics.id, complete]]);
    const oldPath = {
      ...python,
      steps: python.steps.filter(({ courseId }) => courseId !== 'python-oop'),
    };
    const before = summarizeLearningPathProgress(oldPath, catalog.courses, progress);
    const after = summarizeLearningPathProgress(python, catalog.courses, progress);
    expect(after).toMatchObject({
      status: 'complete',
      totalRequiredCourses: 1,
      completedRequiredCourses: 1,
      actionPath: '/paths/python-basics',
    });
    expect(after.status).toBe(before.status);
    expect(after.actionPath).toBe(before.actionPath);
    expect(after.steps.find(({ course }) => course.id === 'python-oop')).toMatchObject({
      role: 'recommended',
      courseProgress: { status: 'not-started' },
    });
  });
});
