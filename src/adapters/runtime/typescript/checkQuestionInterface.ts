/** Questionの初回演習だけを対象に、元TSの有限構文と形の正負検査を確認する。 */
import ts from 'typescript';
import { checkTypeScript } from './compileTypeScript';

export interface QuestionInterfaceFacts {
  readonly programShapeAccepted: boolean;
  readonly interfaceAnnotationAccepted: boolean;
  readonly requiredFieldsAccepted: boolean;
  readonly dataValuesAccepted: boolean;
  readonly forbiddenEscapeAbsent: boolean;
  readonly logsIndexedChoiceLast: boolean;
  readonly positiveProbeAccepted: boolean;
  readonly negativeProbesRejected: boolean;
}

export type QuestionInterfaceResult =
  | { readonly status: 'ready'; readonly facts: QuestionInterfaceFacts }
  | { readonly status: 'system-error' };

const EMPTY_FACTS: QuestionInterfaceFacts = {
  programShapeAccepted: false,
  interfaceAnnotationAccepted: false,
  requiredFieldsAccepted: false,
  dataValuesAccepted: false,
  forbiddenEscapeAbsent: true,
  logsIndexedChoiceLast: false,
  positiveProbeAccepted: false,
  negativeProbesRejected: false,
};

/** 引用符付きの項目名も、計算や副作用のない同じ名前として読む。 */
function propertyName(node: ts.PropertyName): string | undefined {
  return ts.isIdentifier(node) || ts.isStringLiteral(node) ? node.text : undefined;
}

/** 既に深さ・node数を制限した数値式だけを読み、コードを実行せず位置を求める。 */
function numericPosition(node: ts.Node): number | undefined {
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (ts.isParenthesizedExpression(node)) return numericPosition(node.expression);
  if (ts.isPrefixUnaryExpression(node)) {
    const value = numericPosition(node.operand);
    if (value === undefined) return undefined;
    if (node.operator === ts.SyntaxKind.PlusToken) return value;
    if (node.operator === ts.SyntaxKind.MinusToken) return -value;
    return undefined;
  }
  if (!ts.isBinaryExpression(node)) return undefined;
  const left = numericPosition(node.left);
  const right = numericPosition(node.right);
  if (left === undefined || right === undefined) return undefined;
  switch (node.operatorToken.kind) {
    case ts.SyntaxKind.PlusToken:
      return left + right;
    case ts.SyntaxKind.MinusToken:
      return left - right;
    case ts.SyntaxKind.AsteriskToken:
      return left * right;
    case ts.SyntaxKind.SlashToken:
      return left / right;
    case ts.SyntaxKind.PercentToken:
      return left % right;
    case ts.SyntaxKind.AsteriskAsteriskToken:
      return left ** right;
    default:
      return undefined;
  }
}

/** 配列の2つの一般的な表記を許し、optional・union・広い型へ変えない。 */
function fieldTypeAccepted(name: string, node: ts.TypeNode | undefined): boolean {
  if (!node) return false;
  while (ts.isParenthesizedTypeNode(node)) node = node.type;
  if (name === 'prompt') return node.kind === ts.SyntaxKind.StringKeyword;
  if (name === 'correctIndex') return node.kind === ts.SyntaxKind.NumberKeyword;
  return (
    name === 'choices' &&
    ((ts.isArrayTypeNode(node) && node.elementType.kind === ts.SyntaxKind.StringKeyword) ||
      (ts.isTypeReferenceNode(node) &&
        ts.isIdentifier(node.typeName) &&
        node.typeName.text === 'Array' &&
        node.typeArguments?.length === 1 &&
        node.typeArguments[0]?.kind === ts.SyntaxKind.StringKeyword))
  );
}

/** 最後の表示を、注釈したオブジェクトの選択肢と正答位置へ結び付ける。 */
function logsIndexedChoice(statement: ts.Statement | undefined, variable: string): boolean {
  if (
    !statement ||
    !ts.isExpressionStatement(statement) ||
    !ts.isCallExpression(statement.expression)
  )
    return false;
  const call = statement.expression;
  const argument = call.arguments[0];
  const isField = (node: ts.Expression, name: string): boolean =>
    (ts.isPropertyAccessExpression(node) &&
      !node.questionDotToken &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === variable &&
      node.name.text === name) ||
    (ts.isElementAccessExpression(node) &&
      !node.questionDotToken &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === variable &&
      ts.isStringLiteral(node.argumentExpression) &&
      node.argumentExpression.text === name);
  return (
    !call.questionDotToken &&
    !call.typeArguments?.length &&
    call.arguments.length === 1 &&
    ts.isPropertyAccessExpression(call.expression) &&
    !call.expression.questionDotToken &&
    ts.isIdentifier(call.expression.expression) &&
    call.expression.expression.text === 'console' &&
    call.expression.name.text === 'log' &&
    !!argument &&
    ts.isCallExpression(argument) &&
    !argument.questionDotToken &&
    !argument.typeArguments?.length &&
    argument.arguments.length === 1 &&
    ts.isPropertyAccessExpression(argument.expression) &&
    !argument.expression.questionDotToken &&
    argument.expression.name.text === 'at' &&
    isField(argument.expression.expression, 'choices') &&
    isField(argument.arguments[0]!, 'correctIndex')
  );
}

/** 単一interface・単一値・最後の出力だけを認め、コピーの検査結果をRunnerへ渡さない。 */
export function checkQuestionInterface(
  files: Readonly<Record<string, string>>,
  libraries: Readonly<Record<string, string>>,
): QuestionInterfaceResult {
  const names = Object.keys(files);
  if (names.some((name) => name.startsWith('__tsumucode_'))) return { status: 'system-error' };
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
    const shape = file.statements[0];
    const value = file.statements[1];
    const declaration =
      value &&
      ts.isVariableStatement(value) &&
      !value.modifiers?.length &&
      (value.declarationList.flags === ts.NodeFlags.Const ||
        value.declarationList.flags === ts.NodeFlags.Let) &&
      value.declarationList.declarations.length === 1
        ? value.declarationList.declarations[0]
        : undefined;
    const variable = declaration && ts.isIdentifier(declaration.name) ? declaration.name.text : '';
    const interfaceAnnotationAccepted =
      !!shape &&
      ts.isInterfaceDeclaration(shape) &&
      !shape.modifiers?.length &&
      !shape.heritageClauses?.length &&
      !shape.typeParameters?.length &&
      !!declaration?.type &&
      ts.isTypeReferenceNode(declaration.type) &&
      !declaration.type.typeArguments?.length &&
      ts.isIdentifier(declaration.type.typeName) &&
      declaration.type.typeName.text === shape.name.text &&
      !shape.name.text.startsWith('__tsumucode_') &&
      variable !== 'console' &&
      variable !== shape.name.text &&
      !variable.startsWith('__tsumucode_');
    const requiredFieldsAccepted =
      !!shape &&
      ts.isInterfaceDeclaration(shape) &&
      shape.members.length === 3 &&
      new Set(shape.members.map((member) => member.name && propertyName(member.name))).size === 3 &&
      shape.members.every(
        (member) =>
          ts.isPropertySignature(member) &&
          !member.questionToken &&
          !member.modifiers?.length &&
          fieldTypeAccepted(propertyName(member.name) ?? '', member.type),
      );
    const initializer = declaration?.initializer;
    const properties =
      initializer && ts.isObjectLiteralExpression(initializer) ? initializer.properties : [];
    const propertiesByName = new Map<string | undefined, ts.Expression>();
    for (const property of properties) {
      if (ts.isPropertyAssignment(property))
        propertiesByName.set(propertyName(property.name), property.initializer);
    }
    const prompt = propertiesByName.get('prompt');
    const choices = propertiesByName.get('choices');
    const index = propertiesByName.get('correctIndex');
    const position = index && numericPosition(index);
    const dataValuesAccepted =
      properties.length === 3 &&
      propertiesByName.size === 3 &&
      !!prompt &&
      (ts.isStringLiteral(prompt) || ts.isNoSubstitutionTemplateLiteral(prompt)) &&
      prompt.text === 'HTMLが受け持つものは？' &&
      !!choices &&
      ts.isArrayLiteralExpression(choices) &&
      choices.elements.length === 2 &&
      choices.elements.every(
        (item, position) =>
          (ts.isStringLiteral(item) || ts.isNoSubstitutionTemplateLiteral(item)) &&
          item.text === ['内容', '見た目'][position],
      ) &&
      position !== undefined &&
      Number.isSafeInteger(position) &&
      position >= 0;
    const logsIndexedChoiceLast = !!variable && logsIndexedChoice(file.statements.at(-1), variable);
    const programShapeAccepted =
      file.statements.length === 3 &&
      !!variable &&
      !!initializer &&
      ts.isObjectLiteralExpression(initializer) &&
      logsIndexedChoiceLast;
    const facts = {
      ...EMPTY_FACTS,
      programShapeAccepted,
      interfaceAnnotationAccepted,
      requiredFieldsAccepted,
      dataValuesAccepted,
      forbiddenEscapeAbsent,
      logsIndexedChoiceLast,
    };
    if (
      !programShapeAccepted ||
      !interfaceAnnotationAccepted ||
      !requiredFieldsAccepted ||
      !dataValuesAccepted ||
      !forbiddenEscapeAbsent
    )
      return { status: 'ready', facts };
    if (checkTypeScript(files, libraries).status !== 'valid') return { status: 'system-error' };
    const copy = `${source}\nexport { ${variable} as __tsumucode_question };\n`;
    const prefix = 'import type { __tsumucode_question } from "./main.js";\n\n';
    const positive = checkTypeScript(
      {
        'main.ts': copy,
        '__tsumucode_positive.ts':
          prefix +
          'const first: typeof __tsumucode_question = { prompt: "別の問題", choices: ["答え"], correctIndex: 0 };\n' +
          'const boundary: typeof __tsumucode_question = { prompt: "", choices: [], correctIndex: 10 };\n',
      },
      libraries,
    );
    const negatives = [
      {
        source:
          'const noPrompt: typeof __tsumucode_question = { choices: ["a"], correctIndex: 0 };',
        code: 2741,
        column: 7,
      },
      {
        source: 'const noChoices: typeof __tsumucode_question = { prompt: "a", correctIndex: 0 };',
        code: 2741,
        column: 7,
      },
      {
        source: 'const noIndex: typeof __tsumucode_question = { prompt: "a", choices: ["a"] };',
        code: 2741,
        column: 7,
      },
      {
        source:
          'const badPrompt: typeof __tsumucode_question = { prompt: 1, choices: ["a"], correctIndex: 0 };',
        code: 2322,
        property: 'prompt:',
      },
      {
        source:
          'const badChoices: typeof __tsumucode_question = { prompt: "a", choices: 1, correctIndex: 0 };',
        code: 2322,
        property: 'choices:',
      },
      {
        source:
          'const badIndex: typeof __tsumucode_question = { prompt: "a", choices: ["a"], correctIndex: "0" };',
        code: 2322,
        property: 'correctIndex:',
      },
    ];
    const negative = checkTypeScript(
      {
        'main.ts': copy,
        '__tsumucode_negative.ts': prefix + negatives.map(({ source }) => source).join('\n') + '\n',
      },
      libraries,
    );
    if (
      positive.status !== 'valid' ||
      negative.status !== 'type-error' ||
      negative.diagnostics.length !== negatives.length ||
      !negatives.every((probe, position) =>
        negative.diagnostics.some(
          (diagnostic) =>
            diagnostic.file === '__tsumucode_negative.ts' &&
            diagnostic.code === probe.code &&
            diagnostic.line === position + 3 &&
            diagnostic.column === (probe.column ?? probe.source.indexOf(probe.property) + 1),
        ),
      )
    )
      return { status: 'system-error' };
    return {
      status: 'ready',
      facts: { ...facts, positiveProbeAccepted: true, negativeProbesRejected: true },
    };
  } catch {
    return { status: 'system-error' };
  }
}
