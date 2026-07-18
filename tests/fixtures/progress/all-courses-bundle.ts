import type {
  CourseProgress,
  ExerciseDraft,
  RepositorySnapshot,
} from '../../../src/core/persistence/contracts';

/** Transfer testでCourse進捗を最小の完全recordとして生成する。 */
export function createCourseProgress(
  courseId: string,
  contentRevision: string,
  updatedAt = '2026-07-10T00:00:00.000Z',
): CourseProgress {
  return {
    courseId,
    contentRevision,
    lessons: {},
    currentComplete: false,
    updatedAt,
  };
}

/** Transfer testでDraftを最小の完全recordとして生成する。 */
export function createExerciseDraft(
  courseId: string,
  contentRevision: string,
  workspaceId = 'workspace-first-heading',
  updatedAt = '2026-07-10T00:00:00.000Z',
): ExerciseDraft {
  return {
    courseId,
    lessonId: 'lesson-first-heading',
    exerciseId: 'exercise-first-heading',
    workspaceId,
    contentRevision,
    editRevision: 1,
    files: { 'index.html': '<main></main>' },
    selectedFile: 'index.html',
    cursors: { 'index.html': { anchor: 0, head: 0 } },
    validationHistory: [],
    revealedHintIds: [],
    lastPassingSnapshots: {},
    updatedAt,
  };
}

/** 複数Course export/importのfixture snapshotを生成する。 */
export function createAllCoursesSnapshot(): RepositorySnapshot {
  const htmlCss = createCourseProgress('html-css', '2026-07-10.1');
  const sandbox = createCourseProgress('sandbox', 'rev-1');
  const draft = createExerciseDraft('html-css', '2026-07-10.1');
  return {
    schemaVersion: 2,
    courses: { 'html-css': htmlCss, sandbox },
    drafts: { 'html-css:workspace-first-heading': draft },
    quarantined: [],
  };
}
