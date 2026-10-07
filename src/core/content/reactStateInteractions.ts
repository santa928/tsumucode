import type { JavaScriptInteractionScenario } from './types';

/** 教材の実click順と期待値。Source条件だけで操作検証を省略できない固定契約。 */
export function reactStateScenarios(goal: string | undefined): JavaScriptInteractionScenario[] {
  const list = goal === 'immutable-list';
  const actions = list
    ? [
        ['add-js', '#add'],
        ['add-again', '#add'],
        ['remove-html', '#remove'],
        ['reverse', '#reverse'],
        ['remove-js', '#remove-js'],
        ['re-add-js', '#add'],
      ]
    : [
        ['increment-once', '#increment'],
        ['increment-again', '#increment'],
        ['twice', '#twice'],
      ];
  const ids = [
    ['html', 'css', 'js'],
    ['html', 'css', 'js'],
    ['css', 'js'],
    ['js', 'css'],
    ['css'],
    ['css', 'js'],
  ];
  const values = list
    ? ['HTMLCSSJS', 'HTMLCSSJS', 'CSSJS', 'JSCSS', 'CSS', 'CSSJS']
    : ['1', '2', '4'];
  return [
    {
      id: list ? 'list-operations' : 'counter-updates',
      label: list ? '項目IDを保って配列を更新する' : '操作を繰り返し、更新をまとめる',
      actions: actions.map(([id, selector]) => ({
        id: id!,
        kind: 'click' as const,
        selector: selector!,
      })),
      checkpoints: actions.map(([id], index) => ({
        id: `after-${id!}`,
        afterActionId: id!,
        expectations: [
          {
            id: 'display',
            kind: 'selector-text' as const,
            selector: list ? '#topics' : '#count',
            equals: values[index]!,
          },
          ...(list
            ? ids[index]!.map((id, position) => ({
                id: `item-${String(position + 1)}`,
                kind: 'attribute' as const,
                selector: `#topics li:nth-child(${String(position + 1)})`,
                name: 'data-id',
                equals: id,
              }))
            : []),
        ],
      })),
    },
  ];
}

/** Runtimeと採点でもauthoringと同じ操作全体を要求する。labelとObjectのキー順は採点に使わない。 */
export function acceptsReactStateScenarios(
  goal: string | undefined,
  scenarios: readonly JavaScriptInteractionScenario[] | undefined,
): boolean {
  if (!['counter', 'immutable-list'].includes(goal ?? '') || !scenarios) return false;
  const project = (items: readonly JavaScriptInteractionScenario[]): string =>
    JSON.stringify(
      items.map((scenario) => [
        scenario.id,
        scenario.actions.map((action) => [action.id, action.kind, action.selector]),
        scenario.checkpoints.map((checkpoint) => [
          checkpoint.id,
          checkpoint.afterActionId,
          checkpoint.expectations.map((expectation) =>
            expectation.kind === 'selector-text'
              ? [expectation.id, expectation.kind, expectation.selector, expectation.equals]
              : expectation.kind === 'attribute'
                ? [
                    expectation.id,
                    expectation.kind,
                    expectation.selector,
                    expectation.name,
                    expectation.equals,
                  ]
                : [expectation.id, expectation.kind],
          ),
        ]),
      ]),
    );
  return project(scenarios) === project(reactStateScenarios(goal));
}
