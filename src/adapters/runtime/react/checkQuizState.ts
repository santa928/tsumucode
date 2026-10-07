import ts from 'typescript';
import type { TypeScriptDiagnostic } from '../typescript/compileTypeScript';

export interface QuizStateFacts {
  readonly createsInitialState: boolean;
  readonly scoresActualAnswer: boolean;
  readonly guardsRepeatedAnswer: boolean;
  readonly advancesAnsweredQuestion: boolean;
  readonly usesPureStateFunctions: boolean;
}

type Scalar = number | string | boolean;
interface StateValue {
  readonly fields: ReadonlyMap<string, Scalar>;
  readonly fresh: boolean;
}
type Value = Scalar | StateValue;
const FIELDS = ['index', 'score', 'answered'];

/**
 * 固定クイズの3関数だけを有限ASTで検査する。任意JavaScriptは実行しない。
 * 正誤・回答済みの全組合せを確認し、到達しない分岐の能力も拒否する。
 */
export function analyzeQuizState(
  sourceText: string,
  practice: boolean,
): {
  readonly diagnostics: readonly TypeScriptDiagnostic[];
  readonly facts: QuizStateFacts;
} {
  const source = ts.createSourceFile('quizState.ts', sourceText, ts.ScriptTarget.ES2023, true);
  const diagnostics: TypeScriptDiagnostic[] = [];
  const empty: QuizStateFacts = {
    createsInitialState: false,
    scoresActualAnswer: false,
    guardsRepeatedAnswer: false,
    advancesAnsweredQuestion: false,
    usesPureStateFunctions: false,
  };
  const reject = (
    node: ts.Node,
    message = 'この課題では純粋なクイズState関数だけを定義します。',
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
      file: 'quizState.ts',
      line: line + 1,
      column: character + 1,
      message,
    });
  };
  const stack: ts.Node[] = [source];
  let nodes = 0;
  while (stack.length && nodes <= 2048) {
    const node = stack.pop()!;
    nodes++;
    if (
      ts.isCallExpression(node) ||
      ts.isNewExpression(node) ||
      ts.isAsExpression(node) ||
      ts.isTypeAssertionExpression(node) ||
      ts.isNonNullExpression(node) ||
      node.kind === ts.SyntaxKind.AnyKeyword ||
      ts.isAwaitExpression(node) ||
      ts.isYieldExpression(node) ||
      ts.isPostfixUnaryExpression(node)
    )
      reject(node);
    ts.forEachChild(node, (child) => {
      stack.push(child);
    });
  }
  if (nodes > 2048 || /@ts-(?:ignore|expect-error|nocheck)\b/u.test(sourceText))
    reject(source, '構文上限を守り、型検査を無効にしないでください。');

  const aliases = new Map<string, string>();
  const functions = new Map<string, ts.FunctionDeclaration>();
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
        if (!['QuizState', 'Question'].includes(original) || aliases.has(binding.name.text))
          reject(binding);
        else aliases.set(binding.name.text, original);
      }
    } else if (
      ts.isFunctionDeclaration(statement) &&
      statement.name &&
      statement.body &&
      ['createState', 'answer', 'advance'].includes(statement.name.text) &&
      !functions.has(statement.name.text) &&
      !statement.asteriskToken &&
      !statement.typeParameters &&
      statement.modifiers?.length === 1 &&
      statement.modifiers[0]?.kind === ts.SyntaxKind.ExportKeyword
    )
      functions.set(statement.name.text, statement);
    else reject(statement);
  }
  const typeName = (node: ts.TypeNode | undefined): string | undefined => {
    if (node?.kind === ts.SyntaxKind.StringKeyword) return 'string';
    return node &&
      ts.isTypeReferenceNode(node) &&
      ts.isIdentifier(node.typeName) &&
      !node.typeArguments
      ? aliases.get(node.typeName.text)
      : undefined;
  };
  const expected: Readonly<Record<string, readonly string[]>> = {
    createState: [],
    answer: ['QuizState', 'Question', 'string'],
    advance: ['QuizState'],
  };
  for (const [name, types] of Object.entries(expected)) {
    const fn = functions.get(name);
    if (
      !fn ||
      typeName(fn.type) !== 'QuizState' ||
      fn.parameters.length !== types.length ||
      fn.parameters.some(
        (parameter, index) =>
          typeName(parameter.type) !== types[index] ||
          !ts.isIdentifier(parameter.name) ||
          !!parameter.initializer ||
          !!parameter.dotDotDotToken ||
          !!parameter.questionToken ||
          !!parameter.modifiers ||
          aliases.has(parameter.name.getText(source)),
      ) ||
      new Set(fn.parameters.map((parameter) => parameter.name.getText(source))).size !==
        types.length
    )
      reject(fn ?? source, '用意済みの型でcreateState、answer、advanceを定義してください。');
  }
  if (diagnostics.length) return { diagnostics, facts: empty };

  const record = (index: number, score: number, answered: boolean, fresh: boolean): StateValue => ({
    fields: new Map<string, Scalar>([
      ['index', index],
      ['score', score],
      ['answered', answered],
    ]),
    fresh,
  });
  const isRecord = (value: Value | undefined): value is StateValue =>
    !!value && typeof value === 'object';
  const unwrap = (node: ts.Expression): ts.Expression =>
    ts.isParenthesizedExpression(node) ? unwrap(node.expression) : node;
  let visits = 0;

  const execute = (fn: ts.FunctionDeclaration, args: readonly Value[]): Value | undefined => {
    const values = new Map(
      fn.parameters.map((parameter, index) => [parameter.name.getText(source), args[index]!]),
    );
    const stateName = fn.parameters[0]?.name.getText(source);
    const questionName =
      fn.name?.text === 'answer' ? fn.parameters[1]?.name.getText(source) : undefined;
    const choiceName =
      fn.name?.text === 'answer' ? fn.parameters[2]?.name.getText(source) : undefined;
    const condition = (original: ts.Expression, scope: Map<string, Value>): boolean | undefined => {
      const node = unwrap(original);
      if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.ExclamationToken) {
        const value = condition(node.operand, scope);
        return value === undefined ? undefined : !value;
      }
      if (
        ts.isPropertyAccessExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === stateName &&
        node.name.text === 'answered'
      ) {
        const state = scope.get(stateName);
        if (isRecord(state)) return state.fields.get('answered') === true;
      }
      if (ts.isIdentifier(node) && typeof scope.get(node.text) === 'boolean')
        return scope.get(node.text) as boolean;
      if (ts.isBinaryExpression(node)) {
        if (
          [ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken].includes(
            node.operatorToken.kind,
          )
        ) {
          const left = condition(node.left, scope),
            right = condition(node.right, scope);
          if (left !== undefined && right !== undefined)
            return node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken
              ? left && right
              : left || right;
        }
        const isChoice = (item: ts.Expression): boolean => {
          const value = unwrap(item);
          return ts.isIdentifier(value) && value.text === choiceName;
        };
        const isCorrect = (item: ts.Expression): boolean => {
          const value = unwrap(item);
          return (
            ts.isPropertyAccessExpression(value) &&
            ts.isIdentifier(value.expression) &&
            value.expression.text === questionName &&
            value.name.text === 'correctId'
          );
        };
        if (
          [
            ts.SyntaxKind.EqualsEqualsEqualsToken,
            ts.SyntaxKind.ExclamationEqualsEqualsToken,
          ].includes(node.operatorToken.kind) &&
          ((isChoice(node.left) && isCorrect(node.right)) ||
            (isChoice(node.right) && isCorrect(node.left)))
        ) {
          const question = scope.get(questionName!);
          if (isRecord(question)) {
            const matches = scope.get(choiceName!) === question.fields.get('correctId');
            return node.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken
              ? matches
              : !matches;
          }
        }
      }
      reject(node);
      return undefined;
    };
    const expression = (original: ts.Expression, scope: Map<string, Value>): Value | undefined => {
      const node = unwrap(original);
      if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
      if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
      if (ts.isNumericLiteral(node) && ['0', '1'].includes(node.text)) return Number(node.text);
      if (ts.isIdentifier(node) && scope.has(node.text)) return scope.get(node.text);
      if (
        ts.isPropertyAccessExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === stateName &&
        FIELDS.includes(node.name.text)
      ) {
        const state = scope.get(stateName);
        if (isRecord(state)) return state.fields.get(node.name.text);
      }
      if (
        ts.isPrefixUnaryExpression(node) ||
        (ts.isBinaryExpression(node) && node.operatorToken.kind !== ts.SyntaxKind.PlusToken)
      )
        return condition(node, scope);
      if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
        const left = expression(node.left, scope),
          right = expression(node.right, scope);
        if (typeof left === 'number' && typeof right === 'number') return left + right;
      }
      if (ts.isConditionalExpression(node)) {
        const test = condition(node.condition, scope);
        const yes = expression(node.whenTrue, new Map(scope)),
          no = expression(node.whenFalse, new Map(scope));
        return test === undefined ? undefined : test ? yes : no;
      }
      if (ts.isObjectLiteralExpression(node)) {
        const fields = new Map<string, Scalar>();
        for (const property of node.properties) {
          if (ts.isSpreadAssignment(property)) {
            const spread = expression(property.expression, scope);
            if (!isRecord(spread) || [...spread.fields.keys()].some((key) => !FIELDS.includes(key)))
              reject(property);
            else for (const [key, value] of spread.fields) fields.set(key, value);
          } else if (
            ts.isPropertyAssignment(property) ||
            ts.isShorthandPropertyAssignment(property)
          ) {
            const key =
              ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)
                ? property.name.text
                : undefined;
            const value = expression(
              ts.isPropertyAssignment(property) ? property.initializer : property.name,
              scope,
            );
            if (
              !key ||
              !FIELDS.includes(key) ||
              value === undefined ||
              isRecord(value) ||
              (ts.isShorthandPropertyAssignment(property) && property.objectAssignmentInitializer)
            )
              reject(property);
            else fields.set(key, value);
          } else reject(property);
        }
        return { fields, fresh: true };
      }
      reject(node);
      return undefined;
    };
    const run = (
      statements: readonly ts.Statement[],
      scope: Map<string, Value>,
    ): Value | undefined => {
      if (++visits > 8192) {
        reject(source, '分岐を短く分けてください。');
        return undefined;
      }
      let output: Value | undefined;
      for (const [index, statement] of statements.entries()) {
        if (output !== undefined) {
          // 到達しない末尾も、constのbindingを保った1つのblockとして検査する。
          run(statements.slice(index), new Map(scope));
          break;
        }
        if (ts.isReturnStatement(statement) && statement.expression)
          output = expression(statement.expression, scope);
        else if (ts.isBlock(statement)) output = run(statement.statements, new Map(scope));
        else if (
          ts.isVariableStatement(statement) &&
          statement.declarationList.flags === ts.NodeFlags.Const &&
          !statement.modifiers
        ) {
          for (const declaration of statement.declarationList.declarations) {
            if (
              !ts.isIdentifier(declaration.name) ||
              scope.has(declaration.name.text) ||
              aliases.has(declaration.name.text) ||
              !declaration.initializer ||
              declaration.type
            ) {
              reject(declaration);
              continue;
            }
            const value = expression(declaration.initializer, scope);
            if (value !== undefined) scope.set(declaration.name.text, value);
          }
        } else if (ts.isIfStatement(statement)) {
          const test = condition(statement.expression, scope);
          const yes = run([statement.thenStatement], new Map(scope));
          const no = statement.elseStatement
            ? run([statement.elseStatement], new Map(scope))
            : undefined;
          output = test === undefined ? undefined : test ? yes : no;
        } else reject(statement);
      }
      return output;
    };
    return run(fn.body!.statements, values);
  };
  const matches = (
    value: Value | undefined,
    index: number,
    score: number,
    answered: boolean,
    fresh = false,
  ): boolean =>
    isRecord(value) &&
    value.fields.size === 3 &&
    (!fresh || value.fresh) &&
    value.fields.get('index') === index &&
    value.fields.get('score') === score &&
    value.fields.get('answered') === answered;
  const initial = execute(functions.get('createState')!, []);
  const answers = [false, true].flatMap((answered) =>
    [false, true].map((correct) => {
      const question: StateValue = {
        fields: new Map([['correctId', '選択肢の正解']]),
        fresh: false,
      };
      const result = execute(functions.get('answer')!, [
        record(5, 17, answered, false),
        question,
        correct ? '選択肢の正解' : '別の選択肢',
      ]);
      return { answered, correct, result };
    }),
  );
  const advances = [false, true].map((answered) => ({
    answered,
    result: execute(functions.get('advance')!, [record(5, 17, answered, false)]),
  }));
  return {
    diagnostics,
    facts: {
      createsInitialState: matches(initial, 0, 0, false, true),
      scoresActualAnswer: answers
        .filter((item) => !item.answered)
        .every(({ correct, result }) =>
          matches(result, 5, correct ? 18 : 17, practice ? correct : true, !practice || correct),
        ),
      guardsRepeatedAnswer: answers
        .filter((item) => item.answered)
        .every(({ result }) => matches(result, 5, 17, true)),
      advancesAnsweredQuestion: advances.every(({ answered, result }) =>
        matches(result, answered ? 6 : 5, 17, false, answered),
      ),
      usesPureStateFunctions: diagnostics.length === 0,
    },
  };
}
