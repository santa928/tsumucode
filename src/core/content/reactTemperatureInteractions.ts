import type { JavaScriptInteractionScenario } from './types';

/** 2回加算・減算・Reset後の再操作を、必ず両方の温度表示で観測する。 */
export function reactTemperatureScenarios(): JavaScriptInteractionScenario[] {
  const operations = [
    ['increase-once', '#increase', '21', '69.8'],
    ['increase-again', '#increase', '22', '71.6'],
    ['decrease', '#decrease', '21', '69.8'],
    ['reset', '#reset', '20', '68'],
    ['decrease-after-reset', '#decrease', '19', '66.2'],
    ['reset-again', '#reset', '20', '68'],
    ['increase-after-reset', '#increase', '21', '69.8'],
  ] as const;
  return [
    {
      id: 'temperature-synchronized-operations',
      label: '両方の温度と、最初に戻した後の操作を確かめる',
      actions: operations.map(([id, selector]) => ({ id, kind: 'click', selector })),
      checkpoints: operations.map(([id, , celsius, fahrenheit]) => ({
        id: `after-${id}`,
        afterActionId: id,
        expectations: [
          { id: 'celsius', kind: 'selector-text', selector: '#celsius', equals: celsius },
          { id: 'fahrenheit', kind: 'selector-text', selector: '#fahrenheit', equals: fahrenheit },
        ],
      })),
    },
  ];
}

/** ラベル以外のwire fieldと順序を厳密に比べ、省略・未知fieldも拒否する。 */
export function acceptsReactTemperatureScenarios(
  goal: string | undefined,
  scenarios: readonly JavaScriptInteractionScenario[] | undefined,
): boolean {
  if (goal !== 'temperature-panel' || !Array.isArray(scenarios)) return false;
  const fields = (item: object): [string, unknown][] =>
    Object.entries(item).sort(([a], [b]) => a.localeCompare(b));
  const project = (items: readonly JavaScriptInteractionScenario[]): string =>
    JSON.stringify(
      items.map((item) => [
        Object.keys(item).sort(),
        item.id,
        item.actions.map(fields),
        item.checkpoints.map((checkpoint) =>
          fields(checkpoint).map(([key, value]) =>
            key === 'expectations' ? [key, (value as object[]).map(fields)] : [key, value],
          ),
        ),
      ]),
    );
  try {
    return project(scenarios) === project(reactTemperatureScenarios());
  } catch {
    return false;
  }
}
