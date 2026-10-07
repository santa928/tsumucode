import { analyzeQuizCard, type QuizCardFacts } from './checkQuizCard';
import { analyzeQuizState, type QuizStateFacts } from './checkQuizState';
import type { TypeScriptDiagnostic } from '../typescript/compileTypeScript';

export interface QuizFacts extends QuizCardFacts, QuizStateFacts {}

/** 同じWorkspaceの表示とState関数を元Sourceのまま別々に検査する。 */
export function analyzeQuizSource(
  files: Readonly<Record<string, string>>,
  practice: boolean,
): {
  readonly diagnostics: readonly TypeScriptDiagnostic[];
  readonly facts: QuizFacts;
} {
  const card = analyzeQuizCard(files['QuestionCard.tsx'] ?? '');
  const state = analyzeQuizState(files['quizState.ts'] ?? '', practice);
  return {
    diagnostics: [...card.diagnostics, ...state.diagnostics],
    facts: { ...card.facts, ...state.facts },
  };
}
