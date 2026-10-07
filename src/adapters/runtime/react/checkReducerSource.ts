import ts from 'typescript';
import type { TypeScriptDiagnostic } from '../typescript/compileTypeScript';

export interface ReducerFacts {
  readonly usesPureReducer: boolean;
  readonly changesNameFromAction: boolean;
  readonly submitsCurrentName: boolean;
  readonly resetsInitialState: boolean;
  readonly returnsFreshState: boolean;
}

type Scalar = string | boolean | symbol;
interface RecordValue {
  readonly fields: ReadonlyMap<string, Scalar>;
  readonly fresh: boolean;
}
type Value = Scalar | RecordValue;
const ACTIONS = ['nameChanged', 'submitted', 'reset'] as const;
const STATE_NAME = Symbol('state.name');
const INPUT_NAME = Symbol('action.nextName');
const STATE_ATTEMPTED = Symbol('state.attempted');

/**
 * 3つの既知actionについて、純粋な次Stateの値の由来を有限ASTで追う。
 * 任意JSを実行せず、全分岐の構文検査と元Sourceの型検査を別々に行う。
 */
export function analyzeReducer(sourceText: string): {
  readonly diagnostics: readonly TypeScriptDiagnostic[];
  readonly facts: ReducerFacts;
} {
  const source = ts.createSourceFile('reducer.ts', sourceText, ts.ScriptTarget.ES2023, true);
  const diagnostics: TypeScriptDiagnostic[] = [];
  const empty: ReducerFacts = {
    usesPureReducer: false,
    changesNameFromAction: false,
    submitsCurrentName: false,
    resetsInitialState: false,
    returnsFreshState: false,
  };
  const reject = (
    node: ts.Node,
    message = 'この課題のReducerは3つのactionから純粋な次Stateだけを返します。',
  ): void => {
    if (diagnostics.length >= 50) return;
    const { line, character } = source.getLineAndCharacterOfPosition(node.getStart(source));
    if (
      diagnostics.some(
        (item) =>
          item.line === line + 1 && item.column === character + 1 && item.message === message,
      )
    )
      return;
    diagnostics.push({
      code: 0,
      file: 'reducer.ts',
      line: line + 1,
      column: character + 1,
      message,
    });
  };
  // 到達しない分岐にも能力を隠せないよう、評価より先に元Source全体を検査する。
  const stack: ts.Node[] = [source];
  let count = 0;
  while (stack.length && count <= 2048) {
    const node = stack.pop()!;
    count++;
    if (
      ts.isCallExpression(node) ||
      ts.isNewExpression(node) ||
      ts.isAsExpression(node) ||
      ts.isTypeAssertionExpression(node) ||
      ts.isNonNullExpression(node) ||
      node.kind === ts.SyntaxKind.AnyKeyword ||
      ts.isAwaitExpression(node) ||
      ts.isYieldExpression(node) ||
      ts.isPrefixUnaryExpression(node) ||
      ts.isPostfixUnaryExpression(node)
    )
      reject(node);
    ts.forEachChild(node, (child) => {
      stack.push(child);
    });
  }
  if (count > 2048 || /@ts-(?:ignore|expect-error|nocheck)\b/u.test(sourceText))
    reject(source, '構文上限を守り、型検査を無効にしないでください。');
  const aliases = new Map<string, string>();
  let reducer: ts.FunctionDeclaration | undefined;
  for (const statement of source.statements) {
    if (ts.isImportDeclaration(statement)) {
      const clause = statement.importClause;
      if (
        !ts.isStringLiteral(statement.moduleSpecifier) ||
        statement.moduleSpecifier.text !== './types' ||
        clause?.phaseModifier !== ts.SyntaxKind.TypeKeyword ||
        clause.name ||
        !clause.namedBindings ||
        !ts.isNamedImports(clause.namedBindings)
      ) {
        reject(statement);
        continue;
      }
      for (const binding of clause.namedBindings.elements) {
        const original = binding.propertyName?.text ?? binding.name.text;
        if (!['FormState', 'FormAction'].includes(original) || aliases.has(binding.name.text))
          reject(binding);
        else aliases.set(binding.name.text, original);
      }
    } else if (
      ts.isFunctionDeclaration(statement) &&
      statement.name?.text === 'reduceForm' &&
      statement.body &&
      !reducer &&
      !statement.asteriskToken &&
      !statement.typeParameters &&
      statement.modifiers?.length === 1 &&
      statement.modifiers[0]?.kind === ts.SyntaxKind.ExportKeyword
    )
      reducer = statement;
    else reject(statement);
  }
  const typeName = (node: ts.TypeNode | undefined): string | undefined =>
    node && ts.isTypeReferenceNode(node) && ts.isIdentifier(node.typeName) && !node.typeArguments
      ? aliases.get(node.typeName.text)
      : undefined;
  if (
    !reducer?.body ||
    reducer.parameters.length !== 2 ||
    typeName(reducer.parameters[0]?.type) !== 'FormState' ||
    typeName(reducer.parameters[1]?.type) !== 'FormAction' ||
    typeName(reducer.type) !== 'FormState' ||
    reducer.parameters.some(
      (parameter) =>
        !ts.isIdentifier(parameter.name) ||
        parameter.initializer ||
        parameter.dotDotDotToken ||
        parameter.questionToken ||
        parameter.modifiers,
    )
  ) {
    reject(source, '用意済みのFormStateとFormActionを使ってreduceFormを定義してください。');
    return { diagnostics, facts: empty };
  }
  const stateName = reducer.parameters[0]!.name.getText(source);
  const actionName = reducer.parameters[1]!.name.getText(source);
  if (stateName === actionName || aliases.has(stateName) || aliases.has(actionName))
    reject(reducer);
  const record = (fields: readonly (readonly [string, Scalar])[], fresh: boolean): RecordValue => ({
    fields: new Map(fields),
    fresh,
  });
  const isRecord = (item: Value | undefined): item is RecordValue =>
    !!item && typeof item === 'object';
  const expression = (node: ts.Expression, values: Map<string, Value>): Value | undefined => {
    if (ts.isParenthesizedExpression(node)) return expression(node.expression, values);
    if (ts.isStringLiteral(node)) return node.text;
    if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
    if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
    if (ts.isIdentifier(node) && values.has(node.text)) return values.get(node.text);
    if (ts.isPropertyAccessExpression(node)) {
      const receiver = expression(node.expression, values);
      if (isRecord(receiver) && receiver.fields.has(node.name.text))
        return receiver.fields.get(node.name.text);
    }
    if (ts.isObjectLiteralExpression(node)) {
      const fields = new Map<string, Scalar>();
      for (const property of node.properties) {
        if (ts.isSpreadAssignment(property)) {
          const spread = expression(property.expression, values);
          if (
            !isRecord(spread) ||
            [...spread.fields.keys()].some((key) => !['name', 'attempted'].includes(key))
          )
            reject(property);
          else for (const [key, item] of spread.fields) fields.set(key, item);
        } else if (
          ts.isPropertyAssignment(property) ||
          ts.isShorthandPropertyAssignment(property)
        ) {
          const key =
            ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)
              ? property.name.text
              : undefined;
          const item = ts.isPropertyAssignment(property)
            ? expression(property.initializer, values)
            : expression(property.name, values);
          if (
            !key ||
            !['name', 'attempted'].includes(key) ||
            item === undefined ||
            isRecord(item) ||
            (ts.isShorthandPropertyAssignment(property) && property.objectAssignmentInitializer)
          )
            reject(property);
          else fields.set(key, item);
        } else reject(property);
      }
      return { fields, fresh: true };
    }
    reject(node);
    return undefined;
  };
  const condition = (node: ts.Expression, values: Map<string, Value>): boolean | undefined => {
    if (ts.isParenthesizedExpression(node)) return condition(node.expression, values);
    if (
      ts.isBinaryExpression(node) &&
      [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken].includes(
        node.operatorToken.kind,
      )
    ) {
      const left = expression(node.left, values);
      const right = expression(node.right, values);
      // 比較元は必ずaction.type。任意の固定true分岐やname比較へ拡張しない。
      const typeRead = (item: ts.Expression): boolean =>
        ts.isPropertyAccessExpression(item) &&
        ts.isIdentifier(item.expression) &&
        item.expression.text === actionName &&
        item.name.text === 'type';
      const literal = (item: ts.Expression): boolean =>
        ts.isStringLiteral(item) && ACTIONS.some((action) => action === item.text);
      if (
        (typeRead(node.left) && literal(node.right)) ||
        (typeRead(node.right) && literal(node.left))
      )
        return node.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken
          ? left === right
          : left !== right;
    }
    reject(node);
    return undefined;
  };
  let visits = 0;
  const run = (
    statements: readonly ts.Statement[],
    values: Map<string, Value>,
  ): Value | undefined => {
    if (++visits > 8192) {
      reject(source, '分岐を短く分けてください。');
      return undefined;
    }
    let output: Value | undefined;
    for (const statement of statements) {
      if (output !== undefined) {
        validate(statement, new Map(values));
        continue;
      }
      if (ts.isReturnStatement(statement) && statement.expression)
        output = expression(statement.expression, values);
      else if (ts.isBlock(statement)) output = run(statement.statements, new Map(values));
      else if (
        ts.isVariableStatement(statement) &&
        statement.declarationList.flags === ts.NodeFlags.Const &&
        !statement.modifiers
      ) {
        for (const declaration of statement.declarationList.declarations) {
          if (
            !ts.isIdentifier(declaration.name) ||
            values.has(declaration.name.text) ||
            aliases.has(declaration.name.text) ||
            !declaration.initializer ||
            declaration.type
          ) {
            reject(declaration);
            continue;
          }
          const item = expression(declaration.initializer, values);
          if (item !== undefined) values.set(declaration.name.text, item);
        }
      } else if (ts.isIfStatement(statement)) {
        const matches = condition(statement.expression, values);
        // 実actionの経路とは別に、両側の能力を検査する。
        validate(statement.thenStatement, new Map(values));
        if (statement.elseStatement) validate(statement.elseStatement, new Map(values));
        const branch = matches ? statement.thenStatement : statement.elseStatement;
        if (branch) output = run([branch], new Map(values));
      } else if (ts.isSwitchStatement(statement)) {
        if (
          !ts.isPropertyAccessExpression(statement.expression) ||
          !ts.isIdentifier(statement.expression.expression) ||
          statement.expression.expression.text !== actionName ||
          statement.expression.name.text !== 'type'
        )
          reject(statement.expression);
        const selected = expression(statement.expression, values);
        const cases = new Set<string>();
        let found: readonly ts.Statement[] | undefined;
        let fallback: readonly ts.Statement[] | undefined;
        for (const clause of statement.caseBlock.clauses) {
          if (ts.isCaseClause(clause)) {
            if (
              !ts.isStringLiteral(clause.expression) ||
              !ACTIONS.includes(clause.expression.text as (typeof ACTIONS)[number]) ||
              cases.has(clause.expression.getText(source))
            )
              reject(clause);
            cases.add(clause.expression.getText(source));
            if (ts.isStringLiteral(clause.expression) && clause.expression.text === selected)
              found = clause.statements;
          } else if (fallback) reject(clause);
          else fallback = clause.statements;
          run(clause.statements, new Map(values));
        }
        if (found ?? fallback) output = run((found ?? fallback)!, new Map(values));
      } else reject(statement);
    }
    return output;
  };
  // 全分岐の構文を検査する。呼出し・代入・ループなどは到達性にかかわらず拒否する。
  const validate = (statement: ts.Statement, values: Map<string, Value>): void => {
    if (ts.isBlock(statement)) {
      run(statement.statements, values);
      return;
    }
    if (ts.isIfStatement(statement)) {
      condition(statement.expression, values);
      validate(statement.thenStatement, new Map(values));
      if (statement.elseStatement) validate(statement.elseStatement, new Map(values));
      return;
    }
    if (ts.isSwitchStatement(statement)) {
      run([statement], values);
      return;
    }
    run([statement], values);
  };
  const results = ACTIONS.map((action) => {
    const values = new Map<string, Value>([
      [
        stateName,
        record(
          [
            ['name', STATE_NAME],
            ['attempted', STATE_ATTEMPTED],
          ],
          false,
        ),
      ],
      [
        actionName,
        record(
          [
            ['type', action],
            ['nextName', INPUT_NAME],
          ],
          false,
        ),
      ],
    ]);
    return run(reducer.body!.statements, values);
  });
  const matches = (item: Value | undefined, name: Scalar, attempted: boolean): boolean =>
    isRecord(item) &&
    item.fresh &&
    item.fields.size === 2 &&
    item.fields.get('name') === name &&
    item.fields.get('attempted') === attempted;
  return {
    diagnostics,
    facts: {
      usesPureReducer: diagnostics.length === 0,
      changesNameFromAction: matches(results[0], INPUT_NAME, false),
      submitsCurrentName: matches(results[1], STATE_NAME, true),
      resetsInitialState: matches(results[2], '', false),
      returnsFreshState: results.every((item) => isRecord(item) && item.fresh),
    },
  };
}
