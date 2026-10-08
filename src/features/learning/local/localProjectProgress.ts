/** Localの採点を既存のDraft/Validation/JSON契約へ変換する。実行identityの照合はSessionで行う。 */
import type {
  WorkspaceFiles,
  WorkspaceGrade,
} from '../../../adapters/runtime/local/LocalWorkspaceClient';
import type { CourseProgress, ExerciseDraft } from '../../../core/persistence/contracts';
import type { WorkspaceProfile } from '../../../adapters/runtime/local/LocalWorkspaceClient';
import { LOCAL_PROJECT } from '../../../core/persistence/localProjectDescriptor';
import type { ValidationResult } from '../../../core/validation/contracts';

export function sameProjectFiles(
  left: Readonly<Record<string, string>>,
  right: Readonly<Record<string, string>>,
): boolean {
  const paths = Object.keys(left);
  return (
    paths.length === Object.keys(right).length && paths.every((path) => left[path] === right[path])
  );
}

export interface ProjectIdentity {
  readonly courseId: string;
  readonly lessonId: string;
  readonly exerciseId: string;
  readonly workspaceId: string;
  readonly ruleId: string;
  readonly requirementId: string;
  readonly revision: string;
  readonly selectedFile?: string;
  readonly profile?: WorkspaceProfile;
}

export function projectDraft(
  files: WorkspaceFiles,
  identity: ProjectIdentity = LOCAL_PROJECT,
): ExerciseDraft {
  return {
    courseId: identity.courseId,
    lessonId: identity.lessonId,
    exerciseId: identity.exerciseId,
    workspaceId: identity.workspaceId,
    contentRevision: identity.revision,
    editRevision: 1,
    files,
    selectedFile: identity.selectedFile ?? 'message.js',
    cursors: {},
    validationHistory: [],
    revealedHintIds: [],
    lastPassingSnapshots: {},
    updatedAt: new Date().toISOString(),
  };
}

export function projectIsComplete(
  draft: ExerciseDraft,
  identity: ProjectIdentity = LOCAL_PROJECT,
): boolean {
  const passed = draft.lastPassingSnapshots[identity.exerciseId];
  return (
    passed !== undefined &&
    (identity.profile !== 'next-project-v1' || passed.editRevision === draft.editRevision) &&
    passed.contentRevision === identity.revision &&
    sameProjectFiles(passed.files, draft.files)
  );
}

export function projectValidation(
  grade: WorkspaceGrade,
  editRevision: number,
  identity: ProjectIdentity = LOCAL_PROJECT,
): ValidationResult {
  const passed = grade.status === 'pass';
  return {
    exerciseId: identity.exerciseId,
    executionRevision: editRevision,
    status: grade.status,
    checks: [
      {
        ruleId: identity.ruleId,
        requirementId: identity.requirementId,
        label:
          identity.profile === 'next-project-v1' ? 'このLessonの実URLと動作' : '実サーバーの見出し',
        required: true,
        passed,
        requirementPassed: passed,
        message: passed
          ? identity.profile === 'next-project-v1'
            ? 'このLessonの実URLと動作を確認しました。'
            : '実サーバーで見出しを確認しました。'
          : identity.profile === 'next-project-v1'
            ? 'このLessonの工程票、Previewの表示・操作、実行エラーを確認してください。'
            : '可視の h1#message とJavaScriptのエラーを確認してください。',
        expected:
          identity.profile === 'next-project-v1'
            ? '工程票に指定された実URLと動作'
            : 'こんにちは、実サーバー！',
        actual: grade.actual,
        nextAction: passed
          ? '停止しても下書きと合格記録は残ります。'
          : '編集して保存し、実行へ反映してからもう一度判定してください。',
      },
    ],
    passedRequirementIds: passed ? [identity.requirementId] : [],
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
