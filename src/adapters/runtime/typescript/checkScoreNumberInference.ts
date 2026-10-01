/** 型推論と明示注釈の学習目標を混同しない、ch01-l01専用の結果境界。 */
import { checkScoreNumberProgram } from './checkScoreNumberProgram';

export interface ScoreNumberInferenceFacts {
  readonly programShapeAccepted: boolean;
  readonly unannotatedLetDeclaration: boolean;
  readonly forbiddenEscapeAbsent: boolean;
  readonly logsScoreLast: boolean;
  readonly positiveProbeAccepted: boolean;
  readonly negativeProbeRejected: boolean;
}

export type ScoreNumberInferenceResult =
  | { readonly status: 'ready'; readonly facts: ScoreNumberInferenceFacts }
  | { readonly status: 'system-error' };

/** 注釈なしのletを元TSで検査し、数値の受入と文字列の拒否を非実行で確かめる。 */
export function checkScoreNumberInference(
  files: Readonly<Record<string, string>>,
  libraries: Readonly<Record<string, string>>,
): ScoreNumberInferenceResult {
  const result = checkScoreNumberProgram(files, libraries, 'inference');
  if (result.status !== 'ready') return result;
  const { declarationTypeAccepted, ...facts } = result.facts;
  return {
    status: 'ready',
    facts: { ...facts, unannotatedLetDeclaration: declarationTypeAccepted },
  };
}
