/** 初回のunion/optional課題だけを対象に、分岐で読む値と型関係を確認する。 */
import ts from 'typescript';
import { checkTypeScript, createTypeScriptProbeChecker } from './compileTypeScript';

export type ConditionalLearningProfile = 'union-result-v1' | 'optional-hint-v1';

export interface ConditionalLearningFacts {
  readonly typeShapeAccepted: boolean;
  readonly parameterAnnotationAccepted: boolean;
  readonly branchesUseValue: boolean;
  readonly callsAccepted: boolean;
  readonly forbiddenEscapeAbsent: boolean;
  readonly positiveProbeAccepted: boolean;
  readonly negativeProbesRejected: boolean;
}

export type ConditionalLearningResult =
  | {
      readonly status: 'ready';
      readonly profile: ConditionalLearningProfile;
      readonly facts: ConditionalLearningFacts;
    }
  | { readonly status: 'system-error' };

const EMPTY_FACTS: ConditionalLearningFacts = {
  typeShapeAccepted: false,
  parameterAnnotationAccepted: false,
  branchesUseValue: false,
  callsAccepted: false,
  forbiddenEscapeAbsent: true,
  positiveProbeAccepted: false,
  negativeProbesRejected: false,
};

function propertyName(node: ts.PropertyName): string | undefined {
  return ts.isIdentifier(node) || ts.isStringLiteral(node) ? node.text : undefined;
}

/** 副作用のないプロパティ参照を同じ引数へ結び付ける。 */
function field(node: ts.Expression, parameter: string, name: string): boolean {
  while (ts.isParenthesizedExpression(node)) node = node.expression;
  return (
    (ts.isPropertyAccessExpression(node) &&
      !node.questionDotToken &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === parameter &&
      node.name.text === name) ||
    (ts.isElementAccessExpression(node) &&
      !node.questionDotToken &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === parameter &&
      ts.isStringLiteral(node.argumentExpression) &&
      node.argumentExpression.text === name)
  );
}

/** 条件式の値の検査だけを許し、代入・呼出しで元の値を変更しない。 */
function pureCondition(node: ts.Expression, parameter: string): boolean {
  if (ts.isParenthesizedExpression(node)) return pureCondition(node.expression, parameter);
  if (ts.isTypeOfExpression(node)) return pureCondition(node.expression, parameter);
  if (ts.isPrefixUnaryExpression(node))
    return (
      node.operator === ts.SyntaxKind.ExclamationToken && pureCondition(node.operand, parameter)
    );
  if (ts.isStringLiteral(node) || node.kind === ts.SyntaxKind.NullKeyword) return true;
  if (ts.isIdentifier(node)) return node.text === parameter || node.text === 'undefined';
  if (field(node, parameter, 'kind') || field(node, parameter, 'hint')) return true;
  return (
    ts.isBinaryExpression(node) &&
    [
      ts.SyntaxKind.EqualsEqualsEqualsToken,
      ts.SyntaxKind.ExclamationEqualsEqualsToken,
      ts.SyntaxKind.EqualsEqualsToken,
      ts.SyntaxKind.ExclamationEqualsToken,
      ts.SyntaxKind.AmpersandAmpersandToken,
      ts.SyntaxKind.BarBarToken,
      ts.SyntaxKind.InKeyword,
    ].includes(node.operatorToken.kind) &&
    pureCondition(node.left, parameter) &&
    pureCondition(node.right, parameter)
  );
}

/** if/else・早期return・条件演算子の葉を集め、表示固定の別経路を作らせない。 */
function returnValues(
  statements: readonly ts.Statement[],
  parameter: string,
): readonly ts.Expression[] | undefined {
  const values: ts.Expression[] = [];
  const visit = (statement: ts.Statement): boolean => {
    if (ts.isBlock(statement))
      return statement.statements.length === 1 && visit(statement.statements[0]!);
    if (ts.isReturnStatement(statement) && statement.expression) {
      let expression = statement.expression;
      while (ts.isParenthesizedExpression(expression)) expression = expression.expression;
      if (ts.isConditionalExpression(expression)) {
        if (!pureCondition(expression.condition, parameter)) return false;
        values.push(expression.whenTrue, expression.whenFalse);
      } else values.push(expression);
      return true;
    }
    if (!ts.isIfStatement(statement) || !pureCondition(statement.expression, parameter))
      return false;
    return (
      visit(statement.thenStatement) && (!statement.elseStatement || visit(statement.elseStatement))
    );
  };
  return statements.length <= 2 && statements.every(visit) && values.length === 2
    ? values
    : undefined;
}

function members(
  node: ts.TypeLiteralNode | ts.InterfaceDeclaration,
): Map<string | undefined, ts.PropertySignature> | undefined {
  const result = new Map<string | undefined, ts.PropertySignature>();
  for (const member of node.members) {
    if (
      !ts.isPropertySignature(member) ||
      member.modifiers?.some((modifier) => modifier.kind !== ts.SyntaxKind.ReadonlyKeyword)
    )
      return undefined;
    const name = propertyName(member.name);
    if (!name || result.has(name)) return undefined;
    result.set(name, member);
  }
  return result;
}

function unionShape(node: ts.Statement | undefined): boolean {
  if (
    !node ||
    !ts.isTypeAliasDeclaration(node) ||
    node.modifiers?.length ||
    node.typeParameters?.length ||
    !ts.isUnionTypeNode(node.type) ||
    node.type.types.length !== 2
  )
    return false;
  const variants = new Set<string>();
  for (const type of node.type.types) {
    if (!ts.isTypeLiteralNode(type)) return false;
    const fields = members(type);
    const kind = fields?.get('kind');
    if (
      fields?.size !== 2 ||
      !kind?.type ||
      kind.questionToken ||
      !ts.isLiteralTypeNode(kind.type) ||
      !ts.isStringLiteral(kind.type.literal)
    )
      return false;
    const tag = kind.type.literal.text;
    const value = fields.get(tag === 'correct' ? 'points' : tag === 'incorrect' ? 'message' : '');
    if (
      !value ||
      value.questionToken ||
      value.type?.kind !==
        (tag === 'correct' ? ts.SyntaxKind.NumberKeyword : ts.SyntaxKind.StringKeyword)
    )
      return false;
    variants.add(tag);
  }
  return variants.size === 2;
}

function optionalShape(node: ts.Statement | undefined): boolean {
  if (
    !node ||
    !ts.isInterfaceDeclaration(node) ||
    node.modifiers?.length ||
    node.typeParameters?.length ||
    node.heritageClauses?.length
  )
    return false;
  const fields = members(node);
  const hint = fields?.get('hint');
  return (
    fields?.size === 1 && !!hint?.questionToken && hint.type?.kind === ts.SyntaxKind.StringKeyword
  );
}

/** 引数の型と分岐結果を、改名を許しつつ有限な演習データへ対応させる。 */
export function checkConditionalLearning(
  files: Readonly<Record<string, string>>,
  libraries: Readonly<Record<string, string>>,
  profile: ConditionalLearningProfile,
): ConditionalLearningResult {
  if (Object.keys(files).some((name) => name.startsWith('__tsumucode_')))
    return { status: 'system-error' };
  const source = files['main.ts'];
  if (Object.keys(files).length !== 1 || source === undefined)
    return { status: 'ready', profile, facts: EMPTY_FACTS };
  if (source.length > 8192) return { status: 'system-error' };
  try {
    const file = ts.createSourceFile('main.ts', source, ts.ScriptTarget.ES2023, true);
    const pending = [{ node: file as ts.Node, depth: 0 }];
    let nodes = 0;
    let forbiddenEscapeAbsent = true;
    while (pending.length) {
      const { node, depth } = pending.pop()!;
      if (++nodes > 2048 || depth > 64) return { status: 'system-error' };
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
        (token === ts.SyntaxKind.SingleLineCommentTrivia ||
          token === ts.SyntaxKind.MultiLineCommentTrivia) &&
        (/@ts-(?:ignore|expect-error|nocheck)\b/u.test(scanner.getTokenText()) ||
          /^\/\/\/\s*<reference\b/u.test(scanner.getTokenText()))
      )
        forbiddenEscapeAbsent = false;
    }
    const shape = file.statements[0];
    const fn = file.statements[1];
    const shapeName =
      shape && (ts.isInterfaceDeclaration(shape) || ts.isTypeAliasDeclaration(shape))
        ? shape.name.text
        : '';
    const parameter =
      fn && ts.isFunctionDeclaration(fn) && fn.parameters.length === 1
        ? fn.parameters[0]
        : undefined;
    const parameterName = parameter && ts.isIdentifier(parameter.name) ? parameter.name.text : '';
    const functionName = fn && ts.isFunctionDeclaration(fn) ? fn.name?.text : undefined;
    const parameterAnnotationAccepted =
      !!parameterName &&
      !!functionName &&
      !!shapeName &&
      ![shapeName, parameterName, functionName].some(
        (name) => name.startsWith('__tsumucode_') || name === 'console' || name === 'undefined',
      ) &&
      !!fn &&
      ts.isFunctionDeclaration(fn) &&
      !fn.modifiers?.length &&
      !fn.typeParameters?.length &&
      !fn.asteriskToken &&
      !parameter?.questionToken &&
      !parameter?.dotDotDotToken &&
      !parameter?.initializer &&
      !!parameter?.type &&
      ts.isTypeReferenceNode(parameter.type) &&
      !parameter.type.typeArguments?.length &&
      ts.isIdentifier(parameter.type.typeName) &&
      parameter.type.typeName.text === shapeName;
    const leaves =
      fn && ts.isFunctionDeclaration(fn) && fn.body
        ? returnValues(fn.body.statements, parameterName)
        : undefined;
    const isUnion = profile === 'union-result-v1';
    const branchesUseValue =
      !!leaves &&
      (isUnion
        ? leaves.some((leaf) => field(leaf, parameterName, 'points')) &&
          leaves.some((leaf) => field(leaf, parameterName, 'message'))
        : leaves.some(
            (leaf) =>
              ts.isPropertyAccessExpression(leaf) &&
              !leaf.questionDotToken &&
              leaf.name.text === 'length' &&
              field(leaf.expression, parameterName, 'hint'),
          ) && leaves.some((leaf) => ts.isStringLiteral(leaf) && leaf.text === 'ヒントなし'));
    const expected = isUnion
      ? [
          { kind: 'correct', points: 2 },
          { kind: 'incorrect', message: 'もう一度' },
        ]
      : [{ hint: '見る' }, {}, { hint: '' }];
    const callsAccepted =
      file.statements.length === expected.length + 2 &&
      expected.every((record, index) => {
        const statement = file.statements[index + 2];
        if (
          !statement ||
          !ts.isExpressionStatement(statement) ||
          !ts.isCallExpression(statement.expression)
        )
          return false;
        const call = statement.expression;
        if (
          call.questionDotToken ||
          call.typeArguments?.length ||
          !ts.isPropertyAccessExpression(call.expression) ||
          call.expression.questionDotToken ||
          !ts.isIdentifier(call.expression.expression) ||
          call.expression.expression.text !== 'console' ||
          call.expression.name.text !== 'log' ||
          call.arguments.length !== 1
        )
          return false;
        const invocation = call.arguments[0];
        if (
          !invocation ||
          !ts.isCallExpression(invocation) ||
          invocation.questionDotToken ||
          invocation.typeArguments?.length ||
          !ts.isIdentifier(invocation.expression) ||
          invocation.expression.text !== functionName ||
          invocation.arguments.length !== 1
        )
          return false;
        const argument = invocation.arguments[0];
        return (
          !!argument &&
          ts.isObjectLiteralExpression(argument) &&
          argument.properties.length === Object.keys(record).length &&
          new Set(argument.properties.map((p) => p.name && propertyName(p.name))).size ===
            argument.properties.length &&
          argument.properties.every(
            (p) =>
              ts.isPropertyAssignment(p) &&
              Object.entries(record).some(
                ([name, value]) =>
                  propertyName(p.name) === name &&
                  (typeof value === 'number'
                    ? ts.isNumericLiteral(p.initializer) && Number(p.initializer.text) === value
                    : ts.isStringLiteral(p.initializer) && p.initializer.text === value),
              ),
          )
        );
      });
    const facts = {
      ...EMPTY_FACTS,
      typeShapeAccepted: isUnion ? unionShape(shape) : optionalShape(shape),
      parameterAnnotationAccepted,
      branchesUseValue,
      callsAccepted,
      forbiddenEscapeAbsent,
    };
    if (
      !facts.typeShapeAccepted ||
      !facts.parameterAnnotationAccepted ||
      !facts.branchesUseValue ||
      !facts.callsAccepted ||
      !facts.forbiddenEscapeAbsent
    )
      return { status: 'ready', profile, facts };
    if (checkTypeScript(files, libraries).status !== 'valid') return { status: 'system-error' };
    const copy = source + `\nexport type { ${shapeName} as __tsumucode_shape };\n`;
    const prefix = 'import type { __tsumucode_shape } from "./main.js";\n';
    const positives = isUnion
      ? ['{ kind: "correct", points: 0 }', '{ kind: "incorrect", message: "" }']
      : ['{}', '{ hint: "" }'];
    const negatives = isUnion
      ? [
          { value: '{ kind: "pending", points: 0 }', code: 2322 },
          { value: '{ kind: "correct", points: "0" }', code: 2322 },
          { value: '{ kind: "incorrect" }', code: 2322 },
        ]
      : [
          { value: '{ hint: 0 }', code: 2322 },
          { value: '{ hint: undefined }', code: 2375 },
        ];
    const declarations = (values: readonly string[]) =>
      prefix +
      values
        .map((value, index) => `const probe${String(index)}: __tsumucode_shape = ${value};`)
        .join('\n') +
      '\n';
    const checkProbe = createTypeScriptProbeChecker();
    const positive = checkProbe(
      { 'main.ts': copy, '__tsumucode_positive.ts': declarations(positives) },
      libraries,
    );
    const negative = checkProbe(
      {
        'main.ts': copy,
        '__tsumucode_negative.ts': declarations(negatives.map(({ value }) => value)),
      },
      libraries,
    );
    if (
      positive.status !== 'valid' ||
      negative.status !== 'type-error' ||
      negative.diagnostics.length !== negatives.length ||
      !negatives.every((probe, index) =>
        negative.diagnostics.some(
          (d) =>
            d.file === '__tsumucode_negative.ts' &&
            d.line === index + 2 &&
            d.code === probe.code &&
            (d.column ?? 0) > 0,
        ),
      )
    )
      return { status: 'system-error' };
    return {
      status: 'ready',
      profile,
      facts: { ...facts, positiveProbeAccepted: true, negativeProbesRejected: true },
    };
  } catch {
    return { status: 'system-error' };
  }
}
