import { acceptsReactFormScenarios, reactFormScenarios } from './reactFormInteractions';
import type { JavaScriptInteractionScenario } from './types';

const GOALS = {
  'reducer-form': { legacy: 'controlled-form', id: 'reducer-form-input-submit-reset' },
  'context-sharing': { legacy: 'shared-state', id: 'context-sharing-input-reset' },
} as const;
const contract = (goal: string | undefined) =>
  goal === 'reducer-form' || goal === 'context-sharing' ? GOALS[goal] : undefined;

/** 既習と同じ全操作を、新単元固有のIDへ結び、Course内のcheckpoint衝突を避ける。 */
export function reactReducerContextScenarios(
  goal: string | undefined,
): JavaScriptInteractionScenario[] {
  const fixed = contract(goal);
  return fixed
    ? reactFormScenarios(fixed.legacy).map((scenario) => ({ ...scenario, id: fixed.id }))
    : [];
}

/** 固有IDを確認してから既存の全操作・全期待値の厳密契約で照合する。 */
export function acceptsReactReducerContextScenarios(
  goal: string | undefined,
  scenarios: readonly JavaScriptInteractionScenario[] | undefined,
): boolean {
  const fixed = contract(goal);
  if (!fixed || !Array.isArray(scenarios)) return false;
  const legacyId = reactFormScenarios(fixed.legacy)[0]!.id;
  const matches = (items: readonly JavaScriptInteractionScenario[]): boolean =>
    items.length === 1 &&
    items[0]?.id === fixed.id &&
    acceptsReactFormScenarios(
      fixed.legacy,
      items.map((scenario) => ({ ...scenario, id: legacyId })),
    );
  return matches(scenarios);
}
