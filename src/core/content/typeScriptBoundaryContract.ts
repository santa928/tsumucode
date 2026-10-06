/** DOM・unknown・非同期の初回課題にだけ使う、操作と表示の固定契約。 */
export const TypeScriptBoundaryContracts = [
  {
    lessonId: 'typescript-ch05-l01',
    profile: 'dom-event-v1',
    scenarioId: 'dom-answer',
    actions: [['answer', '#answer', '2']],
  },
  {
    lessonId: 'typescript-ch05-l02',
    profile: 'unknown-points-v1',
    scenarioId: 'unknown-points',
    actions: [
      ['valid', '#valid', '2'],
      ['invalid', '#invalid', '不正なデータ'],
      ['missing', '#missing', '不正なデータ'],
    ],
  },
  {
    lessonId: 'typescript-ch05-l03',
    profile: 'async-unknown-v1',
    scenarioId: 'async-points',
    actions: [
      ['success', '#success', '2'],
      ['invalid', '#invalid', '不正なデータ'],
      ['failure', '#failure', '再試行できます'],
      ['retry', '#success', '2'],
    ],
  },
] as const;

export type TypeScriptBoundaryProfile = (typeof TypeScriptBoundaryContracts)[number]['profile'];

/** 任意の値を参照する前に通常のrecordだけを受け入れる。 */
function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/** DOM表示に必要な既存profileだけを要求し、Console実行での代用を拒否する。 */
export function acceptsTypeScriptBoundaryRuntime(
  profile: TypeScriptBoundaryProfile,
  input: unknown,
): boolean {
  const runtime = record(input);
  return (
    !!runtime &&
    runtime['kind'] === 'typescript' &&
    runtime['entryFile'] === 'main.ts' &&
    runtime['sourceType'] === 'module' &&
    runtime['primaryOutput'] === 'preview' &&
    runtime['capabilityProfile'] === (profile === 'async-unknown-v1' ? 'project' : 'dom')
  );
}

/** 操作の省略・別の期待値・追加操作で学習目標を弱める契約を拒否する。 */
export function acceptsTypeScriptBoundaryScenarios(
  profile: TypeScriptBoundaryProfile,
  input: unknown,
): boolean {
  const contract = TypeScriptBoundaryContracts.find((entry) => entry.profile === profile);
  if (!contract || !Array.isArray(input) || input.length !== 1) return false;
  const scenario = record(input[0]);
  if (
    !scenario ||
    scenario['id'] !== contract.scenarioId ||
    !Array.isArray(scenario['actions']) ||
    !Array.isArray(scenario['checkpoints']) ||
    scenario['actions'].length !== contract.actions.length ||
    scenario['checkpoints'].length !== contract.actions.length
  )
    return false;
  const actions: unknown[] = scenario['actions'];
  const checkpoints: unknown[] = scenario['checkpoints'];
  return contract.actions.every(([id, selector, expected], index) => {
    const action = record(actions[index]);
    const checkpoint = record(checkpoints[index]);
    const expectations = checkpoint?.['expectations'];
    const expectation = Array.isArray(expectations) && record(expectations[0]);
    return (
      !!action &&
      action['id'] === id &&
      action['kind'] === 'click' &&
      action['selector'] === selector &&
      !!checkpoint &&
      checkpoint['id'] === id &&
      checkpoint['afterActionId'] === id &&
      Array.isArray(expectations) &&
      expectations.length === 1 &&
      !!expectation &&
      expectation['id'] === 'output' &&
      expectation['kind'] === 'selector-text' &&
      expectation['selector'] === '#output' &&
      expectation['equals'] === expected
    );
  });
}
