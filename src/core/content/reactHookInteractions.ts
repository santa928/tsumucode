import type {
  JavaScriptCheckpointExpectation,
  JavaScriptInteractionAction,
  JavaScriptInteractionScenario,
} from './types';

const text = (id: string, selector: string, equals: string): JavaScriptCheckpointExpectation => ({
  id,
  kind: 'selector-text',
  selector,
  equals,
});

/** Refの実focusと、外部DOM購読の切替・cleanup・再mountを全checkpointで要求する。 */
export function reactHookScenarios(goal: string | undefined): JavaScriptInteractionScenario[] {
  if (goal === 'ref-focus') {
    const actions: JavaScriptInteractionAction[] = [
      { id: 'focus', kind: 'click', selector: '#focus' },
      { id: 'short-name', kind: 'fill', selector: '#name', value: 'Ada' },
      { id: 'long-name', kind: 'fill', selector: '#name', value: 'TypeScript' },
      { id: 'spaces', kind: 'fill', selector: '#name', value: '   ' },
      { id: 'clear', kind: 'fill', selector: '#name', value: '' },
      { id: 'refocus', kind: 'click', selector: '#focus' },
    ];
    const names = ['', 'Ada', 'TypeScript', '   ', '', ''];
    return [
      {
        id: 'ref-focus-input',
        label: 'Refで入力へ移り、表示値はStateから導く',
        actions,
        checkpoints: actions.map((action, index) => ({
          id: `after-${action.id}`,
          afterActionId: action.id,
          expectations: [
            { id: 'input', kind: 'input-value', selector: '#name', equals: names[index]! },
            text('summary', '#name-summary', names[index]!.trim()),
            text('length', '#length', String(names[index]!.length)),
            ...(action.kind === 'click'
              ? [{ id: 'focus', kind: 'focused' as const, selector: '#name' }]
              : []),
          ],
        })),
      },
    ];
  }
  if (goal === 'external-sync') {
    const actions: JavaScriptInteractionAction[] = [
      { id: 'initial', kind: 'focus', selector: '#source-a' },
      { id: 'first-a', kind: 'fill', selector: '#source-a', value: 'Aの通知' },
      { id: 'prepare-b', kind: 'fill', selector: '#source-b', value: 'Bの現在値' },
      { id: 'target-b', kind: 'click', selector: '#target-b' },
      { id: 'late-a', kind: 'fill', selector: '#source-a', value: '旧Aの通知' },
      { id: 'current-b', kind: 'fill', selector: '#source-b', value: 'Bの通知' },
      { id: 'unmount', kind: 'click', selector: '#toggle' },
      { id: 'hidden-b', kind: 'fill', selector: '#source-b', value: '非表示中の現在値' },
      { id: 'remount', kind: 'click', selector: '#toggle' },
    ];
    const values = [
      '初期A',
      'Aの通知',
      'Aの通知',
      'Bの現在値',
      'Bの現在値',
      'Bの通知',
      undefined,
      undefined,
      '非表示中の現在値',
    ];
    const notifications = ['0', '1', '1', '1', '1', '2', '2', '2', '2'];
    return [
      {
        id: 'effect-subscription-lifecycle',
        label: '対象の現在値を同期し、古い購読をcleanupする',
        actions,
        checkpoints: actions.map((action, index) => ({
          id: `after-${action.id}`,
          afterActionId: action.id,
          expectations: [
            text('active', '#active', index === 6 || index === 7 ? '0' : '1'),
            text('notifications', '#notifications', notifications[index]!),
            ...(values[index] === undefined
              ? []
              : [
                  text('value', '#observed', values[index]),
                  text('length', '#length', String(values[index].length)),
                ]),
          ],
        })),
      },
    ];
  }
  if (goal === 'source-hook') {
    const actions: JavaScriptInteractionAction[] = [
      { id: 'initial', kind: 'focus', selector: '#source-a' },
      { id: 'first-a', kind: 'fill', selector: '#source-a', value: 'Aだけ更新' },
      { id: 'unmount-a', kind: 'click', selector: '#toggle' },
      { id: 'hidden-a', kind: 'fill', selector: '#source-a', value: 'Aの非表示中の値' },
      { id: 'current-b', kind: 'fill', selector: '#source-b', value: 'Bだけ更新' },
      { id: 'remount-a', kind: 'click', selector: '#toggle' },
    ];
    const valuesA = ['初期A', 'Aだけ更新', undefined, undefined, undefined, 'Aの非表示中の値'];
    const valuesB = ['初期B', '初期B', '初期B', '初期B', 'Bだけ更新', 'Bだけ更新'];
    const notifications = ['0', '1', '1', '1', '2', '2'];
    return [
      {
        id: 'custom-hook-instance-lifecycle',
        label: '同じHookの処理を使い、各instanceの状態を独立させる',
        actions,
        checkpoints: actions.map((action, index) => ({
          id: `after-${action.id}`,
          afterActionId: action.id,
          expectations: [
            text('active', '#active', index > 1 && index < 5 ? '1' : '2'),
            text('notifications', '#notifications', notifications[index]!),
            text('value-b', '#observed-b', valuesB[index]!),
            text('length-b', '#length-b', String(valuesB[index]!.length)),
            ...(valuesA[index] === undefined
              ? []
              : [
                  text('value-a', '#observed-a', valuesA[index]),
                  text('length-a', '#length-a', String(valuesA[index].length)),
                ]),
          ],
        })),
      },
    ];
  }
  return [];
}

/** 全操作・全期待値を照合し、cleanupや切替直後の検査を省略した課題を拒否する。 */
export function acceptsReactHookScenarios(
  goal: string | undefined,
  scenarios: readonly JavaScriptInteractionScenario[] | undefined,
): boolean {
  if (
    !['ref-focus', 'external-sync', 'source-hook'].includes(goal ?? '') ||
    !Array.isArray(scenarios)
  )
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
    return project(scenarios) === project(reactHookScenarios(goal));
  } catch {
    return false;
  }
}
