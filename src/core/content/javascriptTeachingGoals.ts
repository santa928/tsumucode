/** 指定演習のproducer→sink接続だけを検証する閉じたGoal。未指定演習へ推測で適用しない。 */
export const JAVASCRIPT_TEACHING_GOALS = [
  'console-primitives',
  'question-binding',
  'score-update',
  'answer-branch',
  'answer-chain',
  'question-loop',
  'question-function',
  'label-scope',
  'score-closure',
  'score-closure-three',
  'score-closure-instances',
  'questions-array',
  'questions-access',
  'questions-for-of',
  'quiz-properties',
  'quiz-destructuring',
  'question-map',
  'html-filter',
  'points-reduce',
  'answered-map',
  'caught-error',
  'promise-then',
  'promise-await',
  'promise-catch',
] as const;

export type JavaScriptTeachingGoal = (typeof JAVASCRIPT_TEACHING_GOALS)[number];

/** Worker/runtime境界では未知Goalや自由な解析命令を受理しない。 */
export function isJavaScriptTeachingGoal(value: unknown): value is JavaScriptTeachingGoal {
  return typeof value === 'string' && JAVASCRIPT_TEACHING_GOALS.some((goal) => goal === value);
}
