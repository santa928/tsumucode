import type { Exercise } from './types';

/** 宣言済みscenario/checkpointの集約合格IDを既存形式で作る。 */
export function interactionRequirementId(scenarioId: string, checkpointId: string): string {
  return `interaction:${scenarioId}:${checkpointId}`;
}

/** 宣言済みexpectationの履歴check ID。合格evidenceのIDとは区別する。 */
export function interactionCheckId(
  scenarioId: string,
  checkpointId: string,
  expectationId: string,
): string {
  return `${interactionRequirementId(scenarioId, checkpointId)}:${expectationId}`;
}

/** 対象Exerciseだけの合格受理・置換・編集失効に使うID集合。 */
export function exerciseRequirementIds(exercise: Exercise): readonly string[] {
  return [
    ...new Set([
      ...exercise.validationRules.map(({ groupId, id }) => groupId ?? id),
      ...(exercise.interactionScenarios ?? []).flatMap((scenario) =>
        scenario.checkpoints.map((checkpoint) =>
          interactionRequirementId(scenario.id, checkpoint.id),
        ),
      ),
    ]),
  ];
}

/** Index・履歴・移行で照合するrule/group/checkpoint/expectationの参照集合。 */
export function exerciseReferenceIds(exercise: Exercise): readonly string[] {
  return [
    ...new Set([
      ...exercise.validationRules.flatMap(({ groupId, id }) =>
        groupId === undefined ? [id] : [id, groupId],
      ),
      ...(exercise.interactionScenarios ?? []).flatMap((scenario) =>
        scenario.checkpoints.flatMap((checkpoint) => [
          interactionRequirementId(scenario.id, checkpoint.id),
          ...checkpoint.expectations.map((expectation) =>
            interactionCheckId(scenario.id, checkpoint.id, expectation.id),
          ),
        ]),
      ),
    ]),
  ];
}
