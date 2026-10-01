/** ch01-l01/l02のscore導入専用。Worker内で有限grammarと非emit probeを共有する。 */
import ts from 'typescript';
import { checkTypeScript } from './compileTypeScript';

export interface ScoreNumberProgramFacts {
  readonly programShapeAccepted: boolean;
  readonly declarationTypeAccepted: boolean;
  readonly forbiddenEscapeAbsent: boolean;
  readonly logsScoreLast: boolean;
  readonly positiveProbeAccepted: boolean;
  readonly negativeProbeRejected: boolean;
}

export type ScoreNumberProgramResult =
  | { readonly status: 'ready'; readonly facts: ScoreNumberProgramFacts }
  | { readonly status: 'system-error' };

const EMPTY_FACTS: ScoreNumberProgramFacts = {
  programShapeAccepted: false,
  declarationTypeAccepted: false,
  forbiddenEscapeAbsent: true,
  logsScoreLast: false,
  positiveProbeAccepted: false,
  negativeProbeRejected: false,
};
const arithmetic = new Set([
  ts.SyntaxKind.PlusToken,
  ts.SyntaxKind.MinusToken,
  ts.SyntaxKind.AsteriskToken,
  ts.SyntaxKind.SlashToken,
  ts.SyntaxKind.PercentToken,
  ts.SyntaxKind.AsteriskAsteriskToken,
]);
const assignments = new Set([
  ts.SyntaxKind.EqualsToken,
  ts.SyntaxKind.PlusEqualsToken,
  ts.SyntaxKind.MinusEqualsToken,
  ts.SyntaxKind.AsteriskEqualsToken,
  ts.SyntaxKind.SlashEqualsToken,
  ts.SyntaxKind.PercentEqualsToken,
]);

/** エスケープ表記の同一IdentifierもASTの名前として判定する。 */
function isScore(node: ts.Node): boolean {
  return ts.isIdentifier(node) && node.text === 'score';
}

/** 副作用のない小さい数値式だけを許す。呼出し・代入・プロパティ評価は含めない。 */
function isNumericExpression(root: ts.Node): boolean {
  const pending = [root];
  while (pending.length) {
    const node = pending.pop()!;
    if (ts.isNumericLiteral(node) || isScore(node)) continue;
    if (ts.isParenthesizedExpression(node)) pending.push(node.expression);
    else if (
      ts.isPrefixUnaryExpression(node) &&
      (node.operator === ts.SyntaxKind.PlusToken || node.operator === ts.SyntaxKind.MinusToken)
    )
      pending.push(node.operand);
    else if (ts.isBinaryExpression(node) && arithmetic.has(node.operatorToken.kind))
      pending.push(node.left, node.right);
    else return false;
  }
  return true;
}

/** 中間statementの副作用をscoreの更新だけに限定する。 */
function isScoreUpdate(statement: ts.Statement): boolean {
  if (!ts.isExpressionStatement(statement)) return false;
  const node = statement.expression;
  if (ts.isBinaryExpression(node))
    return (
      isScore(node.left) &&
      assignments.has(node.operatorToken.kind) &&
      isNumericExpression(node.right)
    );
  return (
    (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) &&
    (node.operator === ts.SyntaxKind.PlusPlusToken ||
      node.operator === ts.SyntaxKind.MinusMinusToken) &&
    isScore(node.operand)
  );
}

/** 最後の出力を変数そのものへ結び付け、表示だけの固定を拒否する。 */
function logsScore(statement: ts.Statement | undefined): boolean {
  if (
    !statement ||
    !ts.isExpressionStatement(statement) ||
    !ts.isCallExpression(statement.expression)
  )
    return false;
  const call = statement.expression;
  return (
    !call.questionDotToken &&
    !call.typeArguments?.length &&
    call.arguments.length === 1 &&
    isScore(call.arguments[0]!) &&
    ts.isPropertyAccessExpression(call.expression) &&
    !call.expression.questionDotToken &&
    ts.isIdentifier(call.expression.expression) &&
    call.expression.expression.text === 'console' &&
    call.expression.name.text === 'log'
  );
}

/** 元TSだけを有限走査し、許可grammarを通ったコピーに限って非emitの正負検査を行う。 */
export function checkScoreNumberProgram(
  files: Readonly<Record<string, string>>,
  libraries: Readonly<Record<string, string>>,
  mode: 'annotation' | 'inference',
): ScoreNumberProgramResult {
  const names = Object.keys(files);
  if (names.some((name) => name.startsWith('__tsumucode_probe_')))
    return { status: 'system-error' };
  if (names.length !== 1 || names[0] !== 'main.ts') return { status: 'ready', facts: EMPTY_FACTS };
  const source = files['main.ts']!;
  if (source.length > 8_192) return { status: 'system-error' };
  try {
    const file = ts.createSourceFile('main.ts', source, ts.ScriptTarget.ES2023, true);
    const pending: { node: ts.Node; depth: number }[] = [{ node: file, depth: 0 }];
    let count = 0;
    let forbiddenEscapeAbsent = true;
    while (pending.length) {
      const { node, depth } = pending.pop()!;
      if (++count > 2_048 || depth > 64) return { status: 'system-error' };
      if (
        node.kind === ts.SyntaxKind.AnyKeyword ||
        ts.isAsExpression(node) ||
        ts.isTypeAssertionExpression(node) ||
        ts.isNonNullExpression(node)
      )
        forbiddenEscapeAbsent = false;
      ts.forEachChild(node, (child) => {
        pending.push({ node: child, depth: depth + 1 });
      });
    }
    const scanner = ts.createScanner(
      ts.ScriptTarget.ES2023,
      false,
      ts.LanguageVariant.Standard,
      source,
    );
    for (
      let token = scanner.scan();
      token !== ts.SyntaxKind.EndOfFileToken;
      token = scanner.scan()
    ) {
      if (
        token !== ts.SyntaxKind.SingleLineCommentTrivia &&
        token !== ts.SyntaxKind.MultiLineCommentTrivia
      )
        continue;
      const comment = scanner.getTokenText();
      if (
        /@ts-(?:ignore|expect-error|nocheck)\b/u.test(comment) ||
        /^\/\/\/\s*<reference\b/u.test(comment)
      )
        forbiddenEscapeAbsent = false;
    }
    const first = file.statements[0];
    const declaration =
      first &&
      ts.isVariableStatement(first) &&
      !first.modifiers?.length &&
      (first.declarationList.flags === ts.NodeFlags.Let ||
        first.declarationList.flags === ts.NodeFlags.Const) &&
      first.declarationList.declarations.length === 1
        ? first.declarationList.declarations[0]
        : undefined;
    const declarationTypeAccepted =
      !!declaration &&
      isScore(declaration.name) &&
      (mode === 'annotation'
        ? declaration.type?.kind === ts.SyntaxKind.NumberKeyword
        : !declaration.type &&
          ts.isVariableStatement(first!) &&
          first.declarationList.flags === ts.NodeFlags.Let);
    const logsScoreLast = logsScore(file.statements.at(-1));
    // number以外の型注釈は学習未達。import type等を含む任意型をprobeに持ち込まない。
    const programShapeAccepted =
      !!declaration &&
      isScore(declaration.name) &&
      !!declaration.initializer &&
      isNumericExpression(declaration.initializer) &&
      (!declaration.type || declaration.type.kind === ts.SyntaxKind.NumberKeyword) &&
      file.statements.length >= 2 &&
      file.statements.slice(1, -1).every(isScoreUpdate) &&
      logsScoreLast;
    const facts = {
      ...EMPTY_FACTS,
      declarationTypeAccepted,
      forbiddenEscapeAbsent,
      programShapeAccepted,
      logsScoreLast,
    };
    if (!programShapeAccepted || !declarationTypeAccepted || !forbiddenEscapeAbsent)
      return { status: 'ready', facts };

    const original = checkTypeScript(files, libraries);
    if (original.status !== 'valid') return { status: 'system-error' };
    const copy = `${source}\nexport { score };\n`;
    const prefix = 'import type { score } from "./main.js";\n\n';
    const positive = checkTypeScript(
      {
        'main.ts': copy,
        '__tsumucode_probe_positive.ts': `${prefix}const value: typeof score = 2;\n`,
      },
      libraries,
    );
    const negative = checkTypeScript(
      {
        'main.ts': copy,
        '__tsumucode_probe_negative.ts': `${prefix}const value: typeof score = "2";\n`,
      },
      libraries,
    );
    if (
      positive.status !== 'valid' ||
      negative.status !== 'type-error' ||
      negative.diagnostics.length !== 1 ||
      negative.diagnostics[0]?.code !== 2322 ||
      negative.diagnostics[0].file !== '__tsumucode_probe_negative.ts' ||
      negative.diagnostics[0].line !== 3 ||
      negative.diagnostics[0].column !== 7
    )
      return { status: 'system-error' };
    return {
      status: 'ready',
      facts: { ...facts, positiveProbeAccepted: true, negativeProbeRejected: true },
    };
  } catch {
    return { status: 'system-error' };
  }
}
