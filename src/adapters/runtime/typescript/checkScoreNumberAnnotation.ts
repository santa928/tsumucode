/** ch01-l02専用。既存の型注釈fact契約を維持するWorker内の入口。 */
import { checkScoreNumberProgram } from './checkScoreNumberProgram';

export interface ScoreNumberAnnotationFacts {
  readonly programShapeAccepted: boolean;
  readonly explicitNumberAnnotation: boolean;
  readonly forbiddenEscapeAbsent: boolean;
  readonly logsScoreLast: boolean;
  readonly positiveProbeAccepted: boolean;
  readonly negativeProbeRejected: boolean;
}

export type ScoreNumberAnnotationResult =
  | { readonly status: 'ready'; readonly facts: ScoreNumberAnnotationFacts }
  | { readonly status: 'system-error' };

/** 元TSの明示number注釈と非emitの正負検査を既存の有限factへ変換する。 */
export function checkScoreNumberAnnotation(
  files: Readonly<Record<string, string>>,
  libraries: Readonly<Record<string, string>>,
): ScoreNumberAnnotationResult {
  const result = checkScoreNumberProgram(files, libraries, 'annotation');
  if (result.status !== 'ready') return result;
  const { declarationTypeAccepted, ...facts } = result.facts;
  return {
    status: 'ready',
    facts: { ...facts, explicitNumberAnnotation: declarationTypeAccepted },
  };
}
