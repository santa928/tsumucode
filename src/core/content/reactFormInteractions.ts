import type {
  JavaScriptInteractionAction,
  JavaScriptInteractionScenario,
  JavaScriptCheckpointExpectation,
} from './types';

/** 空値・空白・異なる長さと送信/やり直しを、実入力と実submitの取消へ結ぶ。 */
export function reactFormScenarios(goal: string | undefined): JavaScriptInteractionScenario[] {
  const form = goal === 'controlled-form';
  const actions: JavaScriptInteractionAction[] = form
    ? [
        { id: 'empty-submit', kind: 'click', selector: '#submit' },
        { id: 'spaces', kind: 'fill', selector: '#name', value: '   ' },
        { id: 'spaces-submit', kind: 'click', selector: '#submit' },
        { id: 'short-name', kind: 'fill', selector: '#name', value: 'Ada' },
        { id: 'valid-submit', kind: 'click', selector: '#submit' },
        { id: 'long-name', kind: 'fill', selector: '#name', value: 'TypeScript' },
        { id: 'resubmit', kind: 'click', selector: '#submit' },
        { id: 'reset', kind: 'click', selector: '#reset' },
      ]
    : [
        { id: 'short-name', kind: 'fill', selector: '#name', value: 'Ada' },
        { id: 'long-name', kind: 'fill', selector: '#name', value: 'TypeScript' },
        { id: 'spaces', kind: 'fill', selector: '#name', value: '   ' },
        { id: 'clear', kind: 'fill', selector: '#name', value: '' },
        { id: 'another-name', kind: 'fill', selector: '#name', value: 'React' },
        { id: 'reset', kind: 'click', selector: '#reset' },
      ];
  const names = form
    ? ['', '   ', '   ', 'Ada', 'Ada', 'TypeScript', 'TypeScript', '']
    : ['Ada', 'TypeScript', '   ', '', 'React', ''];
  return [
    {
      id: form ? 'form-input-submit-reset' : 'shared-state-input-reset',
      label: form ? '1つのStateから入力・検証表示を導く' : '親Stateを兄弟の入力・要約へ共有する',
      actions,
      checkpoints: actions.map((action, index) => {
        const name = names[index]!;
        const submitted =
          form && ['empty-submit', 'spaces-submit', 'valid-submit', 'resubmit'].includes(action.id);
        const invalid = submitted && name.trim().length === 0;
        const expectations: JavaScriptCheckpointExpectation[] = [
          { id: 'input', kind: 'input-value', selector: '#name', equals: name },
          { id: 'length', kind: 'selector-text', selector: '#length', equals: String(name.length) },
          ...(form
            ? [
                {
                  id: 'message',
                  kind: 'selector-text' as const,
                  selector: '#message',
                  equals: submitted
                    ? invalid
                      ? '名前を入力してください'
                      : '送信を受け付けました'
                    : '入力中',
                },
                {
                  id: 'invalid',
                  kind: 'attribute' as const,
                  selector: '#name',
                  name: 'aria-invalid',
                  equals: String(invalid),
                },
              ]
            : [
                {
                  id: 'summary',
                  kind: 'selector-text' as const,
                  selector: '#name-summary',
                  equals: name.trim(),
                },
              ]),
          ...(submitted ? [{ id: 'canceled', kind: 'submit-prevented' as const }] : []),
        ];
        return { id: `after-${action.id}`, afterActionId: action.id, expectations };
      }),
    },
  ];
}

/** 表示ラベルを除いた全操作・全期待値を要求し、課題の省略や別目標への差替えを拒否する。 */
export function acceptsReactFormScenarios(
  goal: string | undefined,
  scenarios: readonly JavaScriptInteractionScenario[] | undefined,
): boolean {
  if (!['controlled-form', 'shared-state'].includes(goal ?? '') || !Array.isArray(scenarios))
    return false;
  const fields = (item: object): unknown[] =>
    Object.entries(item).sort(([left], [right]) => left.localeCompare(right));
  const project = (items: readonly JavaScriptInteractionScenario[]): string =>
    JSON.stringify(
      items.map((scenario) => [
        scenario.id,
        scenario.actions.map(fields),
        scenario.checkpoints.map((checkpoint) => [
          checkpoint.id,
          checkpoint.afterActionId,
          checkpoint.expectations.map(fields),
        ]),
      ]),
    );
  try {
    return project(scenarios) === project(reactFormScenarios(goal));
  } catch {
    return false;
  }
}
