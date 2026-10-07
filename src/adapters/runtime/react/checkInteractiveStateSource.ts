import ts from 'typescript';
import type { TypeScriptDiagnostic } from '../typescript/compileTypeScript';

export interface InteractiveStateFacts {
  readonly usesState: boolean;
  readonly queuesTwoIncrements: boolean;
  readonly updatesStateFromEvent: boolean;
  readonly usesImmutableUpdates: boolean;
  readonly usesStableItemKeys: boolean;
}
type Context = 'value' | 'event' | 'updater' | 'map';
const TAGS = new Set(['section', 'div', 'h1', 'p', 'span', 'button', 'ul', 'li', 'strong']);
const ATTRIBUTES = new Set(['id', 'className', 'aria-label', 'aria-labelledby', 'type', 'data-id']);
const OPERATORS = new Set([
  ts.SyntaxKind.PlusToken,
  ts.SyntaxKind.MinusToken,
  ts.SyntaxKind.AsteriskToken,
  ts.SyntaxKind.SlashToken,
  ts.SyntaxKind.EqualsEqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsEqualsToken,
]);

/**
 * 1つのStateと同期clickだけを扱う有限AST契約。更新関数は純粋な値を返し、
 * 許可式以外をfail-closedで拒否する。コードを実行せず、採点は実操作結果とのANDで行う。
 */
export function analyzeInteractiveState(sourceText: string): {
  readonly diagnostics: readonly TypeScriptDiagnostic[];
  readonly facts: InteractiveStateFacts;
} {
  const source = ts.createSourceFile(
    'components.tsx',
    sourceText,
    ts.ScriptTarget.ES2023,
    true,
    ts.ScriptKind.TSX,
  );
  const diagnostics: TypeScriptDiagnostic[] = [];
  const reject = (
    node: ts.Node,
    message = 'この課題は用意済みState・同期click・純粋な配列更新だけを扱います。',
  ): void => {
    if (diagnostics.length >= 50) return;
    const position = source.getLineAndCharacterOfPosition(node.getStart(source));
    diagnostics.push({
      code: 0,
      file: 'components.tsx',
      line: position.line + 1,
      column: position.character + 1,
      message,
    });
  };
  let nodes = 0;
  const count = (node: ts.Node): void => {
    nodes++;
    if (node.kind === ts.SyntaxKind.AnyKeyword)
      reject(node, 'anyで型を弱めず、用意済みのState型を使います。');
    ts.forEachChild(node, count);
  };
  count(source);
  const facts: InteractiveStateFacts = {
    usesState: false,
    queuesTwoIncrements: false,
    updatesStateFromEvent: false,
    usesImmutableUpdates: false,
    usesStableItemKeys: false,
  };
  if (nodes > 2048 || /@ts-(?:ignore|expect-error|nocheck)\b/u.test(sourceText)) {
    reject(source, '構文上限を守り、型検査を無効にせずStateを直してください。');
    return { diagnostics, facts };
  }
  let hook: string | undefined;
  let topicType: string | undefined;
  let app: ts.FunctionDeclaration | undefined;
  for (const statement of source.statements) {
    if (ts.isImportDeclaration(statement)) {
      const bindings = statement.importClause?.namedBindings;
      if (
        !ts.isStringLiteral(statement.moduleSpecifier) ||
        !bindings ||
        !ts.isNamedImports(bindings) ||
        statement.importClause.name ||
        bindings.elements.length !== 1
      ) {
        reject(statement);
        continue;
      }
      const binding = bindings.elements[0]!;
      const original = binding.propertyName?.text ?? binding.name.text;
      if (
        statement.moduleSpecifier.text === 'react' &&
        original === 'useState' &&
        !statement.importClause.phaseModifier &&
        !binding.isTypeOnly &&
        !hook
      )
        hook = binding.name.text;
      else if (
        statement.moduleSpecifier.text === './types' &&
        original === 'Topic' &&
        statement.importClause.phaseModifier === ts.SyntaxKind.TypeKeyword &&
        !topicType
      )
        topicType = binding.name.text;
      else reject(statement, 'importはuseStateと用意済みTopic型だけです。');
    } else if (
      ts.isFunctionDeclaration(statement) &&
      statement.name?.text === 'App' &&
      !app &&
      statement.parameters.length === 0 &&
      !statement.typeParameters &&
      !statement.asteriskToken &&
      statement.modifiers?.length === 1 &&
      statement.modifiers[0]?.kind === ts.SyntaxKind.ExportKeyword &&
      statement.body
    )
      app = statement;
    else reject(statement);
  }
  if (!app?.body || !hook) {
    reject(source, 'useStateをimportし、引数のないAppをexportします。');
    return { diagnostics, facts };
  }
  const statements = [...app.body.statements];
  const stateStatement = statements.shift();
  const declaration =
    stateStatement &&
    ts.isVariableStatement(stateStatement) &&
    stateStatement.declarationList.flags === ts.NodeFlags.Const &&
    stateStatement.declarationList.declarations.length === 1
      ? stateStatement.declarationList.declarations[0]
      : undefined;
  const call = declaration?.initializer;
  const pattern = declaration?.name;
  if (
    !call ||
    !ts.isCallExpression(call) ||
    !ts.isIdentifier(call.expression) ||
    call.expression.text !== hook ||
    call.arguments.length !== 1 ||
    !pattern ||
    !ts.isArrayBindingPattern(pattern) ||
    pattern.elements.length !== 2 ||
    declaration.type ||
    pattern.elements.some(
      (element) =>
        !ts.isBindingElement(element) ||
        !ts.isIdentifier(element.name) ||
        element.initializer ||
        element.dotDotDotToken,
    )
  ) {
    reject(stateStatement ?? source, 'Componentの先頭で、useStateの値と更新関数を受け取ります。');
    return { diagnostics, facts };
  }
  const stateName = (pattern.elements[0] as ts.BindingElement).name.getText(source);
  const setterName = (pattern.elements[1] as ts.BindingElement).name.getText(source);
  const type = call.typeArguments?.[0];
  const listState =
    !!type &&
    ts.isTypeOperatorNode(type) &&
    type.operator === ts.SyntaxKind.ReadonlyKeyword &&
    ts.isArrayTypeNode(type.type) &&
    ts.isTypeReferenceNode(type.type.elementType) &&
    type.type.elementType.typeName.getText(source) === topicType &&
    !type.type.elementType.typeArguments;
  if (call.typeArguments && (call.typeArguments.length !== 1 || !listState))
    reject(call, '配列Stateには用意済みreadonly Topic[]型を指定します。');
  const handlers = new Map<string, ts.FunctionDeclaration>();
  let output: ts.Expression | undefined;
  const checkedHandlers = new Set<string>();
  for (const statement of statements) {
    if (
      ts.isFunctionDeclaration(statement) &&
      statement.name &&
      statement.body &&
      !statement.modifiers &&
      !statement.asteriskToken &&
      !statement.typeParameters &&
      statement.parameters.length === 0 &&
      !handlers.has(statement.name.text) &&
      ![stateName, setterName, hook, topicType].includes(statement.name.text) &&
      !output
    )
      handlers.set(statement.name.text, statement);
    else if (ts.isReturnStatement(statement) && statement.expression && !output)
      output = statement.expression;
    else reject(statement);
  }
  if (stateName === setterName || [stateName, setterName].includes(hook) || !output) reject(source);
  const observed = { displaysState: false, eventUpdates: false, allFresh: true };
  let maps = 0;
  let stableMaps = 0;
  let updates = 0;
  let queuedIncrements = 0;
  let queueHandlers = 0;
  let twiceButtons = 0;
  /** updaterの戻り値が「前の値+1」と等価か、有限の一次式だけを追う。 */
  const isIncrement = (node: ts.ArrowFunction): boolean => {
    const parameter = node.parameters[0]?.name;
    if (node.parameters.length !== 1 || !parameter || !ts.isIdentifier(parameter)) return false;
    let body: ts.Node = node.body;
    if (
      ts.isBlock(body) &&
      body.statements.length === 1 &&
      ts.isReturnStatement(body.statements[0]!) &&
      body.statements[0].expression
    )
      body = body.statements[0].expression;
    const linear = (value: ts.Node): readonly [number, number] | undefined => {
      if (ts.isParenthesizedExpression(value)) return linear(value.expression);
      if (ts.isNumericLiteral(value)) return [0, Number(value.text)];
      if (ts.isIdentifier(value) && value.text === parameter.text) return [1, 0];
      if (!ts.isBinaryExpression(value)) return undefined;
      const left = linear(value.left),
        right = linear(value.right);
      if (!left || !right) return undefined;
      switch (value.operatorToken.kind) {
        case ts.SyntaxKind.PlusToken:
          return [left[0] + right[0], left[1] + right[1]];
        case ts.SyntaxKind.MinusToken:
          return [left[0] - right[0], left[1] - right[1]];
        case ts.SyntaxKind.AsteriskToken:
          if (left[0] === 0) return [right[0] * left[1], right[1] * left[1]];
          if (right[0] === 0) return [left[0] * right[1], left[1] * right[1]];
          return undefined;
        case ts.SyntaxKind.SlashToken:
          return right[0] === 0 && right[1] !== 0
            ? [left[0] / right[1], left[1] / right[1]]
            : undefined;
        default:
          return undefined;
      }
    };
    const value = linear(body);
    return value?.[0] === 1 && value[1] === 1;
  };
  const checkBody = (body: ts.ConciseBody, scope: ReadonlySet<string>, context: Context): void => {
    if (ts.isBlock(body)) {
      if (context === 'event') {
        if (!body.statements.length || body.statements.length > 8) reject(body);
        for (const statement of body.statements) {
          if (ts.isExpressionStatement(statement)) expression(statement.expression, scope, context);
          else if (
            ts.isThrowStatement(statement) &&
            ts.isNewExpression(statement.expression) &&
            statement.expression.expression.getText(source) === 'Error' &&
            statement.expression.arguments?.length === 1 &&
            ts.isStringLiteral(statement.expression.arguments[0]!)
          ) {
            /* 診断Fixtureの同期例外だけを許可する。 */
          } else reject(statement);
        }
      } else if (
        body.statements.length === 1 &&
        ts.isReturnStatement(body.statements[0]!) &&
        body.statements[0].expression
      )
        expression(body.statements[0].expression, scope, context);
      else reject(body, '更新関数とmapは副作用のない次の値を返します。');
    } else expression(body, scope, context);
  };
  const arrow = (
    node: ts.ArrowFunction,
    scope: ReadonlySet<string>,
    context: Context,
    maxParameters = 1,
  ): void => {
    if (
      node.modifiers ||
      node.typeParameters ||
      node.parameters.length > maxParameters ||
      node.parameters.some(
        (parameter) =>
          !ts.isIdentifier(parameter.name) ||
          parameter.type ||
          parameter.initializer ||
          parameter.dotDotDotToken,
      )
    ) {
      reject(node);
      return;
    }
    const names = node.parameters.map((parameter) => parameter.name.getText(source));
    if (names.some((name) => scope.has(name) || [setterName, hook, topicType].includes(name))) {
      reject(node);
      return;
    }
    checkBody(node.body, new Set([...scope, ...names]), context);
  };
  const jsx = (
    node: ts.JsxElement | ts.JsxSelfClosingElement | ts.JsxFragment,
    scope: ReadonlySet<string>,
    context: Context,
    itemName?: string,
  ): boolean => {
    if (ts.isJsxFragment(node)) {
      for (const child of node.children) childNode(child, scope, context);
      return false;
    }
    const opening = ts.isJsxElement(node) ? node.openingElement : node;
    if (!TAGS.has(opening.tagName.getText(source)))
      reject(opening, 'この課題の表示は用意済みのHTML要素を使います。');
    const twice =
      opening.tagName.getText(source) === 'button' &&
      opening.attributes.properties.some(
        (attribute) =>
          ts.isJsxAttribute(attribute) &&
          attribute.name.getText(source) === 'id' &&
          attribute.initializer &&
          ts.isStringLiteral(attribute.initializer) &&
          attribute.initializer.text === 'twice',
      );
    if (twice) twiceButtons++;
    let stable = false;
    for (const attribute of opening.attributes.properties) {
      if (!ts.isJsxAttribute(attribute)) {
        reject(attribute);
        continue;
      }
      const name = attribute.name.getText(source);
      const initializer = attribute.initializer;
      if (
        name === 'onClick' &&
        opening.tagName.getText(source) === 'button' &&
        initializer &&
        ts.isJsxExpression(initializer) &&
        initializer.expression
      ) {
        const handler = initializer.expression;
        const previousUpdates = updates;
        const previousIncrements = queuedIncrements;
        if (ts.isIdentifier(handler) && handlers.has(handler.text)) {
          checkedHandlers.add(handler.text);
          checkBody(handlers.get(handler.text)!.body!, new Set([stateName]), 'event');
        } else if (ts.isArrowFunction(handler)) arrow(handler, new Set([stateName]), 'event', 0);
        else reject(handler, 'onClickへ関数を渡します。描画中には更新関数を呼びません。');
        if (twice && updates - previousUpdates === 2 && queuedIncrements - previousIncrements === 2)
          queueHandlers++;
      } else if (
        name === 'key' &&
        initializer &&
        ts.isJsxExpression(initializer) &&
        initializer.expression
      ) {
        const value = initializer.expression;
        stable =
          !!itemName &&
          ts.isPropertyAccessExpression(value) &&
          ts.isIdentifier(value.expression) &&
          value.expression.text === itemName &&
          value.name.text === 'id';
        expression(value, scope, context);
      } else if (ATTRIBUTES.has(name) && initializer) {
        if (ts.isStringLiteral(initializer)) {
          if (name === 'data-id' && itemName)
            reject(initializer, '観測用IDも描画項目のidに対応させます。');
          continue;
        }
        if (name === 'data-id' && ts.isJsxExpression(initializer) && initializer.expression) {
          const value = initializer.expression;
          if (
            itemName &&
            (!ts.isPropertyAccessExpression(value) ||
              value.expression.getText(source) !== itemName ||
              value.name.text !== 'id')
          )
            reject(value, '観測用IDも描画項目のidに対応させます。');
          expression(value, scope, context);
        } else reject(attribute);
      } else reject(attribute, 'EventはbuttonのonClickだけを使い、refやURL属性は扱いません。');
    }
    if (ts.isJsxElement(node)) for (const child of node.children) childNode(child, scope, context);
    return stable;
  };
  const childNode = (node: ts.JsxChild, scope: ReadonlySet<string>, context: Context): void => {
    if (ts.isJsxText(node)) return;
    if (ts.isJsxExpression(node)) {
      if (node.expression) expression(node.expression, scope, context);
    } else jsx(node, scope, context);
  };
  const expression = (node: ts.Expression, scope: ReadonlySet<string>, context: Context): void => {
    if (ts.isParenthesizedExpression(node)) {
      expression(node.expression, scope, context);
      return;
    }
    if (ts.isStringLiteral(node) || ts.isNumericLiteral(node)) return;
    if (ts.isIdentifier(node)) {
      if (!scope.has(node.text)) reject(node);
      if (context === 'value' && node.text === stateName) observed.displaysState = true;
      return;
    }
    if (ts.isBinaryExpression(node) && OPERATORS.has(node.operatorToken.kind)) {
      expression(node.left, scope, context);
      expression(node.right, scope, context);
      return;
    }
    if (ts.isArrayLiteralExpression(node)) {
      for (const element of node.elements)
        expression(ts.isSpreadElement(element) ? element.expression : element, scope, context);
      return;
    }
    if (ts.isObjectLiteralExpression(node)) {
      if (
        node.properties.length !== 2 ||
        node.properties.some(
          (property) =>
            !ts.isPropertyAssignment(property) ||
            !['id', 'label'].includes(property.name.getText(source)),
        )
      )
        reject(node);
      for (const property of node.properties)
        if (ts.isPropertyAssignment(property)) expression(property.initializer, scope, context);
      return;
    }
    if (
      ts.isPropertyAccessExpression(node) &&
      ['id', 'label'].includes(node.name.text) &&
      ts.isIdentifier(node.expression) &&
      scope.has(node.expression.text) &&
      node.expression.text !== stateName
    )
      return;
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node)) {
      jsx(node, scope, context);
      return;
    }
    if (ts.isCallExpression(node)) {
      if (
        ts.isIdentifier(node.expression) &&
        node.expression.text === setterName &&
        context === 'event' &&
        node.arguments.length === 1 &&
        !node.typeArguments
      ) {
        updates++;
        observed.eventUpdates = true;
        const next = node.arguments[0]!;
        if (ts.isArrowFunction(next) && isIncrement(next)) queuedIncrements++;
        let returned: ts.Node = ts.isArrowFunction(next) ? next.body : next;
        if (
          ts.isBlock(returned) &&
          returned.statements.length === 1 &&
          ts.isReturnStatement(returned.statements[0]!) &&
          returned.statements[0].expression
        )
          returned = returned.statements[0].expression;
        while (ts.isParenthesizedExpression(returned)) returned = returned.expression;
        observed.allFresh &&=
          ts.isArrayLiteralExpression(returned) ||
          (ts.isCallExpression(returned) &&
            ts.isPropertyAccessExpression(returned.expression) &&
            ['filter', 'map', 'toReversed', 'reverse'].includes(returned.expression.name.text));
        if (ts.isArrowFunction(next)) arrow(next, scope, 'updater');
        else expression(next, scope, 'updater');
        return;
      }
      if (ts.isPropertyAccessExpression(node.expression) && !node.typeArguments) {
        const receiver = node.expression.expression;
        const method = node.expression.name.text;
        if (
          ['map', 'filter', 'toReversed'].includes(method) ||
          (method === 'reverse' && ts.isArrayLiteralExpression(receiver))
        ) {
          expression(receiver, scope, context);
          if (method === 'toReversed' || method === 'reverse') {
            if (node.arguments.length) reject(node);
            return;
          }
          const callback = node.arguments[0];
          if (node.arguments.length !== 1 || !callback || !ts.isArrowFunction(callback)) {
            reject(node);
            return;
          }
          if (
            method === 'map' &&
            context === 'value' &&
            ts.isIdentifier(receiver) &&
            receiver.text === stateName
          ) {
            maps++;
            const body = ts.isParenthesizedExpression(callback.body)
              ? callback.body.expression
              : callback.body;
            const item = callback.parameters[0]?.name;
            if (
              (ts.isJsxElement(body) || ts.isJsxSelfClosingElement(body)) &&
              item &&
              ts.isIdentifier(item)
            ) {
              if (
                callback.parameters.length > 2 ||
                callback.parameters.some(
                  (parameter) =>
                    !ts.isIdentifier(parameter.name) ||
                    parameter.type ||
                    parameter.initializer ||
                    parameter.dotDotDotToken,
                ) ||
                callback.modifiers ||
                callback.typeParameters ||
                callback.parameters.some(
                  (parameter) =>
                    scope.has(parameter.name.getText(source)) ||
                    [setterName, hook].includes(parameter.name.getText(source)),
                )
              )
                reject(callback);
              else if (
                jsx(
                  body,
                  new Set([
                    ...scope,
                    ...callback.parameters.map((parameter) => parameter.name.getText(source)),
                  ]),
                  'map',
                  item.text,
                )
              )
                stableMaps++;
            } else {
              arrow(callback, scope, 'map', 2);
            }
          } else arrow(callback, scope, 'updater');
          return;
        }
      }
    }
    reject(node);
  };
  // 初期値は外部束縛も関数も参照できない。型検査がTopic/numberの実型も保証する。
  expression(call.arguments[0]!, new Set(), 'updater');
  if (!listState && !ts.isNumericLiteral(call.arguments[0]!))
    reject(call, '数値Stateは数値で初期化します。');
  if (listState && !ts.isArrayLiteralExpression(call.arguments[0]!))
    reject(call, '配列Stateは項目の配列で初期化します。');
  if (output) expression(output, new Set([stateName]), 'value');
  // 未使用handlerも能力検査するが、実際のEventへの接続factへは数えない。
  const connectedUpdates = observed.eventUpdates;
  const connectedCount = updates;
  const connectedFresh = observed.allFresh;
  for (const [name, handler] of handlers)
    if (!checkedHandlers.has(name)) checkBody(handler.body!, new Set([stateName]), 'event');
  observed.eventUpdates = connectedUpdates;
  updates = connectedCount;
  observed.allFresh = connectedFresh;
  return {
    diagnostics,
    facts: {
      usesState: observed.displaysState,
      queuesTwoIncrements: !listState && twiceButtons === 1 && queueHandlers === 1,
      updatesStateFromEvent: observed.displaysState && observed.eventUpdates,
      usesImmutableUpdates:
        listState &&
        observed.displaysState &&
        updates > 0 &&
        observed.allFresh &&
        diagnostics.length === 0,
      usesStableItemKeys: listState && maps > 0 && maps === stableMaps,
    },
  };
}
