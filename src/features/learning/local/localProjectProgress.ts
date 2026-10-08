/** Localの採点を既存のDraft/Validation/JSON契約へ変換する。実行identityの照合はSessionで行う。 */
import type {
  WorkspaceFiles,
  WorkspaceGrade,
} from '../../../adapters/runtime/local/LocalWorkspaceClient';
import type { CourseProgress, ExerciseDraft } from '../../../core/persistence/contracts';
import { LOCAL_PROJECT } from '../../../core/persistence/localProjectDescriptor';
import type { ValidationResult } from '../../../core/validation/contracts';

export function sameProjectFiles(
  left: Readonly<Record<string, string>>,
  right: Readonly<Record<string, string>>,
): boolean {
  const paths = ['index.html', 'main.js', 'message.js', 'styles.css'];
  return (
    Object.keys(left).length === 4 &&
    Object.keys(right).length === 4 &&
    paths.every((path) => left[path] === right[path])
  );
}

export function projectDraft(files: WorkspaceFiles): ExerciseDraft {
  return {
    courseId: LOCAL_PROJECT.courseId,
    lessonId: LOCAL_PROJECT.lessonId,
    exerciseId: LOCAL_PROJECT.exerciseId,
    workspaceId: LOCAL_PROJECT.workspaceId,
    contentRevision: LOCAL_PROJECT.revision,
    editRevision: 1,
    files,
    selectedFile: 'message.js',
    cursors: {},
    validationHistory: [],
    revealedHintIds: [],
    lastPassingSnapshots: {},
    updatedAt: new Date().toISOString(),
  };
}

export function projectIsComplete(draft: ExerciseDraft): boolean {
  const passed = draft.lastPassingSnapshots[LOCAL_PROJECT.exerciseId];
  return (
    passed !== undefined &&
    passed.contentRevision === LOCAL_PROJECT.revision &&
    sameProjectFiles(passed.files, draft.files)
  );
}

export function projectValidation(grade: WorkspaceGrade, editRevision: number): ValidationResult {
  const passed = grade.status === 'pass';
  return {
    exerciseId: LOCAL_PROJECT.exerciseId,
    executionRevision: editRevision,
    status: grade.status,
    checks: [
      {
        ruleId: LOCAL_PROJECT.ruleId,
        requirementId: LOCAL_PROJECT.requirementId,
        label: '実サーバーの見出し',
        required: true,
        passed,
        requirementPassed: passed,
        message: passed
          ? '実サーバーで見出しを確認しました。'
          : '可視の h1#message とJavaScriptのエラーを確認してください。',
        expected: 'こんにちは、実サーバー！',
        actual: grade.actual,
        nextAction: passed
          ? '停止しても下書きと合格記録は残ります。'
          : '編集して保存し、実行へ反映してからもう一度判定してください。',
      },
    ],
    passedRequirementIds: passed ? [LOCAL_PROJECT.requirementId] : [],
    diagnostics: grade.diagnostics.map((message) => ({
      code: 'local-project-javascript',
      kind: 'reference' as const,
      severity: 'error' as const,
      message,
      learnerMessage: message,
    })),
    evaluatedAt: grade.evaluatedAt,
  };
}

export function projectCourseProgress(
  draft: ExerciseDraft,
  previous?: CourseProgress,
): CourseProgress {
  const complete = projectIsComplete(draft);
  const firstCompletedAt = previous?.firstCompletedAt ?? (complete ? draft.updatedAt : undefined);
  return {
    courseId: LOCAL_PROJECT.courseId,
    contentRevision: LOCAL_PROJECT.revision,
    currentLessonId: LOCAL_PROJECT.lessonId,
    currentChapterId: LOCAL_PROJECT.chapterId,
    currentComplete: complete,
    ...(firstCompletedAt ? { firstCompletedAt } : {}),
    updatedAt: draft.updatedAt,
    lessons: {
      [LOCAL_PROJECT.lessonId]: {
        lessonId: LOCAL_PROJECT.lessonId,
        viewedSlideIds: [],
        passedExerciseIds: complete ? [LOCAL_PROJECT.exerciseId] : [],
        passedChecklistItemIds: [],
        passedRuleIds: complete ? [LOCAL_PROJECT.ruleId] : [],
        passedViewportIds: [],
        currentComplete: complete,
        ...(firstCompletedAt ? { firstCompletedAt } : {}),
      },
    },
  };
}
