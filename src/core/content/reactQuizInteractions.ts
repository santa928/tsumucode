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
const input = (): JavaScriptCheckpointExpectation => ({
  id: 'name',
  kind: 'input-value',
  selector: '#name',
  equals: 'Ada',
});

/** 工程1は未完の得点処理に依存せず、実Callbackで選択肢が親へ届くことを要求する。 */
export function reactQuizScenarios(goal: string | undefined): JavaScriptInteractionScenario[] {
  if (goal === 'quiz-card')
    return [
      {
        id: 'quiz-card-callback',
        label: '一覧の選択肢を親へ渡す',
        actions: [
          { id: 'initial', kind: 'focus', selector: '#name' },
          { id: 'name', kind: 'fill', selector: '#name', value: 'Ada' },
          { id: 'selected', kind: 'click', selector: '#CSS' },
        ],
        checkpoints: [
          {
            id: 'initial',
            afterActionId: 'initial',
            expectations: [
              text('question', '#question', 'ページの骨組みを作る言語は？'),
              text('first', '#HTML', 'HTML'),
              text('second', '#CSS', 'CSS'),
            ],
          },
          { id: 'name', afterActionId: 'name', expectations: [input()] },
          {
            id: 'selected',
            afterActionId: 'selected',
            expectations: [input(), text('received', '#received', 'CSS')],
          },
        ],
      },
    ];
  if (goal !== 'quiz-state' && goal !== 'quiz-capstone') return [];
  const practice = goal === 'quiz-capstone';
  const first = practice ? '1 + 1 の結果は？' : 'ページの骨組みを作る言語は？';
  const second = practice ? '3 > 5 の結果は？' : '見た目を整える言語は？';
  const right = practice ? '2' : 'HTML';
  const wrong = practice ? 'true' : 'JavaScript';
  const correctSecond = 'false';
  const actions: JavaScriptInteractionAction[] = [
    { id: 'name', kind: 'fill', selector: '#name', value: 'Ada' },
    { id: 'early-next', kind: 'click', selector: '#next' },
    { id: 'correct', kind: 'click', selector: `[id="${right}"]` },
    { id: 'next', kind: 'click', selector: '#next' },
    { id: 'wrong', kind: 'click', selector: `[id="${wrong}"]` },
    ...(practice
      ? [
          { id: 'second-correct', kind: 'click' as const, selector: `[id="${correctSecond}"]` },
          { id: 'duplicate', kind: 'click' as const, selector: `[id="${correctSecond}"]` },
        ]
      : []),
    { id: 'result', kind: 'click', selector: '#next' },
    { id: 'retry', kind: 'click', selector: '#retry' },
  ];
  if (!practice) actions.splice(3, 0, { id: 'duplicate', kind: 'click', selector: '#HTML' });
  const received: Readonly<Record<string, string>> = {
    correct: right,
    duplicate: practice ? correctSecond : right,
    wrong,
    'second-correct': correctSecond,
  };
  const scenario: JavaScriptInteractionScenario = {
    id: practice ? 'quiz-practice-flow' : 'quiz-guided-flow',
    label: practice
      ? '累積得点を保って同問へ再回答し、再挑戦する'
      : '混合回答と重複拒否、結果と再挑戦',
    actions,
    checkpoints: actions.map((action) => {
      const id = action.id;
      const finished = id === 'result';
      const score =
        id === 'name' || id === 'early-next' || id === 'retry'
          ? '0'
          : practice && ['second-correct', 'duplicate', 'result'].includes(id)
            ? '2'
            : '1';
      return {
        id,
        afterActionId: id,
        expectations: [
          input(),
          text('score', '#score', score),
          finished
            ? text('result', '#result', '全問終了')
            : text(
                'question',
                '#question',
                ['next', 'wrong', 'second-correct'].includes(id) || (practice && id === 'duplicate')
                  ? second
                  : first,
              ),
          ...(received[id] ? [text('received', '#received', received[id])] : []),
          ...(practice && id === 'wrong'
            ? [
                {
                  id: 'retry-choice',
                  kind: 'selector-exists' as const,
                  selector: '[id="false"]:enabled',
                },
              ]
            : []),
        ],
      };
    }),
  };
  return practice
    ? [
        scenario,
        {
          id: 'quiz-practice-wrong-next',
          label: '誤答では次問へ進まず同じ問題を続ける',
          actions: [
            { id: 'wrong', kind: 'click', selector: '[id="3"]' },
            { id: 'next', kind: 'click', selector: '#next' },
          ],
          checkpoints: ['wrong', 'next'].map((id) => ({
            id,
            afterActionId: id,
            expectations: [text('question', '#question', first), text('score', '#score', '0')],
          })),
        },
      ]
    : [scenario];
}

/** 全操作と全期待値を一致させ、誤答後の累積得点やCallback検査の省略を拒否する。 */
export function acceptsReactQuizScenarios(
  goal: string | undefined,
  scenarios: readonly JavaScriptInteractionScenario[] | undefined,
): boolean {
  if (
    !['quiz-card', 'quiz-state', 'quiz-capstone'].includes(goal ?? '') ||
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
    return project(scenarios) === project(reactQuizScenarios(goal));
  } catch {
    return false;
  }
}
