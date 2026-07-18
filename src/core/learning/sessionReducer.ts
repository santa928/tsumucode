/** 学習画面の同期操作とrevision付き非同期結果を不変状態へ縮約する。 */
import type { EditorCursor } from '../persistence/contracts';
import type { RunnerDiagnostic } from '../runtime/contracts';
import type { ValidationResult } from '../validation/contracts';

export type LearningPhase = 'slide' | 'exercise' | 'review' | 'completion';
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export interface LearningSessionState {
  readonly courseId: string;
  readonly lessonId: string;
  readonly exerciseId: string;
  readonly phase: LearningPhase;
  readonly files: Readonly<Record<string, string>>;
  readonly selectedFile: string;
  readonly cursors: Readonly<Record<string, EditorCursor>>;
  readonly executionRevision: number;
  readonly previewRevision: number | null;
  readonly diagnostics: readonly RunnerDiagnostic[];
  readonly validationHistory: readonly ValidationResult[];
  readonly revealedHintIds: readonly string[];
  readonly reviewReturn?: { readonly slideId: string; readonly scrollOffset: number };
  readonly saveStatus: SaveStatus;
}

export type LearningSessionAction =
  | { readonly type: 'phase.exercise' }
  | { readonly type: 'phase.completion' }
  | { readonly type: 'editor.selected'; readonly path: string }
  | { readonly type: 'editor.cursor'; readonly path: string; readonly cursor: EditorCursor }
  | { readonly type: 'editor.changed'; readonly path: string; readonly content: string }
  | {
      readonly type: 'preview.completed';
      readonly revision: number;
      readonly diagnostics: readonly RunnerDiagnostic[];
    }
  | {
      readonly type: 'validation.completed';
      readonly revision: number;
      readonly result: ValidationResult;
    }
  | { readonly type: 'hint.revealed'; readonly hintId: string }
  | { readonly type: 'review.open'; readonly slideId: string; readonly scrollOffset: number }
  | { readonly type: 'review.close' }
  | { readonly type: 'save.changed'; readonly status: SaveStatus };

/** 新規Exercise用の空の履歴とrevisionを持つ初期stateを、副作用なしで生成する。 */
export function createLearningSessionState(input: {
  readonly courseId: string;
  readonly lessonId: string;
  readonly exerciseId: string;
  readonly files: Readonly<Record<string, string>>;
  readonly selectedFile: string;
}): LearningSessionState {
  return {
    ...input,
    phase: 'slide',
    cursors: {},
    executionRevision: 0,
    previewRevision: null,
    diagnostics: [],
    validationHistory: [],
    revealedHintIds: [],
    saveStatus: 'idle',
  };
}

/** UI操作とadapterの非同期結果を縮約し、古いrevisionの結果はstateを変更せず破棄する。 */
export function learningSessionReducer(
  state: LearningSessionState,
  action: LearningSessionAction,
): LearningSessionState {
  switch (action.type) {
    case 'phase.exercise':
      return { ...state, phase: 'exercise' };
    case 'phase.completion':
      return { ...state, phase: 'completion' };
    case 'editor.selected':
      return { ...state, selectedFile: action.path };
    case 'editor.cursor':
      return { ...state, cursors: { ...state.cursors, [action.path]: action.cursor } };
    case 'editor.changed':
      return {
        ...state,
        files: { ...state.files, [action.path]: action.content },
        executionRevision: state.executionRevision + 1,
        saveStatus: 'saving',
      };
    case 'preview.completed':
      return action.revision === state.executionRevision
        ? {
            ...state,
            previewRevision: action.revision,
            diagnostics: action.diagnostics,
          }
        : state;
    case 'validation.completed':
      return action.revision === state.executionRevision
        ? { ...state, validationHistory: [...state.validationHistory, action.result] }
        : state;
    case 'hint.revealed':
      return state.revealedHintIds.includes(action.hintId)
        ? state
        : { ...state, revealedHintIds: [...state.revealedHintIds, action.hintId] };
    case 'review.open':
      return {
        ...state,
        phase: 'review',
        reviewReturn: { slideId: action.slideId, scrollOffset: action.scrollOffset },
      };
    case 'review.close':
      return { ...state, phase: 'exercise' };
    case 'save.changed':
      return { ...state, saveStatus: action.status };
  }
}
