/** 初回の境界課題だけを読むAST検査。型検査や実DOM動作の代用にはしない。 */
import ts from 'typescript';
import type { TypeScriptBoundaryProfile } from '../../../core/content/typeScriptBoundaryContract';

export interface BoundaryInspection {
  readonly shape: boolean;
  readonly type: boolean;
  readonly value: boolean;
  readonly calls: boolean;
  readonly exportSource: string;
  readonly positiveLines: readonly string[];
  readonly negativeLines: readonly { readonly source: string; readonly code: number }[];
}

interface NamedFunction {
  readonly name: string;
  readonly parameters: readonly ts.ParameterDeclaration[];
  readonly type: ts.TypeNode | undefined;
  readonly body: ts.Block;
  readonly async: boolean;
}

function unwrap(node: ts.Expression): ts.Expression {
  while (ts.isParenthesizedExpression(node)) node = node.expression;
  return node;
}

function identifier(node: ts.Node | undefined, name: string): boolean {
  if (node && ts.isParenthesizedExpression(node)) return identifier(node.expression, name);
  return !!node && ts.isIdentifier(node) && node.text === name;
}

function name(node: ts.Node | undefined): string {
  return node && ts.isIdentifier(node) ? node.text : '';
}

function text(node: ts.Node | undefined, value: string): boolean {
  if (node && ts.isParenthesizedExpression(node)) return text(node.expression, value);
  return !!node && ts.isStringLiteral(node) && node.text === value;
}

function property(node: ts.Expression | undefined, object: string, member: string): boolean {
  if (!node) return false;
  const value = unwrap(node);
  return (
    ts.isPropertyAccessExpression(value) &&
    !value.questionDotToken &&
    identifier(value.expression, object) &&
    value.name.text === member
  );
}

function call(
  node: ts.Expression | undefined,
  callee: string,
  count: number,
): ts.CallExpression | undefined {
  if (!node) return undefined;
  const value = unwrap(node);
  return ts.isCallExpression(value) &&
    !value.questionDotToken &&
    identifier(value.expression, callee) &&
    value.arguments.length === count
    ? value
    : undefined;
}

function variable(statement: ts.Statement | undefined): ts.VariableDeclaration | undefined {
  if (
    !statement ||
    !ts.isVariableStatement(statement) ||
    statement.modifiers?.length ||
    statement.declarationList.declarations.length !== 1
  )
    return undefined;
  const declaration = statement.declarationList.declarations[0];
  return declaration && ts.isIdentifier(declaration.name) ? declaration : undefined;
}

function namedFunction(statement: ts.Statement): NamedFunction | undefined {
  if (
    ts.isFunctionDeclaration(statement) &&
    statement.name &&
    statement.body &&
    !statement.asteriskToken &&
    !statement.typeParameters?.length &&
    !statement.modifiers?.some((modifier) => modifier.kind !== ts.SyntaxKind.AsyncKeyword)
  ) {
    return {
      name: statement.name.text,
      parameters: statement.parameters,
      type: statement.type,
      body: statement.body,
      async: !!statement.modifiers?.some(
        (modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword,
      ),
    };
  }
  const declaration = variable(statement);
  const value = declaration?.initializer && unwrap(declaration.initializer);
  if (
    !declaration ||
    !value ||
    !(ts.isArrowFunction(value) || ts.isFunctionExpression(value)) ||
    !ts.isBlock(value.body) ||
    value.typeParameters?.length ||
    value.modifiers?.some((modifier) => modifier.kind !== ts.SyntaxKind.AsyncKeyword) ||
    (ts.isFunctionExpression(value) && (value.name || value.asteriskToken))
  )
    return undefined;
  return {
    name: name(declaration.name),
    parameters: value.parameters,
    type: value.type,
    body: value.body,
    async: !!value.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword),
  };
}

function simpleParameter(parameter: ts.ParameterDeclaration | undefined): boolean {
  return (
    !!parameter &&
    ts.isIdentifier(parameter.name) &&
    !parameter.modifiers?.length &&
    !parameter.questionToken &&
    !parameter.dotDotDotToken &&
    !parameter.initializer
  );
}

function typeReference(node: ts.TypeNode | undefined, value: string): boolean {
  while (node && ts.isParenthesizedTypeNode(node)) node = node.type;
  return (
    !!node &&
    ts.isTypeReferenceNode(node) &&
    identifier(node.typeName, value) &&
    !node.typeArguments?.length
  );
}

function promiseType(node: ts.TypeNode | undefined, kind: ts.SyntaxKind): boolean {
  while (node && ts.isParenthesizedTypeNode(node)) node = node.type;
  return (
    !!node &&
    ts.isTypeReferenceNode(node) &&
    identifier(node.typeName, 'Promise') &&
    node.typeArguments?.length === 1 &&
    node.typeArguments[0]?.kind === kind
  );
}

function returned(statement: ts.Statement | undefined): ts.Expression | undefined {
  if (statement && ts.isBlock(statement))
    return statement.statements.length === 1 ? returned(statement.statements[0]) : undefined;
  return statement && ts.isReturnStatement(statement) && statement.expression
    ? unwrap(statement.expression)
    : undefined;
}

function binary(node: ts.Expression, operator: ts.SyntaxKind): ts.BinaryExpression | undefined {
  const value = unwrap(node);
  return ts.isBinaryExpression(value) && value.operatorToken.kind === operator ? value : undefined;
}

function flatten(node: ts.Expression, operator: ts.SyntaxKind): readonly ts.Expression[] {
  const expression = binary(node, operator);
  return expression
    ? [...flatten(expression.left, operator), ...flatten(expression.right, operator)]
    : [unwrap(node)];
}

function notNull(node: ts.Expression, variableName: string, positive: boolean): boolean {
  const expression = binary(
    node,
    positive ? ts.SyntaxKind.ExclamationEqualsEqualsToken : ts.SyntaxKind.EqualsEqualsEqualsToken,
  );
  return (
    !!expression &&
    ((identifier(expression.left, variableName) &&
      unwrap(expression.right).kind === ts.SyntaxKind.NullKeyword) ||
      (identifier(expression.right, variableName) &&
        unwrap(expression.left).kind === ts.SyntaxKind.NullKeyword))
  );
}

function instance(node: ts.Expression, variableName: string, constructor: string): boolean {
  const expression = binary(node, ts.SyntaxKind.InstanceOfKeyword);
  return (
    !!expression &&
    identifier(expression.left, variableName) &&
    identifier(expression.right, constructor)
  );
}

function negation(node: ts.Expression): ts.Expression | undefined {
  const value = unwrap(node);
  return ts.isPrefixUnaryExpression(value) && value.operator === ts.SyntaxKind.ExclamationToken
    ? value.operand
    : undefined;
}

/** 正負を逆にした単一ガードでも、実値を返す側とfallbackを保つ。 */
function guardedReturn(
  statements: readonly ts.Statement[],
  acceptsGuard: (node: ts.Expression) => boolean,
  acceptsValue: (node: ts.Expression) => boolean,
  fallback: string,
): boolean {
  const first = statements[0];
  if (!first || !ts.isIfStatement(first)) return false;
  const yes = returned(first.thenStatement);
  const no = first.elseStatement ? returned(first.elseStatement) : returned(statements[1]);
  const expectedLength = first.elseStatement ? 1 : 2;
  if (statements.length !== expectedLength || !yes || !no) return false;
  const inverted = negation(first.expression);
  return inverted
    ? acceptsGuard(inverted) && text(yes, fallback) && acceptsValue(no)
    : acceptsGuard(first.expression) && acceptsValue(yes) && text(no, fallback);
}

function eventBody(fn: NamedFunction): boolean {
  const parameterName = name(fn.parameters[0]?.name);
  const target = variable(fn.body.statements[0]);
  if (!target || !property(target.initializer, parameterName, 'currentTarget')) return false;
  const targetName = name(target.name);
  return guardedReturn(
    fn.body.statements.slice(1),
    (node) => instance(node, targetName, 'HTMLButtonElement'),
    (node) => {
      const expression = binary(node, ts.SyntaxKind.QuestionQuestionToken);
      if (!expression) return false;
      const answer = unwrap(expression.left);
      return (
        ts.isPropertyAccessExpression(answer) &&
        !answer.questionDotToken &&
        property(answer.expression, targetName, 'dataset') &&
        answer.name.text === 'answer' &&
        text(expression.right, '未指定')
      );
    },
    '対象が違います',
  );
}

function typeofValue(
  node: ts.Expression,
  input: string,
  expected: string,
  member?: string,
  positive = true,
): boolean {
  const expression = binary(
    node,
    positive ? ts.SyntaxKind.EqualsEqualsEqualsToken : ts.SyntaxKind.ExclamationEqualsEqualsToken,
  );
  if (!expression) return false;
  const sides = [
    [expression.left, expression.right],
    [expression.right, expression.left],
  ] as const;
  return sides.some(([left, right]) => {
    const value = unwrap(left);
    return (
      ts.isTypeOfExpression(value) &&
      (member ? property(value.expression, input, member) : identifier(value.expression, input)) &&
      text(right, expected)
    );
  });
}

function hasPoints(node: ts.Expression, input: string): boolean {
  const expression = binary(node, ts.SyntaxKind.InKeyword);
  return !!expression && text(expression.left, 'points') && identifier(expression.right, input);
}

function pointsBody(fn: NamedFunction): boolean {
  const input = name(fn.parameters[0]?.name);
  const acceptsValue = (node: ts.Expression): boolean => {
    const expression = call(node, 'String', 1);
    return !!expression && property(expression.arguments[0], input, 'points');
  };
  const guards = [
    (node: ts.Expression) => typeofValue(node, input, 'object'),
    (node: ts.Expression) => notNull(node, input, true),
    (node: ts.Expression) => hasPoints(node, input),
    (node: ts.Expression) => typeofValue(node, input, 'number', 'points'),
  ];
  const acceptsGuard = (node: ts.Expression): boolean => {
    const terms = flatten(node, ts.SyntaxKind.AmpersandAmpersandToken);
    return terms.length === 4 && guards.every((guard) => terms.filter(guard).length === 1);
  };
  if (guardedReturn(fn.body.statements, acceptsGuard, acceptsValue, '不正なデータ')) return true;
  if (fn.body.statements.length !== 4) return false;
  const first = fn.body.statements[0];
  const second = fn.body.statements[1];
  const third = fn.body.statements[2];
  if (
    !first ||
    !second ||
    !third ||
    !ts.isIfStatement(first) ||
    !ts.isIfStatement(second) ||
    !ts.isIfStatement(third) ||
    [first, second, third].some(
      (statement) =>
        !!statement.elseStatement || !text(returned(statement.thenStatement), '不正なデータ'),
    )
  )
    return false;
  const terms = flatten(first.expression, ts.SyntaxKind.BarBarToken);
  const missing = negation(second.expression);
  const final = returned(fn.body.statements[3]);
  return (
    terms.length === 2 &&
    terms.some((node) => typeofValue(node, input, 'object', undefined, false)) &&
    terms.some((node) => notNull(node, input, false)) &&
    !!missing &&
    hasPoints(missing, input) &&
    typeofValue(third.expression, input, 'number', 'points', false) &&
    !!final &&
    acceptsValue(final)
  );
}

function selector(statement: ts.Statement | undefined, expected: string): string {
  const declaration = variable(statement);
  const initializer = declaration?.initializer && unwrap(declaration.initializer);
  if (
    !declaration ||
    !initializer ||
    !ts.isCallExpression(initializer) ||
    initializer.arguments.length !== 1 ||
    initializer.typeArguments?.length ||
    !property(initializer.expression, 'document', 'querySelector') ||
    !text(initializer.arguments[0], expected)
  )
    return '';
  return name(declaration.name);
}

function assignment(
  statement: ts.Statement | undefined,
  output: string,
): ts.Expression | undefined {
  if (!statement || !ts.isExpressionStatement(statement)) return undefined;
  const expression = binary(statement.expression, ts.SyntaxKind.EqualsToken);
  return expression && property(expression.left, output, 'textContent')
    ? expression.right
    : undefined;
}

function pointObject(node: ts.Expression | undefined, kind: 'number' | 'string'): boolean {
  if (!node) return false;
  const value = unwrap(node);
  if (!ts.isObjectLiteralExpression(value) || value.properties.length !== 1) return false;
  const item = value.properties[0];
  if (
    !item ||
    !ts.isPropertyAssignment(item) ||
    !(identifier(item.name, 'points') || text(item.name, 'points'))
  )
    return false;
  const input = unwrap(item.initializer);
  return kind === 'number' ? ts.isNumericLiteral(input) : ts.isStringLiteral(input);
}

function callback(
  node: ts.Expression | undefined,
): ts.ArrowFunction | ts.FunctionExpression | undefined {
  if (!node) return undefined;
  const value = unwrap(node);
  return (ts.isArrowFunction(value) || ts.isFunctionExpression(value)) &&
    !value.modifiers?.length &&
    !value.typeParameters?.length &&
    !(ts.isFunctionExpression(value) && (value.name || value.asteriskToken))
    ? value
    : undefined;
}

function nullGuard(expression: ts.Expression, names: readonly string[]): boolean {
  const terms = flatten(expression, ts.SyntaxKind.AmpersandAmpersandToken);
  return (
    terms.length === names.length &&
    names.every((value) => terms.filter((node) => notNull(node, value, true)).length === 1)
  );
}

function consoleMarker(statement: ts.Statement | undefined): boolean {
  if (!statement || !ts.isExpressionStatement(statement)) return false;
  const expression = unwrap(statement.expression);
  return (
    ts.isCallExpression(expression) &&
    property(expression.expression, 'console', 'log') &&
    expression.arguments.length === 1 &&
    text(expression.arguments[0], '準備できました')
  );
}

/** 固定された入口から、受け取った値を使う関数の結果が表示へ届くことを調べる。 */
function setup(
  statements: readonly ts.Statement[],
  fn: string,
  profile: TypeScriptBoundaryProfile,
): boolean {
  const selectors =
    profile === 'dom-event-v1'
      ? ['#output', '#answer']
      : profile === 'unknown-points-v1'
        ? ['#output', '#valid', '#invalid', '#missing']
        : ['#success', '#invalid', '#failure'];
  if (statements.length !== selectors.length + 2 || !consoleMarker(statements.at(-1))) return false;
  const names = selectors.map((value, index) => selector(statements[index], value));
  if (names.some((value) => !value) || new Set(names).size !== names.length) return false;
  const guard = statements[selectors.length];
  if (
    !guard ||
    !ts.isIfStatement(guard) ||
    guard.elseStatement ||
    !ts.isBlock(guard.thenStatement) ||
    !nullGuard(guard.expression, names)
  )
    return false;
  const registrations = guard.thenStatement.statements;
  const controls = profile === 'async-unknown-v1' ? names : names.slice(1);
  if (registrations.length !== controls.length) return false;
  return controls.every((control, index) => {
    const statement = registrations[index];
    if (!statement || !ts.isExpressionStatement(statement)) return false;
    const registration = unwrap(statement.expression);
    if (
      !ts.isCallExpression(registration) ||
      registration.arguments.length !== 2 ||
      registration.typeArguments?.length ||
      !property(registration.expression, control, 'addEventListener') ||
      !text(registration.arguments[0], 'click')
    )
      return false;
    const handler = callback(registration.arguments[1]);
    if (!handler || !ts.isBlock(handler.body) || handler.body.statements.length !== 1) return false;
    if (profile === 'async-unknown-v1') {
      if (handler.parameters.length) return false;
      const action = handler.body.statements[0];
      if (!action || !ts.isExpressionStatement(action)) return false;
      const expression = unwrap(action.expression);
      const invoked = call(
        ts.isVoidExpression(expression) ? expression.expression : expression,
        fn,
        1,
      );
      return !!invoked && text(invoked.arguments[0], ['success', 'invalid', 'failure'][index]!);
    }
    const output = assignment(handler.body.statements[0], names[0]!);
    const invoked = call(output, fn, 1);
    if (!invoked) return false;
    if (profile === 'dom-event-v1') {
      const parameter = handler.parameters[0];
      return (
        handler.parameters.length === 1 &&
        simpleParameter(parameter) &&
        (!parameter?.type || typeReference(parameter.type, 'Event')) &&
        identifier(invoked.arguments[0], name(parameter?.name))
      );
    }
    return (
      handler.parameters.length === 0 &&
      (index === 2
        ? !!invoked.arguments[0] && unwrap(invoked.arguments[0]).kind === ts.SyntaxKind.NullKeyword
        : pointObject(invoked.arguments[0], index === 0 ? 'number' : 'string'))
    );
  });
}

function modeAlias(statement: ts.TypeAliasDeclaration | undefined): boolean {
  if (
    !statement ||
    statement.modifiers?.length ||
    statement.typeParameters?.length ||
    !ts.isUnionTypeNode(statement.type) ||
    statement.type.types.length !== 3
  )
    return false;
  const members = statement.type.types;
  return ['success', 'invalid', 'failure'].every(
    (value) =>
      members.filter((node) => ts.isLiteralTypeNode(node) && text(node.literal, value)).length ===
      1,
  );
}

function modeCondition(node: ts.Expression, input: string, value: string): boolean {
  const expression = binary(node, ts.SyntaxKind.EqualsEqualsEqualsToken);
  return (
    !!expression &&
    ((identifier(expression.left, input) && text(expression.right, value)) ||
      (identifier(expression.right, input) && text(expression.left, value)))
  );
}

/** 遅延別解は既存の回収可能なPromiseと短いtimerだけに限定する。 */
function boundedDelay(statement: ts.Statement): boolean {
  if (!ts.isExpressionStatement(statement)) return false;
  const expression = unwrap(statement.expression);
  if (!ts.isAwaitExpression(expression)) return false;
  const pending = unwrap(expression.expression);
  if (
    !ts.isNewExpression(pending) ||
    !identifier(pending.expression, 'Promise') ||
    pending.typeArguments?.length !== 1 ||
    pending.typeArguments[0]?.kind !== ts.SyntaxKind.VoidKeyword ||
    pending.arguments?.length !== 1
  )
    return false;
  const executor = callback(pending.arguments[0]);
  const parameter = executor?.parameters[0];
  if (!executor || executor.parameters.length !== 1 || !simpleParameter(parameter)) return false;
  const body = ts.isBlock(executor.body)
    ? executor.body.statements.length === 1 &&
      ts.isExpressionStatement(executor.body.statements[0]!)
      ? executor.body.statements[0].expression
      : undefined
    : executor.body;
  const timer = body && call(body, 'setTimeout', 2);
  const duration = timer?.arguments[1] && unwrap(timer.arguments[1]);
  return (
    !!timer &&
    identifier(timer.arguments[0], name(parameter?.name)) &&
    !!duration &&
    ts.isNumericLiteral(duration) &&
    Number(duration.text) > 0 &&
    Number(duration.text) <= 500
  );
}

function loaderBody(fn: NamedFunction): boolean {
  const statements = [...fn.body.statements];
  if (statements.length === 4 && boundedDelay(statements[0]!)) statements.shift();
  if (statements.length !== 3) return false;
  const rejected = statements[0];
  const invalid = statements[1];
  const input = name(fn.parameters[0]?.name);
  if (
    !rejected ||
    !invalid ||
    !ts.isIfStatement(rejected) ||
    !ts.isIfStatement(invalid) ||
    rejected.elseStatement ||
    invalid.elseStatement ||
    !modeCondition(rejected.expression, input, 'failure') ||
    !modeCondition(invalid.expression, input, 'invalid')
  )
    return false;
  const thrown =
    ts.isBlock(rejected.thenStatement) && rejected.thenStatement.statements.length === 1
      ? rejected.thenStatement.statements[0]
      : rejected.thenStatement;
  const error = thrown && ts.isThrowStatement(thrown) ? unwrap(thrown.expression) : undefined;
  return (
    !!error &&
    ts.isNewExpression(error) &&
    identifier(error.expression, 'Error') &&
    error.arguments?.length === 1 &&
    ts.isStringLiteral(unwrap(error.arguments[0]!)) &&
    pointObject(returned(invalid.thenStatement), 'string') &&
    pointObject(returned(statements[2]), 'number')
  );
}

function emptyReturn(statement: ts.Statement): boolean {
  if (ts.isBlock(statement))
    return statement.statements.length === 1 && emptyReturn(statement.statements[0]!);
  return ts.isReturnStatement(statement) && !statement.expression;
}

function showBody(fn: NamedFunction, load: string, format: string): boolean {
  const statements = fn.body.statements;
  if (statements.length !== 3) return false;
  const output = selector(statements[0], '#output');
  const guard = statements[1];
  const attempt = statements[2];
  if (
    !output ||
    !guard ||
    !ts.isIfStatement(guard) ||
    guard.elseStatement ||
    !notNull(guard.expression, output, false) ||
    !emptyReturn(guard.thenStatement) ||
    !attempt ||
    !ts.isTryStatement(attempt) ||
    attempt.finallyBlock ||
    !attempt.catchClause ||
    attempt.tryBlock.statements.length !== 2
  )
    return false;
  const data = variable(attempt.tryBlock.statements[0]);
  const pending = data?.initializer && unwrap(data.initializer);
  const invoked = pending && ts.isAwaitExpression(pending) && call(pending.expression, load, 1);
  const displayed = call(assignment(attempt.tryBlock.statements[1], output), format, 1);
  if (
    !data ||
    data.type?.kind !== ts.SyntaxKind.UnknownKeyword ||
    !invoked ||
    !identifier(invoked.arguments[0], name(fn.parameters[0]?.name)) ||
    !displayed ||
    !identifier(displayed.arguments[0], name(data.name))
  )
    return false;
  const caught = attempt.catchClause.variableDeclaration;
  const error = name(caught?.name);
  const body = attempt.catchClause.block.statements;
  if (
    !error ||
    (caught?.type && caught.type.kind !== ts.SyntaxKind.UnknownKeyword) ||
    body.length !== 1
  )
    return false;
  const result = assignment(body[0], output);
  if (!result) return false;
  const choice = unwrap(result);
  if (!ts.isConditionalExpression(choice)) return false;
  const inverted = negation(choice.condition);
  return (
    instance(inverted ?? choice.condition, error, 'Error') &&
    property(inverted ? choice.whenFalse : choice.whenTrue, error, 'message') &&
    text(inverted ? choice.whenTrue : choice.whenFalse, '理由が不明です')
  );
}

/** 固定3課題の形と値の関係を分け、非emit検査に必要な宣言だけを返す。 */
export function inspectBoundaryLearning(
  file: ts.SourceFile,
  profile: TypeScriptBoundaryProfile,
): BoundaryInspection {
  const functions = file.statements.map(namedFunction).filter((fn): fn is NamedFunction => !!fn);
  const aliases = file.statements.filter(ts.isTypeAliasDeclaration);
  const statements = file.statements.filter(
    (statement) => !namedFunction(statement) && !ts.isTypeAliasDeclaration(statement),
  );
  const asynchronous = profile === 'async-unknown-v1';
  const main = functions[asynchronous ? 1 : 0];
  const load = asynchronous ? functions[0] : undefined;
  const show = asynchronous ? functions[2] : undefined;
  const shape =
    functions.length === (asynchronous ? 3 : 1) &&
    aliases.length === (asynchronous ? 1 : 0) &&
    !!main &&
    (!asynchronous || (!!load && !!show && modeAlias(aliases[0])));
  const parameter = main?.parameters[0];
  const parameterType =
    profile === 'dom-event-v1'
      ? typeReference(parameter?.type, 'Event')
      : parameter?.type?.kind === ts.SyntaxKind.UnknownKeyword;
  const validFunction =
    !!main &&
    !main.async &&
    main.parameters.length === 1 &&
    simpleParameter(parameter) &&
    main.type?.kind === ts.SyntaxKind.StringKeyword;
  const validAsyncType = (fn: NamedFunction | undefined, kind: ts.SyntaxKind): boolean =>
    !!fn &&
    fn.async &&
    fn.parameters.length === 1 &&
    simpleParameter(fn.parameters[0]) &&
    typeReference(fn.parameters[0]?.type, aliases[0]?.name.text ?? '') &&
    promiseType(fn.type, kind);
  const type =
    validFunction &&
    parameterType &&
    (!asynchronous ||
      (validAsyncType(load, ts.SyntaxKind.UnknownKeyword) &&
        validAsyncType(show, ts.SyntaxKind.VoidKeyword)));
  const value =
    !!main &&
    (profile === 'dom-event-v1' ? eventBody(main) : pointsBody(main)) &&
    (!asynchronous ||
      (!!load && !!show && loaderBody(load) && showBody(show, load.name, main.name)));
  const calls = !!main && setup(statements, asynchronous ? (show?.name ?? '') : main.name, profile);
  const exported = asynchronous
    ? `${load?.name ?? ''} as __tsumucode_load, ${show?.name ?? ''} as __tsumucode_show`
    : `${main?.name ?? ''} as __tsumucode_value`;
  const positiveLines =
    profile === 'dom-event-v1'
      ? [
          'const text: string = __tsumucode_value(new Event("click"));',
          'const pointer: (event: Event) => string = __tsumucode_value;',
        ]
      : profile === 'unknown-points-v1'
        ? [
            'const input: unknown = null; const text: string = __tsumucode_value(input);',
            'const pointer: (value: unknown) => string = __tsumucode_value;',
          ]
        : [
            'const pending: Promise<unknown> = __tsumucode_load("success");',
            'const shown: Promise<void> = __tsumucode_show("failure");',
          ];
  const negativeLines =
    profile === 'dom-event-v1'
      ? [
          { source: '__tsumucode_value("wrong");', code: 2345 },
          { source: 'const value: number = __tsumucode_value(new Event("click"));', code: 2322 },
        ]
      : profile === 'unknown-points-v1'
        ? [
            { source: 'const value: number = __tsumucode_value(null);', code: 2322 },
            {
              source: 'const pointer: (value: unknown) => number = __tsumucode_value;',
              code: 2322,
            },
          ]
        : [
            { source: '__tsumucode_load("other");', code: 2345 },
            { source: 'const pending: Promise<number> = __tsumucode_load("success");', code: 2322 },
            { source: 'const shown: Promise<string> = __tsumucode_show("failure");', code: 2322 },
          ];
  return {
    shape,
    type,
    value,
    calls,
    exportSource: `export { ${exported} };`,
    positiveLines,
    negativeLines,
  };
}
