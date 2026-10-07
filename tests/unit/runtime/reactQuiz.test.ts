import { reactSourceHash } from '../../../src/adapters/runtime/react/reactSourceHash';
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { analyzeQuizCard } from '../../../src/adapters/runtime/react/checkQuizCard';
import { analyzeQuizState } from '../../../src/adapters/runtime/react/checkQuizState';
import {
  isQuizWorkspace,
  QUIZ_DATA,
  QUIZ_HTML,
  QUIZ_MAIN,
  QUIZ_TYPES,
} from '../../../src/adapters/runtime/react/quizScaffold';
import {
  isReactCompileInput,
  isReactCompileResult,
} from '../../../src/adapters/runtime/react/compilerContract';
import {
  ReactExerciseRuntimeSchema,
  ReactLearningRuleDefinitionSchema,
} from '../../../src/core/content/schema';
import {
  acceptsReactQuizScenarios,
  reactQuizScenarios,
} from '../../../src/core/content/reactQuizInteractions';

const card = `import type { QuestionCardProps } from './types';
export function QuestionCard({ question, answered, onAnswer }: QuestionCardProps) {
  return (
    <section>
      <h2 id="question">{question.text}</h2>
      {question.choices.map(choice => (
        <button key={choice} id={choice} type="button" disabled={answered} onClick={() => onAnswer(choice)}>
          {choice}
        </button>
      ))}
    </section>
  );
}
`;
const state = `import type { QuizState, Question } from './types';
export function createState(): QuizState {
  return { index: 0, score: 0, answered: false };
}
export function answer(state: QuizState, question: Question, choice: string): QuizState {
  if (state.answered) return state;
  return {
    ...state,
    score: state.score + (choice === question.correctId ? 1 : 0),
    answered: true,
  };
}
export function advance(state: QuizState): QuizState {
  if (!state.answered) return state;
  return { ...state, index: state.index + 1, answered: false };
}
`;
const workspace = {
  'QuestionCard.tsx': card,
  'quizState.ts': state,
  'main.tsx': QUIZ_MAIN,
  'data.ts': QUIZ_DATA,
  'types.ts': QUIZ_TYPES,
  'index.html': QUIZ_HTML,
};

describe('クイズの表示と純粋Stateの有限な由来', () => {
  it('2つのBrief、型alias、括弧とblock callbackを元Sourceから検査する', () => {
    for (const source of [
      card,
      card
        .replace('QuestionCardProps }', 'QuestionCardProps as Props }')
        .replace(': QuestionCardProps', ': Props'),
      card.replace('() => onAnswer(choice)', '() => { onAnswer(choice); }'),
    ]) {
      const result = analyzeQuizCard(source);
      expect(result.diagnostics).toEqual([]);
      expect(Object.values(result.facts).every(Boolean)).toBe(true);
    }
    for (const practice of [false, true]) {
      const source = practice
        ? state.replace('answered: true,', 'answered: choice === question.correctId,')
        : state;
      const result = analyzeQuizState(source, practice);
      expect(result.diagnostics).toEqual([]);
      expect(Object.values(result.facts).every(Boolean)).toBe(true);
      const alternative = source
        .replace(
          '  return {\n    ...state,',
          '  const correct = choice === question.correctId;\n  return {\n    ...state,',
        )
        .replaceAll('choice === question.correctId ? 1 : 0', 'correct ? 1 : 0')
        .replace('answered: choice === question.correctId,', 'answered: correct,');
      expect(analyzeQuizState(alternative, practice).diagnostics).toEqual([]);
      expect(Object.values(analyzeQuizState(alternative, practice).facts).every(Boolean)).toBe(
        true,
      );
    }
  });
  it.each([
    [
      'index Key',
      card.replace('map(choice', 'map((choice, index)').replace('key={choice}', 'key={index}'),
      'usesStableChoiceKeys',
    ],
    ['別の選択肢', card.replace('onAnswer(choice)', "onAnswer('HTML')"), 'forwardsSelectedChoice'],
    [
      '常に操作不可',
      card.replace('disabled={answered}', 'disabled={true}'),
      'forwardsSelectedChoice',
    ],
    ['固定選択肢', card.replace('{choice}\n', "{'固定'}\n"), 'rendersQuestion'],
    ['固定本文', card.replace('{question.text}', "{'固定の問題'}"), 'rendersQuestion'],
  ] as const)('%sは型だけで合格にせずFalse Factを返す', (_label, source, fact) => {
    const result = analyzeQuizCard(source);
    expect(result.diagnostics).toEqual([]);
    expect(result.facts[fact]).toBe(false);
  });
  it.each([
    card.replace('id={choice}', 'id="received"'),
    card.replace('() => onAnswer(choice)', '() => fetch("/hidden")'),
    card.replace('map(choice', 'map(question'),
    card.replace('<section>', '<section onClick={() => onAnswer("HTML")}>'),
    card.replace('question.text', '(question as any).text'),
    card.replace('return (', 'const hidden = document.body; return ('),
  ])('予約観測・能力・shadowingを到達性によらず拒否する', (source) => {
    expect(analyzeQuizCard(source).diagnostics.length).toBeGreaterThan(0);
  });
  it.each([
    [
      '固定得点',
      state.replace('state.score + (choice === question.correctId ? 1 : 0)', '0'),
      'scoresActualAnswer',
    ],
    [
      '重複guardなし',
      state.replace('  if (state.answered) return state;\n', ''),
      'guardsRepeatedAnswer',
    ],
    [
      '未回答でも次問',
      state.replace('  if (!state.answered) return state;\n', ''),
      'advancesAnsweredQuestion',
    ],
    ['初期得点1', state.replace('score: 0,', 'score: 1,'), 'createsInitialState'],
  ] as const)('%sを別の学習Factで検出する', (_label, source, fact) => {
    const result = analyzeQuizState(source, false);
    expect(result.diagnostics).toEqual([]);
    expect(result.facts[fact]).toBe(false);
  });
  it('Guidedの完成answerは再回答Briefに合格せず、誤答でも元の累積得点を要求する', () => {
    expect(analyzeQuizState(state, true).facts.scoresActualAnswer).toBe(false);
    const practice = state.replace('answered: true,', 'answered: choice === question.correctId,');
    expect(
      analyzeQuizState(
        practice.replace(
          'state.score + (choice === question.correctId ? 1 : 0)',
          'choice === question.correctId ? state.score + 1 : 0',
        ),
        true,
      ).facts.scoresActualAnswer,
    ).toBe(false);
  });
  it.each([
    state.replace(
      'return {\n    ...state,',
      'if (false) { fetch("/hidden"); }\n  return {\n    ...state,',
    ),
    state.replace('if (state.answered)', 'if (question.correctId === "HTML")'),
    state.replace('return state;', 'state.score = 0; return state;'),
    state.replace('...state,', '...question,'),
    state + '\nconst hidden = 1;\n',
    '// @ts-ignore\n' + state,
  ])('純粋関数の外へ能力・変異・別データ・抑制指示を広げない', (source) => {
    expect(analyzeQuizState(source, false).diagnostics.length).toBeGreaterThan(0);
  });
});

describe('クイズのCompiler・Workspace・Scenario契約', () => {
  it('2Fileの編集を許し、固定親/HTML/データ/型とFile集合を保護する', () => {
    expect(isQuizWorkspace(workspace, 'quiz-workshop-v1')).toBe(true);
    expect(
      isQuizWorkspace(
        { ...workspace, 'quizState.ts': state.replace('score: 0', 'score: 1') },
        'quiz-workshop-v1',
      ),
    ).toBe(true);
    for (const file of ['main.tsx', 'data.ts', 'types.ts', 'index.html']) {
      expect(
        isQuizWorkspace(
          { ...workspace, [file]: workspace[file as keyof typeof workspace] + '\n// 偽造' },
          'quiz-workshop-v1',
        ),
      ).toBe(false);
    }
    expect(
      isQuizWorkspace({ ...workspace, 'extra.ts': 'export const extra = 1;' }, 'quiz-workshop-v1'),
    ).toBe(false);
    expect(isQuizWorkspace(workspace, 'quiz-capstone-v1')).toBe(false);
  });
  it('固定8Factの型と集合をstrictに扱う', () => {
    const { 'index.html': html, ...files } = workspace;
    expect(html).toBe(QUIZ_HTML);
    const input = { sessionId: 'quiz', revision: 1, profile: 'quiz-workshop-v1' as const, files };
    const facts = { ...analyzeQuizCard(card).facts, ...analyzeQuizState(state, false).facts };
    const compiledFiles = Object.fromEntries(
      Object.keys(files).map((file) => [file.replace(/\.tsx?$/u, '.js'), 'export {};']),
    );
    const result = {
      status: 'ready',
      files: compiledFiles,
      sourceMaps: Object.fromEntries(Object.keys(compiledFiles).map((file) => [file, 'map'])),
      facts,
    };
    expect(isReactCompileInput(input)).toBe(true);
    expect(isReactCompileResult(result, input)).toBe(true);
    expect(isReactCompileResult({ ...result, facts: { ...facts, hidden: true } }, input)).toBe(
      false,
    );
    expect(
      isReactCompileResult({ ...result, facts: { ...facts, scoresActualAnswer: 1 } }, input),
    ).toBe(false);
  });
  it('全Scenarioの操作・期待値・Briefを省略できない', () => {
    for (const goal of ['quiz-card', 'quiz-state', 'quiz-capstone']) {
      const scenarios = reactQuizScenarios(goal);
      expect(acceptsReactQuizScenarios(goal, scenarios)).toBe(true);
      expect(
        acceptsReactQuizScenarios(
          goal,
          scenarios.map((scenario) => ({ ...scenario, actions: scenario.actions.slice(1) })),
        ),
      ).toBe(false);
      expect(
        acceptsReactQuizScenarios(
          goal,
          scenarios.map((scenario) => ({
            ...scenario,
            checkpoints: scenario.checkpoints.map((checkpoint) => ({
              ...checkpoint,
              expectations: checkpoint.expectations.slice(1),
            })),
          })),
        ),
      ).toBe(false);
      expect(acceptsReactQuizScenarios(goal, undefined)).toBe(false);
    }
    expect(acceptsReactQuizScenarios('quiz-capstone', reactQuizScenarios('quiz-state'))).toBe(
      false,
    );
  });
  it('profileと学習目標を別課題へ混ぜない', () => {
    const runtime = {
      kind: 'react',
      entryFile: 'main.tsx',
      sourceType: 'module',
      capabilityProfile: 'dom',
      primaryOutput: 'preview',
      profile: 'quiz-workshop-v1',
      learningGoal: 'quiz-card',
    };
    expect(ReactExerciseRuntimeSchema.safeParse(runtime).success).toBe(true);
    expect(
      ReactExerciseRuntimeSchema.safeParse({ ...runtime, learningGoal: 'quiz-capstone' }).success,
    ).toBe(false);
    expect(
      ReactExerciseRuntimeSchema.safeParse({ ...runtime, profile: 'quiz-capstone-v1' }).success,
    ).toBe(false);
    expect(
      ReactLearningRuleDefinitionSchema.safeParse({
        id: 'quiz-rule',
        label: '選択肢',
        required: true,
        group: 'all',
        viewportMode: 'all',
        viewportIds: ['desktop-1280'],
        target: { kind: 'react-learning', file: 'QuestionCard.tsx' },
        assertion: { kind: 'react-learning', goal: 'quiz-card' },
        feedback: { target: '選択肢', expected: '同じ選択肢', nextAction: 'Propsからつなぐ' },
        hintId: 'quiz-hint',
        relatedSlideId: 'quiz-slide',
      }).success,
    ).toBe(true);
  });
});

it('共有クイズは学習目標だけを個別判定し、全元File/profile/session/revisionは実行証拠へ結ぶ', async () => {
  const runtime = {
    kind: 'react',
    entryFile: 'main.tsx',
    sourceType: 'module',
    capabilityProfile: 'dom',
    primaryOutput: 'preview',
    profile: 'quiz-workshop-v1',
    learningGoal: 'quiz-card',
  } as const;
  const hash = await reactSourceHash(workspace, runtime, 'session', 1);
  expect(
    await reactSourceHash(workspace, { ...runtime, learningGoal: 'quiz-state' }, 'session', 1),
  ).toBe(hash);
  expect(await reactSourceHash(workspace, runtime, 'session', 2)).not.toBe(hash);
  expect(await reactSourceHash(workspace, runtime, 'other', 1)).not.toBe(hash);
  expect(
    await reactSourceHash(
      { ...workspace, 'quizState.ts': state + '\n// 別Source' },
      runtime,
      'session',
      1,
    ),
  ).not.toBe(hash);
  expect(
    await reactSourceHash(
      workspace,
      { ...runtime, profile: 'quiz-capstone-v1', learningGoal: 'quiz-capstone' },
      'session',
      1,
    ),
  ).not.toBe(hash);
  const old = { ...runtime, profile: 'static-components-v1', learningGoal: 'reuse' } as const;
  expect(
    await reactSourceHash(workspace, { ...old, learningGoal: 'composition' }, 'session', 1),
  ).not.toBe(await reactSourceHash(workspace, old, 'session', 1));
});
