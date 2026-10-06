/** 既存クイズを型安全化する3工程だけの、Projectと実操作の固定契約。 */
import type {
  JavaScriptInteractionScenario,
  JavaScriptCheckpointExpectation,
  JavaScriptInteractionAction,
} from './types';

export const TypeScriptQuizProjectContracts = [
  { lessonId: 'typescript-ch06-l01', profile: 'quiz-data-v1' },
  { lessonId: 'typescript-ch06-l02', profile: 'quiz-state-v1' },
  { lessonId: 'typescript-ch06-l03', profile: 'quiz-boundary-v1' },
] as const;
export type TypeScriptQuizProjectProfile =
  (typeof TypeScriptQuizProjectContracts)[number]['profile'];

interface Observation {
  readonly action:
    | Omit<Extract<JavaScriptInteractionAction, { kind: 'click' }>, 'id'>
    | Omit<Extract<JavaScriptInteractionAction, { kind: 'select' }>, 'id'>
    | Omit<Extract<JavaScriptInteractionAction, { kind: 'key' }>, 'id'>;
  readonly expected: readonly JavaScriptCheckpointExpectation[];
}

function value(selector: string, equals: string): JavaScriptCheckpointExpectation {
  return { id: selector.slice(1), kind: 'selector-text', selector, equals };
}

function focus(selector: string): JavaScriptCheckpointExpectation {
  return { id: 'focus', kind: 'focused', selector };
}

function click(
  selector: string,
  ...expected: readonly JavaScriptCheckpointExpectation[]
): Observation {
  return { action: { kind: 'click', selector }, expected };
}

function key(
  selector: string,
  ...expected: readonly JavaScriptCheckpointExpectation[]
): Observation {
  return { action: { kind: 'key', selector, key: 'Enter' }, expected };
}

function scenario(id: string, rows: readonly Observation[]): JavaScriptInteractionScenario {
  return {
    id,
    label:
      (
        {
          'model-web': 'Webの問題データ',
          'model-logic': 'Logicの問題データ',
          'quiz-web': '混合回答と再挑戦',
          'quiz-logic': 'カテゴリとキーボード',
          'quiz-invalid': '不正データから復帰',
          'quiz-recovery': '拒否から順序が変わる復帰',
        } as Record<string, string>
      )[id] ?? id,
    actions: rows.map(({ action }, index) => ({ id: `a${String(index + 1)}`, ...action })),
    checkpoints: rows.map(({ expected }, index) => ({
      id: `c${String(index + 1)}`,
      afterActionId: `a${String(index + 1)}`,
      expectations: [...expected],
    })),
  };
}

const WEB_FIRST = 'Webページの骨組みを作るのは？';
const WEB_SECOND = '見た目を整えるのは？';
const WEB_SHOW = [
  value('#question', WEB_FIRST),
  value('#choice-0', 'HTML'),
  value('#choice-1', 'CSS'),
  value('#progress', '問題1 / 2'),
  value('#score-value', '0'),
  focus('#choice-0'),
];
const LOGIC_SHOW = [
  value('#question', '1 + 1 は？'),
  value('#choice-0', '2'),
  value('#choice-1', '3'),
  value('#progress', '問題1 / 2'),
  value('#score-value', '0'),
  focus('#choice-0'),
];
const LOGIC_SELECT: Observation = {
  action: { kind: 'select', selector: '#category', value: 'logic' },
  expected: [value('#status', '開始すると問題が出ます')],
};

/** 型だけで誤った問題・回答・得点・再挑戦が合格しない実操作を組み立てる。 */
export function createTypeScriptQuizProjectScenarios(
  profile: TypeScriptQuizProjectProfile,
): JavaScriptInteractionScenario[] {
  if (profile === 'quiz-data-v1')
    return [
      scenario('model-web', [click('#start', ...WEB_SHOW)]),
      scenario('model-logic', [LOGIC_SELECT, click('#start', ...LOGIC_SHOW)]),
    ];
  const web = scenario('quiz-web', [
    click('#start', ...WEB_SHOW),
    click('#choice-0', value('#score-value', '1'), value('#feedback', '正解です'), focus('#next')),
    click(
      '#next',
      value('#question', WEB_SECOND),
      value('#choice-0', 'JavaScript'),
      value('#choice-1', 'CSS'),
      value('#progress', '問題2 / 2'),
      focus('#choice-0'),
    ),
    click(
      '#choice-0',
      value('#score-value', '1'),
      value('#feedback', '正解は CSS です'),
      focus('#next'),
    ),
    click('#next', value('#result', '2問中1問正解'), focus('#restart')),
    click('#restart', ...WEB_SHOW, value('#feedback', '')),
    click('#choice-0', value('#score-value', '1'), focus('#next')),
    click('#next', value('#question', WEB_SECOND), focus('#choice-0')),
    click('#choice-1', value('#score-value', '2'), focus('#next')),
    click('#next', value('#result', '2問中2問正解'), focus('#restart')),
  ]);
  const logic = scenario('quiz-logic', [
    LOGIC_SELECT,
    click('#start', ...LOGIC_SHOW),
    key('#choice-0', value('#score-value', '1'), value('#feedback', '正解です'), focus('#next')),
    key(
      '#next',
      value('#question', '3 > 5 の結果は？'),
      value('#choice-0', 'true'),
      value('#choice-1', 'false'),
      value('#progress', '問題2 / 2'),
      focus('#choice-0'),
    ),
    key('#choice-1', value('#score-value', '2'), value('#feedback', '正解です'), focus('#next')),
    key('#next', value('#result', '2問中2問正解'), focus('#restart')),
    key('#restart', ...LOGIC_SHOW, {
      id: 'category',
      kind: 'selector-text',
      selector: '#category option:checked',
      equals: '値と条件',
    }),
  ]);
  if (profile === 'quiz-state-v1') return [web, logic];
  return [
    web,
    logic,
    scenario('quiz-invalid', [
      click('#invalid-load', value('#status', '不正なデータです。開始でやり直せます')),
      click('#start', ...WEB_SHOW),
    ]),
    scenario('quiz-recovery', [
      click('#fail-load', value('#status', '読み込めませんでした。開始でやり直せます')),
      click(
        '#start',
        value('#question', WEB_SECOND),
        value('#choice-0', 'JavaScript'),
        value('#choice-1', 'CSS'),
        value('#score-value', '0'),
        focus('#choice-0'),
      ),
      click('#choice-1', value('#score-value', '1'), value('#feedback', '正解です')),
      click(
        '#next',
        value('#question', WEB_FIRST),
        value('#choice-0', 'HTML'),
        value('#choice-1', 'CSS'),
        value('#progress', '問題2 / 2'),
      ),
      click('#choice-0', value('#score-value', '2')),
      click('#next', value('#result', '2問中2問正解')),
    ]),
  ].map((item) => ({ ...item, id: `boundary-${item.id}` }));
}

/** 期待する有限構造だけを走査する。順序差はobjectで許容し、操作配列では保持する。 */
function same(actual: unknown, expected: unknown): boolean {
  if (Array.isArray(expected))
    return (
      Array.isArray(actual) &&
      actual.length === expected.length &&
      expected.every((value, index) => same(actual[index], value))
    );
  if (expected !== null && typeof expected === 'object') {
    if (actual === null || typeof actual !== 'object' || Array.isArray(actual)) return false;
    const wanted = expected as Record<string, unknown>;
    const received = actual as Record<string, unknown>;
    return (
      Object.keys(received).length === Object.keys(wanted).length &&
      Object.entries(wanted).every(
        ([key, value]) => Object.hasOwn(received, key) && same(received[key], value),
      )
    );
  }
  return actual === expected;
}

/** 固定ProjectのRuntimeを、省略・余分な設定を許さず照合する。 */
export function acceptsTypeScriptQuizProjectRuntime(input: unknown): boolean {
  return same(input, {
    kind: 'typescript',
    entryFile: 'main.ts',
    sourceType: 'module',
    capabilityProfile: 'project',
    primaryOutput: 'preview',
  });
}

/** 操作・カテゴリ・正誤・得点・復帰の省略や期待値変更を拒否する。 */
export function acceptsTypeScriptQuizProjectScenarios(
  profile: TypeScriptQuizProjectProfile,
  input: unknown,
): boolean {
  return same(input, createTypeScriptQuizProjectScenarios(profile));
}
