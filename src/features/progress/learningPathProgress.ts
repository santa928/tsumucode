/** LearningPath定義と既存CourseProgressからPath全体の表示状態を導出する。 */
import type { CourseCatalogEntry, LearningPathDefinition } from '../../core/content/types';
import type { CourseProgress } from '../../core/persistence/contracts';
import {
  summarizeCatalogCourseProgress,
  type CatalogCourseProgressSummary,
} from './catalogCourseProgress';

export interface LearningPathStepProgress {
  readonly course: CourseCatalogEntry;
  readonly role: 'required' | 'recommended';
  readonly prerequisiteCourseIds: readonly string[];
  readonly courseProgress: CatalogCourseProgressSummary;
}

export interface LearningPathProgressSummary {
  readonly status: 'not-started' | 'in-progress' | 'complete';
  readonly completedRequiredCourses: number;
  readonly totalRequiredCourses: number;
  readonly actionPath: string;
  readonly steps: readonly LearningPathStepProgress[];
}

/**
 * Step順を維持したままCourse metadataと進捗を結合し、required Courseだけで完了を判定する。
 * recommended Courseは表示へ含めるが、Pathの主要再開先と完了数には含めない。
 */
export function summarizeLearningPathProgress(
  path: LearningPathDefinition,
  courses: readonly CourseCatalogEntry[],
  progressByCourseId: ReadonlyMap<string, CourseProgress | undefined>,
): LearningPathProgressSummary {
  const courseById = new Map(courses.map((course) => [course.id, course] as const));
  const steps = path.steps.map((step): LearningPathStepProgress => {
    const course = courseById.get(step.courseId);
    if (course === undefined) {
      throw new Error(`LearningPathが未知Courseを参照しています: ${step.courseId}`);
    }
    const progress = progressByCourseId.get(step.courseId);
    return {
      course,
      role: step.role,
      prerequisiteCourseIds: step.prerequisiteCourseIds,
      courseProgress: summarizeCatalogCourseProgress(course, progress),
    };
  });
  const requiredSteps = steps.filter(({ role }) => role === 'required');
  const completedRequiredCourses = requiredSteps.filter(
    ({ courseProgress }) => courseProgress.status === 'complete',
  ).length;
  const totalRequiredCourses = requiredSteps.length;
  const complete = totalRequiredCourses > 0 && completedRequiredCourses === totalRequiredCourses;
  const started = steps.some(({ courseProgress }) => courseProgress.status !== 'not-started');
  const nextRequired = requiredSteps.find(
    ({ courseProgress }) => courseProgress.status !== 'complete',
  );

  return {
    status: complete ? 'complete' : started ? 'in-progress' : 'not-started',
    completedRequiredCourses,
    totalRequiredCourses,
    actionPath: complete
      ? `/paths/${path.id}`
      : (nextRequired?.courseProgress.actionPath ?? `/paths/${path.id}`),
    steps,
  };
}
