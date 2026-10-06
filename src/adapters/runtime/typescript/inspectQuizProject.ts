/** 固定クイズの役割・型・値の接続を、元TSの有限な構文だけで確認する。 */
import ts from 'typescript';
import type { TypeScriptQuizProjectProfile } from '../../../core/content/typeScriptQuizProjectContract';

export interface QuizProjectInspection {
  readonly programShapeAccepted: boolean;
  readonly typeContractAccepted: boolean;
  readonly usesLearningValues: boolean;
}

function unwrap(node: ts.Expression): ts.Expression {
  while (ts.isParenthesizedExpression(node)) node = node.expression;
  return node;
}

function id(node: ts.Node | undefined, name: string): boolean {
  if (node && ts.isParenthesizedExpression(node)) return id(node.expression, name);
  return !!node && ts.isIdentifier(node) && node.text === name;
}

function text(node: ts.Node | undefined, value: string): boolean {
  if (node && ts.isParenthesizedExpression(node)) return text(node.expression, value);
  return !!node && ts.isStringLiteral(node) && node.text === value;
}

function keyword(node: ts.Node | undefined, kind: ts.SyntaxKind): boolean {
  if (node && ts.isParenthesizedExpression(node)) return keyword(node.expression, kind);
  return node?.kind === kind;
}

function reference(node: ts.TypeNode | undefined, name: string): boolean {
  return (
    !!node && ts.isTypeReferenceNode(node) && id(node.typeName, name) && !node.typeArguments?.length
  );
}

function arrayType(node: ts.TypeNode | undefined, item: string, readonly: boolean): boolean {
  if (!node) return false;
  if (ts.isTypeOperatorNode(node) && node.operator === ts.SyntaxKind.ReadonlyKeyword)
    return readonly && arrayType(node.type, item, false);
  if (ts.isTypeReferenceNode(node))
    return (
      id(node.typeName, readonly ? 'ReadonlyArray' : 'Array') &&
      node.typeArguments?.length === 1 &&
      elementType(node.typeArguments[0], item)
    );
  return !readonly && ts.isArrayTypeNode(node) && elementType(node.elementType, item);
}

function elementType(node: ts.TypeNode | undefined, item: string): boolean {
  return item === 'string' ? keyword(node, ts.SyntaxKind.StringKeyword) : reference(node, item);
}

function unionLiterals(node: ts.TypeNode | undefined, values: readonly string[]): boolean {
  if (!node || !ts.isUnionTypeNode(node) || node.types.length !== values.length) return false;
  const actual = node.types.map((type) =>
    ts.isLiteralTypeNode(type) && ts.isStringLiteral(type.literal) ? type.literal.text : '',
  );
  return values.every((value) => actual.includes(value));
}

function properties(node: ts.Expression | undefined): Map<string, ts.Expression> | undefined {
  if (!node || !ts.isObjectLiteralExpression(unwrap(node))) return undefined;
  const object = unwrap(node) as ts.ObjectLiteralExpression;
  const result = new Map<string, ts.Expression>();
  for (const member of object.properties) {
    if (ts.isShorthandPropertyAssignment(member) && !member.objectAssignmentInitializer)
      result.set(member.name.text, member.name);
    else if (
      ts.isPropertyAssignment(member) &&
      (ts.isIdentifier(member.name) || ts.isStringLiteral(member.name))
    )
      result.set(member.name.text, member.initializer);
    else return undefined;
  }
  return result.size === object.properties.length ? result : undefined;
}

function access(
  node: ts.Expression | undefined,
  base: string,
  ...names: readonly string[]
): boolean {
  if (!node) return false;
  let current = unwrap(node);
  for (const name of [...names].reverse()) {
    if (!ts.isPropertyAccessExpression(current) || current.name.text !== name) return false;
    current = unwrap(current.expression);
  }
  return id(current, base);
}

function numeric(node: ts.Expression | undefined, value: number): boolean {
  return (
    !!node &&
    ts.isNumericLiteral(unwrap(node)) &&
    Number((unwrap(node) as ts.NumericLiteral).text) === value
  );
}

function binary(
  node: ts.Expression | undefined,
  kind: ts.SyntaxKind,
  left: (node: ts.Expression) => boolean,
  right: (node: ts.Expression) => boolean,
): boolean {
  if (!node) return false;
  const value = unwrap(node);
  return (
    ts.isBinaryExpression(value) &&
    value.operatorToken.kind === kind &&
    left(unwrap(value.left)) &&
    right(unwrap(value.right))
  );
}

function call(node: ts.Expression | undefined, name: string, args: readonly string[]): boolean {
  if (!node) return false;
  const value = unwrap(node);
  return (
    ts.isCallExpression(value) &&
    id(value.expression, name) &&
    !value.typeArguments?.length &&
    value.arguments.length === args.length &&
    args.every((arg, index) => id(unwrap(value.arguments[index]!), arg))
  );
}

interface FunctionRole {
  readonly fn: ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression;
  readonly params: readonly string[];
}

function functionRole(statement: ts.Statement): [string, FunctionRole] | undefined {
  let name: string;
  let fn: FunctionRole['fn'];
  if (
    ts.isFunctionDeclaration(statement) &&
    statement.name &&
    statement.body &&
    !statement.asteriskToken
  ) {
    name = statement.name.text;
    fn = statement;
  } else if (
    ts.isVariableStatement(statement) &&
    (statement.declarationList.flags & ts.NodeFlags.Const) !== 0 &&
    statement.declarationList.declarations.length === 1
  ) {
    const declaration = statement.declarationList.declarations[0]!;
    const initializer = declaration.initializer && unwrap(declaration.initializer);
    if (
      !ts.isIdentifier(declaration.name) ||
      !initializer ||
      !(ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer)) ||
      ('asteriskToken' in initializer && initializer.asteriskToken)
    )
      return undefined;
    name = declaration.name.text;
    fn = initializer;
  } else return undefined;
  if (
    fn.typeParameters?.length ||
    fn.parameters.some(
      (param) =>
        !ts.isIdentifier(param.name) ||
        param.questionToken ||
        param.dotDotDotToken ||
        param.initializer,
    )
  )
    return undefined;
  return [name, { fn, params: fn.parameters.map((param) => (param.name as ts.Identifier).text) }];
}

function signature(
  role: FunctionRole | undefined,
  parameters: readonly (string | ts.SyntaxKind)[],
  output: (node: ts.TypeNode | undefined) => boolean,
  async: boolean = false,
): boolean {
  return (
    !!role &&
    role.fn.parameters.length === parameters.length &&
    parameters.every((type, index) =>
      typeof type === 'string'
        ? reference(role.fn.parameters[index]?.type, type)
        : keyword(role.fn.parameters[index]?.type, type),
    ) &&
    output(role.fn.type) &&
    (role.fn.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword) ??
      false) === async &&
    !role.fn.modifiers?.some((modifier) => modifier.kind !== ts.SyntaxKind.AsyncKeyword)
  );
}

function statements(role: FunctionRole | undefined): readonly ts.Statement[] {
  const body = role?.fn.body;
  if (!body) return [];
  return ts.isBlock(body) ? body.statements : [ts.factory.createReturnStatement(body)];
}

function returned(statement: ts.Statement | undefined): ts.Expression | undefined {
  if (statement && ts.isBlock(statement) && statement.statements.length === 1)
    return returned(statement.statements[0]);
  return statement && ts.isReturnStatement(statement) && statement.expression
    ? unwrap(statement.expression)
    : undefined;
}

/** 単一constへの代入だけを解決し、書換えや任意の評価は行わない。 */
function local(statement: ts.Statement | undefined): ts.VariableDeclaration | undefined {
  return statement &&
    ts.isVariableStatement(statement) &&
    statement.declarationList.flags & ts.NodeFlags.Const &&
    statement.declarationList.declarations.length === 1 &&
    ts.isIdentifier(statement.declarationList.declarations[0]!.name)
    ? statement.declarationList.declarations[0]
    : undefined;
}

function memberTypes(
  members: readonly ts.TypeElement[],
  expected: Readonly<Record<string, (node: ts.TypeNode | undefined) => boolean>>,
  readonly: boolean = false,
): boolean {
  if (members.length !== Object.keys(expected).length) return false;
  const seen = new Set<string>();
  return members.every((member) => {
    if (
      !ts.isPropertySignature(member) ||
      !ts.isIdentifier(member.name) ||
      member.questionToken ||
      seen.has(member.name.text)
    )
      return false;
    seen.add(member.name.text);
    return (
      !!expected[member.name.text]?.(member.type) &&
      (!readonly ||
        !!member.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ReadonlyKeyword)) &&
      !member.modifiers?.some((modifier) => modifier.kind !== ts.SyntaxKind.ReadonlyKeyword)
    );
  });
}

function typeContract(
  types: ReadonlyMap<string, ts.InterfaceDeclaration | ts.TypeAliasDeclaration>,
): boolean {
  const category = types.get('Category');
  const mode = types.get('LoadMode');
  const question = types.get('Question');
  const state = types.get('QuizState');
  const result = types.get('LoadResult');
  if (
    !category ||
    !ts.isTypeAliasDeclaration(category) ||
    !unionLiterals(category.type, ['web', 'logic']) ||
    !mode ||
    !ts.isTypeAliasDeclaration(mode) ||
    !unionLiterals(mode.type, ['success', 'invalid', 'failure']) ||
    !question ||
    !ts.isInterfaceDeclaration(question) ||
    question.heritageClauses?.length ||
    question.typeParameters?.length ||
    !state ||
    !ts.isInterfaceDeclaration(state) ||
    state.heritageClauses?.length ||
    state.typeParameters?.length ||
    !result ||
    !ts.isTypeAliasDeclaration(result) ||
    !ts.isUnionTypeNode(result.type) ||
    result.type.types.length !== 3
  )
    return false;
  if (
    !memberTypes(question.members, {
      category: (node) => reference(node, 'Category') || unionLiterals(node, ['web', 'logic']),
      text: (node) => keyword(node, ts.SyntaxKind.StringKeyword),
      choices: (node) => arrayType(node, 'string', true),
      correct: (node) => keyword(node, ts.SyntaxKind.StringKeyword),
    }) ||
    !memberTypes(
      state.members,
      {
        index: (node) => keyword(node, ts.SyntaxKind.NumberKeyword),
        score: (node) => keyword(node, ts.SyntaxKind.NumberKeyword),
        answered: (node) => keyword(node, ts.SyntaxKind.BooleanKeyword),
      },
      true,
    )
  )
    return false;
  const resultTypes = result.type.types;
  return ['ready', 'invalid', 'failed'].every((kind) =>
    resultTypes.some(
      (node) =>
        ts.isTypeLiteralNode(node) &&
        memberTypes(node.members, {
          kind: (type) => !!type && ts.isLiteralTypeNode(type) && text(type.literal, kind),
          ...(kind === 'ready'
            ? { questions: (type: ts.TypeNode | undefined) => arrayType(type, 'Question', true) }
            : kind === 'failed'
              ? {
                  message: (type: ts.TypeNode | undefined) =>
                    keyword(type, ts.SyntaxKind.StringKeyword),
                }
              : {}),
        }),
    ),
  );
}

function dataValues(declaration: ts.VariableDeclaration | undefined): boolean {
  if (!declaration?.initializer || !arrayType(declaration.type, 'Question', true)) return false;
  const array = unwrap(declaration.initializer);
  if (!ts.isArrayLiteralExpression(array) || array.elements.length !== 4) return false;
  const counts = { web: 0, logic: 0 };
  return (
    array.elements.every((element) => {
      const fields = properties(element);
      const categoryValue = fields?.get('category');
      const labelValue = fields?.get('text');
      const correctValue = fields?.get('correct');
      const choicesValue = fields?.get('choices');
      const category = categoryValue && unwrap(categoryValue);
      const label = labelValue && unwrap(labelValue);
      const correct = correctValue && unwrap(correctValue);
      const choices = choicesValue && unwrap(choicesValue);
      if (
        !fields ||
        fields.size !== 4 ||
        !category ||
        !ts.isStringLiteral(category) ||
        !['web', 'logic'].includes(category.text) ||
        !label ||
        !ts.isStringLiteral(label) ||
        !label.text.trim() ||
        !correct ||
        !ts.isStringLiteral(correct) ||
        !choices ||
        !ts.isArrayLiteralExpression(choices)
      )
        return false;
      const values = choices.elements.map(unwrap);
      if (
        values.length !== 2 ||
        !values.every((value) => ts.isStringLiteral(value)) ||
        !values.some((value) => text(value, correct.text))
      )
        return false;
      counts[category.text === 'web' ? 'web' : 'logic'] += 1;
      return true;
    }) &&
    counts.web === 2 &&
    counts.logic === 2
  );
}

function initialState(role: FunctionRole | undefined): boolean {
  const body = statements(role);
  const fields = properties(returned(body[0]));
  return (
    body.length === 1 &&
    fields?.size === 3 &&
    numeric(fields.get('index'), 0) &&
    numeric(fields.get('score'), 0) &&
    keyword(fields.get('answered'), ts.SyntaxKind.FalseKeyword)
  );
}

function stateUpdate(role: FunctionRole | undefined, advancing: boolean): boolean {
  if (!role) return false;
  const [state, question, choice] = role.params;
  const body = statements(role);
  const guard = body[0];
  if (!state || !guard || !ts.isIfStatement(guard) || guard.elseStatement) return false;
  const condition = unwrap(guard.expression);
  const checked = advancing
    ? ts.isPrefixUnaryExpression(condition) &&
      condition.operator === ts.SyntaxKind.ExclamationToken &&
      access(condition.operand, state, 'answered')
    : access(condition, state, 'answered');
  if (!checked || !id(returned(guard.thenStatement), state)) return false;
  let expression = returned(body.at(-1));
  const binding = body.length === 3 ? local(body[1]) : undefined;
  if (binding && id(expression, (binding.name as ts.Identifier).text))
    expression = binding.initializer;
  else if (body.length !== 2) return false;
  const fields = properties(expression);
  if (
    fields?.size !== 3 ||
    !keyword(
      fields.get('answered'),
      advancing ? ts.SyntaxKind.FalseKeyword : ts.SyntaxKind.TrueKeyword,
    )
  )
    return false;
  if (advancing)
    return (
      binary(
        fields.get('index'),
        ts.SyntaxKind.PlusToken,
        (value) => access(value, state, 'index'),
        (value) => numeric(value, 1),
      ) && access(fields.get('score'), state, 'score')
    );
  if (!question || !choice || !access(fields.get('index'), state, 'index')) return false;
  return binary(
    fields.get('score'),
    ts.SyntaxKind.PlusToken,
    (value) => access(value, state, 'score'),
    (value) => {
      const count = unwrap(value);
      if (!ts.isConditionalExpression(count)) return false;
      return (
        (binary(
          count.condition,
          ts.SyntaxKind.EqualsEqualsEqualsToken,
          (operand) => id(operand, choice),
          (operand) => access(operand, question, 'correct'),
        ) &&
          numeric(count.whenTrue, 1) &&
          numeric(count.whenFalse, 0)) ||
        (binary(
          count.condition,
          ts.SyntaxKind.ExclamationEqualsEqualsToken,
          (operand) => id(operand, choice),
          (operand) => access(operand, question, 'correct'),
        ) &&
          numeric(count.whenTrue, 0) &&
          numeric(count.whenFalse, 1))
      );
    },
  );
}

/** OR/ANDの同じ条件群は順序と括弧を無視する。型の安全な順序は実Compilerも確認する。 */
function clauses(node: ts.Expression, operator: ts.SyntaxKind): readonly ts.Expression[] {
  const value = unwrap(node);
  return ts.isBinaryExpression(value) && value.operatorToken.kind === operator
    ? [...clauses(value.left, operator), ...clauses(value.right, operator)]
    : [value];
}

function matchesConditions(
  values: readonly ts.Expression[],
  tests: readonly ((node: ts.Expression) => boolean)[],
): boolean {
  const used = new Set<number>();
  return (
    values.length === tests.length &&
    tests.every((test) => {
      const index = values.findIndex((value, index) => !used.has(index) && test(value));
      if (index < 0) return false;
      used.add(index);
      return true;
    })
  );
}

function missing(node: ts.Expression, property: string, value: string): boolean {
  const expression = unwrap(node);
  return (
    ts.isPrefixUnaryExpression(expression) &&
    expression.operator === ts.SyntaxKind.ExclamationToken &&
    binary(
      expression.operand,
      ts.SyntaxKind.InKeyword,
      (operand) => text(operand, property),
      (operand) => id(operand, value),
    )
  );
}

function wrongType(
  node: ts.Expression,
  expression: (node: ts.Expression) => boolean,
  expected: string,
): boolean {
  return binary(
    node,
    ts.SyntaxKind.ExclamationEqualsEqualsToken,
    (value) => ts.isTypeOfExpression(value) && expression(value.expression),
    (value) => text(value, expected),
  );
}

/** 同じ失敗条件を連続したearly returnへ分ける別解を扱い、余分な処理は拒否する。 */
function invalidReturns(
  guards: readonly ts.Statement[],
  tests: readonly ((node: ts.Expression) => boolean)[],
): boolean {
  if (
    guards.length === 0 ||
    guards.some(
      (statement) =>
        !ts.isIfStatement(statement) ||
        statement.elseStatement ||
        !id(returned(statement.thenStatement), 'undefined'),
    )
  )
    return false;
  return matchesConditions(
    guards.flatMap((statement) =>
      clauses((statement as ts.IfStatement).expression, ts.SyntaxKind.BarBarToken),
    ),
    tests,
  );
}

function decode(role: FunctionRole | undefined): boolean {
  if (!role) return false;
  const value = role.params[0];
  const body = statements(role);
  const firstIndex = body.findIndex((statement) => !!local(statement));
  if (!value || firstIndex < 1) return false;
  const first = local(body[firstIndex]);
  const second = local(body[firstIndex + 1]);
  const beforeChoices = body.slice(0, firstIndex);
  const afterChoices = body.slice(firstIndex + 2, -1);
  const wrongLength = (node: ts.Expression) =>
    binary(
      node,
      ts.SyntaxKind.ExclamationEqualsEqualsToken,
      (operand) => access(operand, value, 'choices', 'length'),
      (operand) => numeric(operand, 2),
    );
  if (
    !first?.initializer ||
    !second?.initializer ||
    !keyword(first.type, ts.SyntaxKind.UnknownKeyword) ||
    !keyword(second.type, ts.SyntaxKind.UnknownKeyword)
  )
    return false;
  const choice = (node: ts.Expression, index: number) => {
    const item = unwrap(node);
    return (
      ts.isElementAccessExpression(item) &&
      access(item.expression, value, 'choices') &&
      numeric(item.argumentExpression, index)
    );
  };
  if (!choice(first.initializer, 0) || !choice(second.initializer, 1)) return false;
  const a = (first.name as ts.Identifier).text;
  const b = (second.name as ts.Identifier).text;
  const beforeTests: readonly ((node: ts.Expression) => boolean)[] = [
    (node) => wrongType(node, (operand) => id(operand, value), 'object'),
    (node) =>
      binary(
        node,
        ts.SyntaxKind.EqualsEqualsEqualsToken,
        (operand) => id(operand, value),
        (operand) => keyword(operand, ts.SyntaxKind.NullKeyword),
      ),
    (node) => missing(node, 'category', value),
    (node) => {
      const values = clauses(node, ts.SyntaxKind.AmpersandAmpersandToken);
      return (
        values.length === 2 &&
        ['web', 'logic'].every((category) =>
          values.some((valueNode) =>
            binary(
              valueNode,
              ts.SyntaxKind.ExclamationEqualsEqualsToken,
              (operand) => access(operand, value, 'category'),
              (operand) => text(operand, category),
            ),
          ),
        )
      );
    },
    (node) => missing(node, 'text', value),
    (node) => wrongType(node, (operand) => access(operand, value, 'text'), 'string'),
    (node) => missing(node, 'choices', value),
    (node) => {
      const expression = unwrap(node);
      if (
        !ts.isPrefixUnaryExpression(expression) ||
        expression.operator !== ts.SyntaxKind.ExclamationToken
      )
        return false;
      const called = unwrap(expression.operand);
      return (
        ts.isCallExpression(called) &&
        access(called.expression, 'Array', 'isArray') &&
        called.arguments.length === 1 &&
        access(called.arguments[0], value, 'choices')
      );
    },
    (node) => missing(node, 'correct', value),
    (node) => wrongType(node, (operand) => access(operand, value, 'correct'), 'string'),
  ];
  const afterTests: readonly ((node: ts.Expression) => boolean)[] = [
    (node) => wrongType(node, (operand) => id(operand, a), 'string'),
    (node) => wrongType(node, (operand) => id(operand, b), 'string'),
    (node) => {
      const values = clauses(node, ts.SyntaxKind.AmpersandAmpersandToken);
      return (
        values.length === 2 &&
        [a, b].every((choice) =>
          values.some((valueNode) =>
            binary(
              valueNode,
              ts.SyntaxKind.ExclamationEqualsEqualsToken,
              (operand) => access(operand, value, 'correct'),
              (operand) => id(operand, choice),
            ),
          ),
        )
      );
    },
  ];
  // 配列長の確認は要素を読む前後のどちらでも同じ失敗条件を保つ。
  if (!(
    (invalidReturns(beforeChoices, beforeTests) &&
      invalidReturns(afterChoices, [...afterTests, wrongLength])) ||
    (invalidReturns(beforeChoices, [...beforeTests, wrongLength]) &&
      invalidReturns(afterChoices, afterTests))
  ))
    return false;
  const fields = properties(returned(body.at(-1)));
  const choices = fields?.get('choices');
  const array = choices && unwrap(choices);
  return (
    fields?.size === 4 &&
    ['category', 'text', 'correct'].every((field) => access(fields.get(field), value, field)) &&
    !!array &&
    ts.isArrayLiteralExpression(array) &&
    array.elements.length === 2 &&
    id(array.elements[0], a) &&
    id(array.elements[1], b)
  );
}

function resultObject(
  node: ts.Expression | undefined,
  kind: string,
  field?: [string, (node: ts.Expression) => boolean],
): boolean {
  const fields = properties(node);
  return (
    !!fields &&
    fields.size === (field ? 2 : 1) &&
    text(fields.get('kind'), kind) &&
    (!field || (!!fields.get(field[0]) && field[1](fields.get(field[0])!)))
  );
}

function load(role: FunctionRole | undefined): boolean {
  if (!role) return false;
  const body = statements(role);
  const attempt = body[0];
  const mode = role.params[0];
  if (
    !mode ||
    body.length !== 1 ||
    !attempt ||
    !ts.isTryStatement(attempt) ||
    attempt.finallyBlock ||
    !attempt.catchClause?.variableDeclaration ||
    !keyword(attempt.catchClause.variableDeclaration.type, ts.SyntaxKind.UnknownKeyword) ||
    !ts.isIdentifier(attempt.catchClause.variableDeclaration.name)
  )
    return false;
  const tryBody = attempt.tryBlock.statements;
  const source = local(tryBody[0]);
  const target = local(tryBody[1]);
  const loading = source?.initializer && unwrap(source.initializer);
  const empty = target?.initializer && unwrap(target.initializer);
  const loop = tryBody[2];
  if (
    tryBody.length !== 4 ||
    !source ||
    !loading ||
    !ts.isAwaitExpression(loading) ||
    !call(loading.expression, 'loadQuestions', [mode]) ||
    !target ||
    !empty ||
    !arrayType(target.type, 'Question', false) ||
    !ts.isArrayLiteralExpression(empty) ||
    empty.elements.length !== 0 ||
    !loop ||
    !ts.isForOfStatement(loop) ||
    loop.awaitModifier ||
    !ts.isVariableDeclarationList(loop.initializer) ||
    !(loop.initializer.flags & ts.NodeFlags.Const) ||
    loop.initializer.declarations.length !== 1 ||
    !ts.isIdentifier(loop.initializer.declarations[0]!.name) ||
    !ts.isBlock(loop.statement)
  )
    return false;
  const sourceName = (source.name as ts.Identifier).text;
  const targetName = (target.name as ts.Identifier).text;
  const value = loop.initializer.declarations[0]!.name.text;
  const inside = loop.statement.statements;
  const decoded = local(inside[0]);
  if (
    !id(loop.expression, sourceName) ||
    inside.length !== 3 ||
    !decoded?.initializer ||
    !call(decoded.initializer, 'decodeQuestion', [value])
  )
    return false;
  const decodedName = (decoded.name as ts.Identifier).text;
  const guard = inside[1];
  const pushed = inside[2];
  const push = pushed && ts.isExpressionStatement(pushed) ? unwrap(pushed.expression) : undefined;
  if (
    !guard ||
    !ts.isIfStatement(guard) ||
    guard.elseStatement ||
    !binary(
      guard.expression,
      ts.SyntaxKind.EqualsEqualsEqualsToken,
      (operand) => id(operand, decodedName),
      (operand) => id(operand, 'undefined'),
    ) ||
    !resultObject(returned(guard.thenStatement), 'invalid') ||
    !push ||
    !ts.isCallExpression(push) ||
    !access(push.expression, targetName, 'push') ||
    push.arguments.length !== 1 ||
    !id(push.arguments[0], decodedName) ||
    !resultObject(returned(tryBody[3]), 'ready', ['questions', (node) => id(node, targetName)])
  )
    return false;
  const error = attempt.catchClause.variableDeclaration.name.text;
  const catchBody = attempt.catchClause.block.statements;
  const errorGuard = catchBody[0];
  const isError = (node: ts.Expression) =>
    binary(
      node,
      ts.SyntaxKind.InstanceOfKeyword,
      (operand) => id(operand, error),
      (operand) => id(operand, 'Error'),
    );
  if (catchBody.length === 1)
    return resultObject(returned(catchBody[0]), 'failed', [
      'message',
      (node) => {
        const message = unwrap(node);
        return (
          ts.isConditionalExpression(message) &&
          isError(message.condition) &&
          access(message.whenTrue, error, 'message') &&
          text(message.whenFalse, '不明な失敗です')
        );
      },
    ]);
  return (
    catchBody.length === 2 &&
    !!errorGuard &&
    ts.isIfStatement(errorGuard) &&
    !errorGuard.elseStatement &&
    isError(errorGuard.expression) &&
    resultObject(returned(errorGuard.thenStatement), 'failed', [
      'message',
      (node) => access(node, error, 'message'),
    ]) &&
    resultObject(returned(catchBody[1]), 'failed', [
      'message',
      (node) => text(node, '不明な失敗です'),
    ])
  );
}

function readButton(role: FunctionRole | undefined): boolean {
  if (!role) return false;
  const event = role.params[0];
  const body = statements(role);
  const binding = local(body[0]);
  if (
    !event ||
    body.length !== 2 ||
    !binding?.initializer ||
    !access(binding.initializer, event, 'currentTarget')
  )
    return false;
  const target = (binding.name as ts.Identifier).text;
  const output = returned(body[1]);
  return (
    !!output &&
    ts.isConditionalExpression(output) &&
    binary(
      output.condition,
      ts.SyntaxKind.InstanceOfKeyword,
      (operand) => id(operand, target),
      (operand) => id(operand, 'HTMLButtonElement'),
    ) &&
    id(output.whenTrue, target) &&
    id(output.whenFalse, 'undefined')
  );
}

/** 対象工程だけを評価し、未来のTODOを過去工程の合格と取り違えない。 */
export function inspectQuizProject(
  source: ts.SourceFile,
  profile: TypeScriptQuizProjectProfile,
): QuizProjectInspection {
  const types = new Map<string, ts.InterfaceDeclaration | ts.TypeAliasDeclaration>();
  const functions = new Map<string, FunctionRole>();
  const imports = new Map<string, string>();
  let data: ts.VariableDeclaration | undefined;
  let mounted = false;
  let marker = false;
  let accepted = true;
  for (const statement of source.statements) {
    if (
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      statement.importClause?.namedBindings &&
      ts.isNamedImports(statement.importClause.namedBindings) &&
      statement.importClause.namedBindings.elements.length === 1 &&
      statement.importClause.phaseModifier === undefined &&
      !statement.importClause.name
    ) {
      const specifier = statement.importClause.namedBindings.elements[0]!;
      const imported = specifier.propertyName?.text ?? specifier.name.text;
      if (specifier.name.text !== imported || specifier.isTypeOnly || imports.has(imported))
        accepted = false;
      imports.set(imported, statement.moduleSpecifier.text);
    } else if (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) {
      if (
        types.has(statement.name.text) ||
        !statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ||
        statement.modifiers.some((modifier) => modifier.kind !== ts.SyntaxKind.ExportKeyword)
      )
        accepted = false;
      types.set(statement.name.text, statement);
    } else {
      const role = functionRole(statement);
      if (role) {
        if (functions.has(role[0])) accepted = false;
        functions.set(...role);
      } else if (ts.isVariableStatement(statement)) {
        const declaration = local(statement);
        if (data || !declaration || !id(declaration.name, 'questions')) accepted = false;
        else data = declaration;
      } else if (ts.isExpressionStatement(statement)) {
        const expression = unwrap(statement.expression);
        if (!ts.isCallExpression(expression)) {
          accepted = false;
          continue;
        }
        if (
          id(expression.expression, 'mountQuiz') &&
          expression.arguments.length === 1 &&
          !mounted
        ) {
          const fields = properties(expression.arguments[0]);
          mounted =
            !!fields &&
            fields.size === 6 &&
            ['questions', 'createState', 'answer', 'advance', 'readButton'].every((name) =>
              id(fields.get(name), name),
            ) &&
            id(fields.get('load'), 'readQuestions');
          if (!mounted) accepted = false;
        } else if (
          access(expression.expression, 'console', 'log') &&
          expression.arguments.length === 1 &&
          text(expression.arguments[0], '準備できました') &&
          !marker
        )
          marker = true;
        else accepted = false;
      } else accepted = false;
    }
  }
  const union = (name: string) => (node: ts.TypeNode | undefined) =>
    !!node &&
    ts.isUnionTypeNode(node) &&
    node.types.length === 2 &&
    node.types.some((type) => reference(type, name)) &&
    node.types.some((type) => keyword(type, ts.SyntaxKind.UndefinedKeyword));
  const signatures =
    functions.size === 6 &&
    signature(functions.get('createState'), [], (node) => reference(node, 'QuizState')) &&
    signature(
      functions.get('answer'),
      ['QuizState', 'Question', ts.SyntaxKind.StringKeyword],
      (node) => reference(node, 'QuizState'),
    ) &&
    signature(functions.get('advance'), ['QuizState'], (node) => reference(node, 'QuizState')) &&
    signature(functions.get('decodeQuestion'), [ts.SyntaxKind.UnknownKeyword], union('Question')) &&
    signature(
      functions.get('readQuestions'),
      ['LoadMode'],
      (node) =>
        !!node &&
        ts.isTypeReferenceNode(node) &&
        id(node.typeName, 'Promise') &&
        node.typeArguments?.length === 1 &&
        reference(node.typeArguments[0], 'LoadResult'),
      true,
    ) &&
    signature(functions.get('readButton'), ['Event'], union('HTMLButtonElement'));
  const programShapeAccepted =
    accepted &&
    mounted &&
    marker &&
    types.size === 5 &&
    imports.size === 2 &&
    imports.get('mountQuiz') === './quiz-ui.js' &&
    imports.get('loadQuestions') === './questions.js' &&
    signatures;
  const typeContractAccepted = typeContract(types);
  const fullLoad = load(functions.get('readQuestions')) && decode(functions.get('decodeQuestion'));
  const stubBody = statements(functions.get('readQuestions'));
  const dataLinked =
    dataValues(data) &&
    initialState(functions.get('createState')) &&
    readButton(functions.get('readButton')) &&
    (fullLoad ||
      (stubBody.length === 1 &&
        resultObject(returned(stubBody[0]), 'ready', [
          'questions',
          (node) => id(node, 'questions'),
        ])));
  const stateCorrect =
    stateUpdate(functions.get('answer'), false) && stateUpdate(functions.get('advance'), true);
  return {
    programShapeAccepted,
    typeContractAccepted,
    usesLearningValues:
      dataLinked &&
      (profile === 'quiz-data-v1' || (stateCorrect && (profile === 'quiz-state-v1' || fullLoad))),
  };
}
