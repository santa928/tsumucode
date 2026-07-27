/** Exercise StepをStarter File、Concept要求、Validation Ruleへ追跡して検証する。 */
import type { Exercise } from '../../src/core/content/types';

export type ExerciseTraceDiagnosticKind =
  | 'missing-editable-file'
  | 'missing-starter-anchor'
  | 'duplicate-starter-anchor'
  | 'missing-validation-rule'
  | 'unknown-step-concept'
  | 'unreferenced-validation-rule';

export interface ExerciseTraceDiagnostic {
  readonly kind: ExerciseTraceDiagnosticKind;
  readonly exerciseId: string;
  readonly stepId?: string;
  readonly file?: string;
  readonly ruleId?: string;
  readonly conceptId?: string;
}

/** 文字列中にneedleが重ならずに現れる件数を返す。 */
function countOccurrences(source: string, needle: string): number {
  let count = 0;
  let cursor = 0;
  while (cursor <= source.length - needle.length) {
    const index = source.indexOf(needle, cursor);
    if (index < 0) break;
    count += 1;
    cursor = index + needle.length;
  }
  return count;
}

/** 1 ExerciseのStep参照を宣言順で検査し、安定順序の診断を返す。 */
export function collectExerciseTraceDiagnostics(
  exercise: Exercise,
): readonly ExerciseTraceDiagnostic[] {
  const diagnostics: ExerciseTraceDiagnostic[] = [];
  const editableFiles = new Map(
    exercise.files.filter(({ editable }) => editable).map((file) => [file.path, file]),
  );
  const ruleIds = new Set(exercise.validationRules.map(({ id }) => id));
  const requiredConceptIds = new Set(exercise.requiresConcepts.map(({ conceptId }) => conceptId));
  const referencedRuleIds = new Set<string>();

  for (const step of exercise.steps) {
    const file = editableFiles.get(step.file);
    if (file === undefined) {
      diagnostics.push({
        kind: 'missing-editable-file',
        exerciseId: exercise.id,
        stepId: step.id,
        file: step.file,
      });
    } else {
      const anchorCount = countOccurrences(file.content, step.starterAnchor);
      if (anchorCount === 0) {
        diagnostics.push({
          kind: 'missing-starter-anchor',
          exerciseId: exercise.id,
          stepId: step.id,
          file: step.file,
        });
      } else if (anchorCount > 1) {
        diagnostics.push({
          kind: 'duplicate-starter-anchor',
          exerciseId: exercise.id,
          stepId: step.id,
          file: step.file,
        });
      }
    }

    for (const ruleId of step.validationRuleIds) {
      if (!ruleIds.has(ruleId)) {
        diagnostics.push({
          kind: 'missing-validation-rule',
          exerciseId: exercise.id,
          stepId: step.id,
          ruleId,
        });
      } else {
        referencedRuleIds.add(ruleId);
      }
    }
    for (const conceptId of step.requiresConceptIds) {
      if (!requiredConceptIds.has(conceptId)) {
        diagnostics.push({
          kind: 'unknown-step-concept',
          exerciseId: exercise.id,
          stepId: step.id,
          conceptId,
        });
      }
    }
  }

  for (const rule of exercise.validationRules) {
    if (!referencedRuleIds.has(rule.id)) {
      diagnostics.push({
        kind: 'unreferenced-validation-rule',
        exerciseId: exercise.id,
        ruleId: rule.id,
      });
    }
  }
  return diagnostics;
}

/** Trace診断が1件でもあるExerciseを位置情報付きErrorで拒否する。 */
export function assertExerciseTrace(exercise: Exercise): void {
  const first = collectExerciseTraceDiagnostics(exercise)[0];
  if (first === undefined) return;
  throw new Error(
    `Exercise Traceが不正です: exercise=${first.exerciseId} step=${first.stepId ?? '-'} kind=${first.kind} file=${first.file ?? '-'} rule=${first.ruleId ?? '-'} concept=${first.conceptId ?? '-'}`,
  );
}
