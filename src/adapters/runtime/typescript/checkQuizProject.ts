/** Projectの原文確認と非emit型probeだけを実行し、Runner用JSやASTを返さない。 */
import ts from 'typescript';
import type { TypeScriptQuizProjectProfile } from '../../../core/content/typeScriptQuizProjectContract';
import { checkTypeScript } from './compileTypeScript';
import { inspectQuizProject, type QuizProjectInspection } from './inspectQuizProject';

export interface QuizProjectFacts extends QuizProjectInspection {
  readonly forbiddenEscapeAbsent: boolean;
  readonly positiveProbeAccepted: boolean;
  readonly negativeProbesRejected: boolean;
}
export type QuizProjectResult =
  | {
      readonly status: 'ready';
      readonly profile: TypeScriptQuizProjectProfile;
      readonly facts: QuizProjectFacts;
    }
  | { readonly status: 'system-error' };

const PREFIX = '__tsumucode_quiz_';
const MAX_SOURCE_UNITS = 8_192;
const MAX_NODES = 2_048;
const MAX_DEPTH = 64;

/** 原文を複写し、probeの診断だけを固定行とcodeで照合する。 */
export function checkQuizProject(
  files: Readonly<Record<string, string>>,
  libraries: Readonly<Record<string, string>>,
  profile: TypeScriptQuizProjectProfile,
): QuizProjectResult {
  const original = files['main.ts'];
  if (
    typeof original !== 'string' ||
    original.length > MAX_SOURCE_UNITS ||
    !Object.hasOwn(libraries, 'lib.es2023.full.d.ts')
  )
    return { status: 'system-error' };
  const source = ts.createSourceFile(
    'main.ts',
    original,
    ts.ScriptTarget.ES2023,
    true,
    ts.ScriptKind.TS,
  );
  const budget = { nodes: 0, exceeded: false };
  let forbiddenEscapeAbsent =
    !original.includes(PREFIX) && !/@ts-(?:ignore|expect-error|nocheck|check)\b/u.test(original);
  function visit(node: ts.Node, depth: number): void {
    budget.nodes += 1;
    if (budget.nodes > MAX_NODES || depth > MAX_DEPTH) {
      budget.exceeded = true;
      return;
    }
    if (
      node.kind === ts.SyntaxKind.AnyKeyword ||
      ts.isAsExpression(node) ||
      ts.isTypeAssertionExpression(node) ||
      ts.isNonNullExpression(node)
    )
      forbiddenEscapeAbsent = false;
    ts.forEachChild(node, (child) => {
      if (!budget.exceeded) visit(child, depth + 1);
    });
  }
  visit(source, 0);
  if (budget.exceeded) return { status: 'system-error' };
  const inspected = inspectQuizProject(source, profile);
  let positiveProbeAccepted = false;
  let negativeProbesRejected = false;
  if (
    forbiddenEscapeAbsent &&
    inspected.programShapeAccepted &&
    inspected.typeContractAccepted &&
    inspected.usesLearningValues
  ) {
    const positive = [
      `const ${PREFIX}question: Question = { category: 'web', text: '別の問題', choices: ['a', 'b'], correct: 'b' };`,
      `const ${PREFIX}state: QuizState = answer(createState(), ${PREFIX}question, 'b');`,
      `const ${PREFIX}next: QuizState = advance(${PREFIX}state);`,
      `const ${PREFIX}decoded: Question | undefined = decodeQuestion(null);`,
      `const ${PREFIX}loaded: Promise<LoadResult> = readQuestions('success');`,
      `const ${PREFIX}button: HTMLButtonElement | undefined = readButton(new Event('click'));`,
    ].join('\n');
    const positiveSource = `${original}\n${positive}\n`;
    positiveProbeAccepted =
      checkTypeScript({ ...files, 'main.ts': positiveSource }, libraries).status === 'valid';
    if (positiveProbeAccepted) {
      const negative = [
        `readQuestions('other');`,
        `answer(createState(), ${PREFIX}question, 2);`,
        `${PREFIX}state.score = 2;`,
      ];
      const result = checkTypeScript(
        { ...files, 'main.ts': `${positiveSource}${negative.join('\n')}\n` },
        libraries,
      );
      const start = positiveSource.split('\n').length;
      const codes = [2345, 2345, 2540];
      negativeProbesRejected =
        result.status === 'type-error' &&
        result.diagnostics.length === negative.length &&
        codes.every((code, index) =>
          result.diagnostics.some(
            (diagnostic) =>
              diagnostic.file === 'main.ts' &&
              diagnostic.line === start + index &&
              diagnostic.code === code,
          ),
        );
    }
  }
  return {
    status: 'ready',
    profile,
    facts: { ...inspected, forbiddenEscapeAbsent, positiveProbeAccepted, negativeProbesRejected },
  };
}
