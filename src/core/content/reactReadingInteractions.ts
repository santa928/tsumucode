import type { JavaScriptInteractionScenario, ValidationRuleDefinition } from './types';

const books = [
  { id: 'stars', title: '星の地図' },
  { id: 'rain', title: '雨の日の本' },
  { id: 'forest', title: '森の記録' },
] as const;

function bookListText(
  visible: readonly (typeof books)[number][],
  state: readonly boolean[],
  separator: string,
): string {
  return visible
    .flatMap((book) =>
      state[books.indexOf(book)]
        ? [book.title, '既読', '未読にする']
        : [book.title, '未読', '読了にする'],
    )
    .join(separator);
}

/** 正負Fixtureと採点で共有する、個別更新・再操作・0件・resetの実DOM仕様。 */
export function reactReadingScenarios(
  goal: string | undefined,
  optionalSpaces = true,
): JavaScriptInteractionScenario[] {
  if (!['reading-card', 'reading-state', 'reading-filter'].includes(goal ?? '')) return [];
  const filtering = goal === 'reading-filter';
  const operations: readonly [string, string, readonly boolean[], string][] = filtering
    ? [
        ['unread', '#filter-unread', [false, true, false], 'unread'],
        ['finish-stars', '#toggle-stars', [true, true, false], 'unread'],
        ['finish-forest', '#toggle-forest', [true, true, true], 'unread'],
        ['read', '#filter-read', [true, true, true], 'read'],
        ['reopen-rain', '#toggle-rain', [true, false, true], 'read'],
        ['all', '#filter-all', [true, false, true], 'all'],
        ['select-before-reset', '#filter-read', [true, false, true], 'read'],
        ['reset', '#reset', [false, true, false], 'all'],
        ['read-again', '#filter-read', [false, true, false], 'read'],
        ['reopen-last', '#toggle-rain', [false, false, false], 'read'],
        ['all-again', '#filter-all', [false, false, false], 'all'],
      ]
    : [
        ['finish-stars', '#toggle-stars', [true, true, false], 'all'],
        ['reopen-stars', '#toggle-stars', [false, true, false], 'all'],
        ['reopen-rain', '#toggle-rain', [false, false, false], 'all'],
        ['finish-forest', '#toggle-forest', [false, false, true], 'all'],
        ['reset', '#reset', [false, true, false], 'all'],
        ['finish-forest-again', '#toggle-forest', [false, true, true], 'all'],
        ['reset-again', '#reset', [false, true, false], 'all'],
      ];
  // Scenarioごとに再描画されるため、後半でもResetしてから同じ表示で再操作する。
  // 操作数上限を保ち、元の全11操作とチェックポイントを残す。
  const groups = filtering
    ? [
        operations.slice(0, 8),
        [
          ['select-before-repeat', '#filter-read', [false, true, false], 'read'] as const,
          ['reset-before-repeat', '#reset', [false, true, false], 'all'] as const,
          ...operations.slice(8),
        ],
      ]
    : [operations];
  return groups.map((group, index) => ({
    id: filtering
      ? index === 0
        ? 'reading-filtering'
        : 'reading-empty-read'
      : String(goal) + '-toggles',
    label: filtering ? '表示条件と読書状態から件数を導く' : '親の読書状態を個別に変更して戻す',
    actions: group.map(([id, selector]) => ({ id, kind: 'click', selector })),
    checkpoints: group.map(([id, , state, filter]) => {
      const visible = books.filter((_, index) =>
        filter === 'unread' ? !state[index] : filter === 'read' ? state[index] : true,
      );
      return {
        id: 'after-' + id,
        afterActionId: id,
        expectations: [
          {
            id: 'books',
            kind: 'selector-text',
            selector: '#books',
            ...(optionalSpaces ? { optionalSpaces: true as const } : {}),
            equals: bookListText(visible, state, optionalSpaces ? ' ' : ''),
          },
          ...visible.map((book) => ({
            id: 'state-' + book.id,
            kind: 'attribute' as const,
            selector: '#toggle-' + book.id,
            name: 'aria-pressed',
            equals: String(state[books.indexOf(book)]),
          })),
          ...(filtering
            ? [
                {
                  id: 'count',
                  kind: 'selector-text' as const,
                  selector: '#count',
                  equals: String(visible.length) + '件',
                },
                {
                  id: 'summary',
                  kind: 'selector-text' as const,
                  selector: '#summary',
                  equals: '既読' + String(state.filter(Boolean).length) + '件 / 全3件',
                },
                ...['all', 'unread', 'read'].map((option) => ({
                  id: 'filter-' + option,
                  kind: 'attribute' as const,
                  selector: '#filter-' + option,
                  name: 'aria-pressed',
                  equals: String(filter === option),
                })),
              ]
            : []),
        ],
      };
    }),
  }));
}

/** authoringと公開payloadの両方で、検査の一部削除や期待値の弱体化を拒否する。 */
export function acceptsReactReadingScenarios(
  goal: string | undefined,
  scenarios: readonly JavaScriptInteractionScenario[] | undefined,
  rules: readonly ValidationRuleDefinition[],
): boolean {
  const initialRules = rules.filter(
    (rule) => rule.target.kind === 'selector' && rule.target.selector === '#books',
  );
  const initial = initialRules[0];
  if (
    !scenarios ||
    initialRules.length !== 1 ||
    !initial?.required ||
    initial.group !== 'all' ||
    initial.assertion.kind !== 'text' ||
    initial.assertion.operator !== 'equals'
  )
    return false;
  // 旧教材は完全一致、新教材は指定した区切りだけ空白を許す。初期判定と全操作で同じ契約を要求する。
  const optionalSpaces = initial.assertion.optionalSpaces === true;
  if (
    initial.assertion.expected !==
    bookListText(books, [false, true, false], optionalSpaces ? ' ' : '')
  )
    return false;
  const expected = reactReadingScenarios(goal, optionalSpaces);
  if (expected.length === 0) return false;
  const project = (items: readonly JavaScriptInteractionScenario[]): string =>
    JSON.stringify(
      items.map((scenario) => [
        scenario.id,
        scenario.actions.map((action) => [action.id, action.kind, action.selector]),
        scenario.checkpoints.map((checkpoint) => [
          checkpoint.id,
          checkpoint.afterActionId,
          checkpoint.expectations.map((expectation) =>
            Object.entries(expectation).sort(([left], [right]) => left.localeCompare(right)),
          ),
        ]),
      ]),
    );
  return project(scenarios) === project(expected);
}
