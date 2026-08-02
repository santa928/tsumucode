/** CourseProgressだけからLearningPath進捗を導出する純粋契約を検証する。 */
import { describe, expect, it, vi } from 'vitest';
import { fixtureCatalog } from '../../../tests/fixtures/course';
import type { CourseCatalogEntry, LearningPathDefinition } from '../../core/content/types';
import type { CourseProgress, LessonProgress } from '../../core/persistence/contracts';
import { summarizeLearningPathProgress } from './learningPathProgress';

const NOW = '2026-07-31T00:00:00.000Z';

/** Fixture entryをCourse IDと先頭Lessonだけ差し替えて複製する。 */
function courseEntry(id: string, lessonId: string, targetId: string): CourseCatalogEntry {
  return {
    ...structuredClone(fixtureCatalog.courses[0]!),
    id,
    revision: `2026-07-31.${id}`,
    indexPath: `generated/content/courses/${id}/index.json`,
    indexSha256: id === 'javascript' ? 'b'.repeat(64) : 'c'.repeat(64),
    lessonStarts: [{ lessonId, target: { kind: 'slide', targetId } }],
  };
}

/** required 2件と途中recommended 1件のPath fixtureを作る。 */
function frontendFixture(): {
  readonly path: LearningPathDefinition;
  readonly courses: readonly CourseCatalogEntry[];
} {
  const html = structuredClone(fixtureCatalog.courses[0]!);
  const tailwind = courseEntry('tailwind', 'tailwind-utilities', 'tailwind-utilities-intro');
  const javascript = courseEntry('javascript', 'js-values', 'js-values-intro');
  return {
    path: {
      ...structuredClone(fixtureCatalog.learningPaths[0]!),
      steps: [
        { courseId: html.id, role: 'required', prerequisiteCourseIds: [] },
        {
          courseId: tailwind.id,
          role: 'recommended',
          prerequisiteCourseIds: [html.id],
        },
        {
          courseId: javascript.id,
          role: 'required',
          prerequisiteCourseIds: [html.id],
        },
      ],
    },
    courses: [javascript, html, tailwind],
  };
}

/** Lesson単位の完了recordを作る。 */
function completedLesson(lessonId: string): LessonProgress {
  return {
    lessonId,
    viewedSlideIds: [],
    passedExerciseIds: [],
    passedChecklistItemIds: [],
    passedRuleIds: [],
    passedViewportIds: [],
    currentComplete: true,
    firstCompletedAt: NOW,
  };
}

/** Course entryに対応する進捗を作る。 */
function courseProgress(course: CourseCatalogEntry, complete: boolean): CourseProgress {
  const lessonId = course.lessonStarts[0]!.lessonId;
  return {
    courseId: course.id,
    contentRevision: course.revision,
    lessons: complete ? { [lessonId]: completedLesson(lessonId) } : {},
    currentLessonId: lessonId,
    currentComplete: complete,
    ...(complete ? { firstCompletedAt: NOW } : {}),
    updatedAt: NOW,
  };
}

describe('summarizeLearningPathProgress', () => {
  it('recommended未完了を飛ばして最初の未完了requiredを再開する', () => {
    const { path, courses } = frontendFixture();
    const html = courses.find(({ id }) => id === 'html-css')!;
    const javascript = courses.find(({ id }) => id === 'javascript')!;
    const summary = summarizeLearningPathProgress(
      path,
      courses,
      new Map([
        [html.id, courseProgress(html, true)],
        ['tailwind', undefined],
        [javascript.id, courseProgress(javascript, false)],
      ]),
    );

    expect(summary).toMatchObject({
      status: 'in-progress',
      completedRequiredCourses: 1,
      totalRequiredCourses: 2,
      actionPath: '/courses/javascript/lessons/js-values/slides/js-values-intro',
    });
    expect(summary.steps.map(({ course }) => course.id)).toEqual([
      'html-css',
      'tailwind',
      'javascript',
    ]);
    expect(summary.steps.find(({ course }) => course.id === 'tailwind')).toMatchObject({
      role: 'recommended',
      courseProgress: { status: 'not-started' },
    });
  });

  it('全required完了時はrecommended未完了でもPath完了にする', () => {
    const { path, courses } = frontendFixture();
    const html = courses.find(({ id }) => id === 'html-css')!;
    const javascript = courses.find(({ id }) => id === 'javascript')!;

    const summary = summarizeLearningPathProgress(
      path,
      courses,
      new Map([
        [html.id, courseProgress(html, true)],
        ['tailwind', undefined],
        [javascript.id, courseProgress(javascript, true)],
      ]),
    );

    expect(summary.status).toBe('complete');
    expect(summary.completedRequiredCourses).toBe(2);
    expect(summary.actionPath).toBe('/paths/frontend');
  });

  it('全Course未開始なら最初のrequiredから始める', () => {
    const { path, courses } = frontendFixture();

    const summary = summarizeLearningPathProgress(path, courses, new Map());

    expect(summary).toMatchObject({
      status: 'not-started',
      completedRequiredCourses: 0,
      totalRequiredCourses: 2,
      actionPath: '/courses/html-css/lessons/lesson-first-heading/slides/slide-html-role',
    });
  });

  it('requiredのrevision不一致は未完了としてCourse Mapへ案内する', () => {
    const { path, courses } = frontendFixture();
    const html = courses.find(({ id }) => id === 'html-css')!;

    const summary = summarizeLearningPathProgress(
      path,
      courses,
      new Map([[html.id, courseProgress(html, false)]]),
    );
    const htmlProgress = {
      ...courseProgress(html, false),
      contentRevision: 'old-revision',
    };
    const mismatch = summarizeLearningPathProgress(
      path,
      courses,
      new Map([[html.id, htmlProgress]]),
    );

    expect(summary.actionPath).not.toBe('/courses/html-css');
    expect(mismatch).toMatchObject({
      status: 'in-progress',
      completedRequiredCourses: 0,
      actionPath: '/courses/html-css',
    });
  });

  it('Pathが参照する未知Courseをprogramming errorとして拒否する', () => {
    const { path, courses } = frontendFixture();
    const invalidPath: LearningPathDefinition = {
      ...path,
      steps: [
        ...path.steps,
        { courseId: 'missing-course', role: 'required', prerequisiteCourseIds: [] },
      ],
    };

    expect(() => summarizeLearningPathProgress(invalidPath, courses, new Map())).toThrow(
      /missing-course/u,
    );
  });

  it('各CourseProgressをCourseごとに1回だけ参照する', () => {
    const { path, courses } = frontendFixture();
    const progress = new Map<string, CourseProgress | undefined>();
    const get = vi.spyOn(progress, 'get');

    summarizeLearningPathProgress(path, courses, progress);

    expect(get).toHaveBeenCalledTimes(path.steps.length);
    for (const step of path.steps) expect(get).toHaveBeenCalledWith(step.courseId);
  });
});
