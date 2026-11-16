import ts from 'typescript';
import type { TypeScriptDiagnostic } from '../typescript/compileTypeScript';

export interface ComponentDesignFacts {
  readonly rendersAuthoredDisplay: boolean;
  readonly usesInteractiveState: boolean;
}

type FunctionNode = ts.FunctionDeclaration | ts.ArrowFunction;
interface Scope {
  readonly values: Map<string, Value>;
  readonly owner: string;
  readonly reachable: boolean;
  readonly temperatureDisplay?: boolean;
}
interface Value {
  readonly kind: 'scalar' | 'object' | 'callback' | 'setter' | 'jsx';
  readonly numeric?: boolean;
  readonly text?: string;
  readonly received?: boolean;
  readonly origins?: ReadonlySet<string>;
  readonly fields?: ReadonlyMap<string, Value>;
  readonly state?: string;
  readonly callback?: FunctionNode;
  readonly jsx?: ts.JsxElement | ts.JsxSelfClosingElement | ts.JsxFragment;
  readonly scope?: Scope;
}
const scalar = (numeric = false, origins: readonly string[] = [], received = false): Value => ({
  kind: 'scalar',
  numeric,
  origins: new Set(origins),
  received,
});
const TAGS = new Set(['section', 'div', 'h1', 'h2', 'p', 'span', 'strong', 'button']);
const ATTRIBUTES = new Set(['id', 'className', 'aria-label', 'aria-labelledby', 'type']);
const OPERATORS = new Set([
  ts.SyntaxKind.PlusToken,
  ts.SyntaxKind.MinusToken,
  ts.SyntaxKind.AsteriskToken,
  ts.SyntaxKind.SlashToken,
]);

/**
 * 温度課題だけの有限構文を解析する。学習者コードは実行しない。
 * 実際のApp描画木で数値Propsが表示され、同じStateの表示とclick更新が結ばれるかを追う。
 * 温度式の正しさ・所有者の最適性は断定せず、実操作と独立UI観察へ残す。
 */
export function analyzeComponentDesign(sourceText: string): {
  readonly diagnostics: readonly TypeScriptDiagnostic[];
  readonly facts: ComponentDesignFacts;
} {
  const source = ts.createSourceFile(
    'components.tsx',
    sourceText,
    ts.ScriptTarget.ES2023,
    true,
    ts.ScriptKind.TSX,
  );
  const diagnostics: TypeScriptDiagnostic[] = [];
  const rejected = new Set<number>();
  const reject = (
    node: ts.Node,
    message = 'この課題では型付きの表示部品、数値の四則演算、同期したクリック処理を使います。',
  ): void => {
    const start = node.getStart(source);
    if (rejected.has(start) || diagnostics.length >= 30) return;
    rejected.add(start);
    const position = source.getLineAndCharacterOfPosition(start);
    diagnostics.push({
      code: 0,
      file: 'components.tsx',
      line: position.line + 1,
      column: position.character + 1,
      message,
    });
  };
  const components = new Map<string, FunctionNode>();
  const types = new Map<string, ts.TypeNode | ts.InterfaceDeclaration>();
  const exported = new Set<string>();
  let hook: string | undefined;
  let budget = 0;
  const authoredStates = new Set<string>();
  const displayed = new Set<string>();
  const updated = new Set<string>();
  const componentStack = new Set<string>();
  const callbackStack = new Set<FunctionNode>();
  const pendingCallbacks: { node: FunctionNode; scope: Scope }[] = [];
  const tick = (node: ts.Node): boolean => {
    if (++budget <= 6000) return true;
    reject(node, '部品と式の展開がこの小課題の上限を超えています。');
    return false;
  };
  if (sourceText.length > 30_000 || /@ts-(?:ignore|expect-error|nocheck)\b/u.test(sourceText))
    reject(source);
  const modifiersAllowed = (node: FunctionNode): boolean =>
    !node.modifiers?.some((modifier) => modifier.kind !== ts.SyntaxKind.ExportKeyword) &&
    !node.typeParameters &&
    !node.type &&
    !('asteriskToken' in node && node.asteriskToken);
  for (const statement of source.statements) {
    if (ts.isImportDeclaration(statement)) {
      const clause = statement.importClause;
      const bindings = clause?.namedBindings;
      if (
        !ts.isStringLiteral(statement.moduleSpecifier) ||
        statement.moduleSpecifier.text !== 'react' ||
        !clause ||
        clause.name ||
        clause.phaseModifier ||
        !bindings ||
        !ts.isNamedImports(bindings) ||
        bindings.elements.length !== 1 ||
        hook
      ) {
        reject(statement);
        continue;
      }
      const binding = bindings.elements[0]!;
      if ((binding.propertyName?.text ?? binding.name.text) !== 'useState' || binding.isTypeOnly)
        reject(binding);
      else hook = binding.name.text;
    } else if (ts.isInterfaceDeclaration(statement)) {
      if (
        statement.modifiers ||
        statement.typeParameters ||
        statement.heritageClauses ||
        types.has(statement.name.text)
      )
        reject(statement);
      else types.set(statement.name.text, statement);
    } else if (ts.isTypeAliasDeclaration(statement)) {
      if (statement.modifiers || statement.typeParameters || types.has(statement.name.text))
        reject(statement);
      else types.set(statement.name.text, statement.type);
    } else {
      let name: string | undefined;
      let node: FunctionNode | undefined;
      if (ts.isFunctionDeclaration(statement) && statement.name && statement.body) {
        name = statement.name.text;
        node = statement;
      } else if (
        ts.isVariableStatement(statement) &&
        statement.declarationList.flags === ts.NodeFlags.Const &&
        statement.declarationList.declarations.length === 1 &&
        !statement.modifiers?.some((modifier) => modifier.kind !== ts.SyntaxKind.ExportKeyword)
      ) {
        const declaration = statement.declarationList.declarations[0]!;
        if (
          ts.isIdentifier(declaration.name) &&
          declaration.initializer &&
          ts.isArrowFunction(declaration.initializer) &&
          !declaration.type
        ) {
          name = declaration.name.text;
          node = declaration.initializer;
        }
      }
      if (
        !name ||
        !node ||
        !/^[A-Z]/u.test(name) ||
        components.has(name) ||
        !modifiersAllowed(node)
      )
        reject(statement);
      else {
        components.set(name, node);
        if (
          ts.canHaveModifiers(statement) &&
          ts
            .getModifiers(statement)
            ?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
        )
          exported.add(name);
      }
    }
  }
  if (!components.has('App') || !exported.has('App') || components.size > 12 || types.size > 12)
    reject(source, '引数のないAppをexportし、表示部品を同じファイルに作ります。');

  const typeValue = (
    node: ts.TypeNode | ts.InterfaceDeclaration,
    seen = new Set<string>(),
  ): Value => {
    if (!tick(node)) return scalar();
    if (node.kind === ts.SyntaxKind.NumberKeyword) return scalar(true);
    if (node.kind === ts.SyntaxKind.StringKeyword) return scalar();
    if (
      ts.isFunctionTypeNode(node) &&
      node.parameters.length === 0 &&
      node.type.kind === ts.SyntaxKind.VoidKeyword &&
      !node.typeParameters
    )
      return { kind: 'callback' };
    if (ts.isTypeReferenceNode(node) && ts.isIdentifier(node.typeName) && !node.typeArguments) {
      const name = node.typeName.text;
      const target = types.get(name);
      if (target && !seen.has(name)) return typeValue(target, new Set([...seen, name]));
    }
    if (ts.isTypeLiteralNode(node) || ts.isInterfaceDeclaration(node)) {
      const fields = new Map<string, Value>();
      for (const member of node.members) {
        if (
          !ts.isPropertySignature(member) ||
          !ts.isIdentifier(member.name) ||
          !member.type ||
          member.questionToken ||
          member.modifiers?.some((modifier) => modifier.kind !== ts.SyntaxKind.ReadonlyKeyword) ||
          fields.has(member.name.text)
        )
          reject(member);
        else fields.set(member.name.text, typeValue(member.type, seen));
      }
      return { kind: 'object', fields };
    }
    reject(node, 'Propsには数値・文字列・引数なしの操作関数の型を指定します。');
    return scalar();
  };
  for (const node of types.values()) typeValue(node);

  const bind = (parameter: ts.ParameterDeclaration, argument: Value, scope: Scope): void => {
    if (
      parameter.initializer ||
      parameter.dotDotDotToken ||
      parameter.questionToken ||
      parameter.modifiers
    ) {
      reject(parameter);
      return;
    }
    if (ts.isIdentifier(parameter.name)) scope.values.set(parameter.name.text, argument);
    else if (ts.isObjectBindingPattern(parameter.name)) {
      for (const element of parameter.name.elements) {
        if (
          !ts.isIdentifier(element.name) ||
          element.initializer ||
          element.dotDotDotToken ||
          (element.propertyName && !ts.isIdentifier(element.propertyName))
        ) {
          reject(element);
          continue;
        }
        const field = element.propertyName?.getText(source) ?? element.name.text;
        scope.values.set(element.name.text, argument.fields?.get(field) ?? scalar());
      }
    } else reject(parameter);
  };
  const callback = (node: FunctionNode, scope: Scope, args: readonly Value[]): Value => {
    if (!tick(node) || callbackStack.has(node) || !node.body) {
      reject(node, '操作関数の再帰はこの課題では使いません。');
      return scalar();
    }
    if (!modifiersAllowed(node) || node.parameters.length > 1) reject(node);
    callbackStack.add(node);
    const local: Scope = { ...scope, values: new Map(scope.values) };
    for (const [index, parameter] of node.parameters.entries()) {
      if (parameter.type && parameter.type.kind !== ts.SyntaxKind.NumberKeyword) reject(parameter);
      bind(parameter, args[index] ?? scalar(true), local);
    }
    const result = body(node.body, local, false, args.length === 0);
    callbackStack.delete(node);
    return result;
  };
  const expression = (node: ts.Expression, scope: Scope, event = false): Value => {
    if (!tick(node)) return scalar();
    if (ts.isParenthesizedExpression(node)) return expression(node.expression, scope, event);
    if (ts.isNumericLiteral(node)) return scalar(true);
    if (ts.isStringLiteral(node)) return { ...scalar(), text: node.text };
    if (ts.isIdentifier(node)) {
      const known = scope.values.get(node.text);
      if (!known) reject(node);
      return known ?? scalar();
    }
    if (ts.isPropertyAccessExpression(node)) {
      const receiver = expression(node.expression, scope);
      const field = receiver.kind === 'object' ? receiver.fields?.get(node.name.text) : undefined;
      if (!field) reject(node);
      return field ?? scalar();
    }
    if (
      ts.isPrefixUnaryExpression(node) &&
      [ts.SyntaxKind.PlusToken, ts.SyntaxKind.MinusToken].includes(node.operator)
    )
      return expression(node.operand, scope);
    if (ts.isBinaryExpression(node) && OPERATORS.has(node.operatorToken.kind)) {
      const left = expression(node.left, scope),
        right = expression(node.right, scope);
      return scalar(
        !!left.numeric && !!right.numeric,
        [...(left.origins ?? []), ...(right.origins ?? [])],
        !!left.received || !!right.received,
      );
    }
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node)) {
      // 描画されないローカルJSXにも同じ構文契約を適用するが、factは増やさない。
      const cold: Scope = { ...scope, reachable: false };
      render({ kind: 'jsx', jsx: node, scope: cold }, cold);
      return { kind: 'jsx', jsx: node, scope };
    }
    if (ts.isArrowFunction(node)) {
      // 未接続の関数も能力検査するが、更新factには数えない。
      pendingCallbacks.push({ node, scope });
      return { kind: 'callback', callback: node, scope };
    }
    if (ts.isCallExpression(node) && !node.typeArguments && event) {
      const callee = expression(node.expression, scope);
      if (callee.kind === 'setter' && node.arguments.length === 1) {
        const next = node.arguments[0]!;
        if (ts.isArrowFunction(next))
          callback(next, scope, [scalar(true, callee.state ? [callee.state] : [])]);
        else expression(next, scope);
        if (scope.reachable && callee.state) updated.add(callee.state);
        return scalar();
      }
      if (callee.kind === 'callback' && node.arguments.length === 0) {
        if (callee.callback && callee.scope)
          return callback(callee.callback, { ...callee.scope, reachable: scope.reachable }, []);
        return scalar();
      }
    }
    reject(node);
    return scalar();
  };
  const body = (node: ts.ConciseBody, scope: Scope, component: boolean, events = true): Value => {
    if (!ts.isBlock(node)) return expression(node, scope, !component && events);
    let output: Value | undefined;
    // function宣言だけを先に結び、名前付きCallbackの前方参照を許可する。
    for (const statement of node.statements)
      if (
        ts.isFunctionDeclaration(statement) &&
        statement.name &&
        statement.body &&
        !statement.modifiers
      ) {
        if (scope.values.has(statement.name.text)) reject(statement);
        else
          scope.values.set(statement.name.text, { kind: 'callback', callback: statement, scope });
      }
    for (const statement of node.statements) {
      if (output) {
        reject(statement);
        continue;
      }
      if (ts.isReturnStatement(statement) && statement.expression)
        output = expression(statement.expression, scope, !component && events);
      else if (
        ts.isFunctionDeclaration(statement) &&
        statement.name &&
        statement.body &&
        !statement.modifiers
      ) {
        pendingCallbacks.push({ node: statement, scope });
      } else if (
        ts.isVariableStatement(statement) &&
        !statement.modifiers &&
        statement.declarationList.flags === ts.NodeFlags.Const
      ) {
        for (const declaration of statement.declarationList.declarations) {
          const initial = declaration.initializer;
          if (!initial) {
            reject(declaration);
            continue;
          }
          if (
            component &&
            ts.isArrayBindingPattern(declaration.name) &&
            ts.isCallExpression(initial) &&
            ts.isIdentifier(initial.expression) &&
            initial.expression.text === hook
          ) {
            const elements = declaration.name.elements;
            if (
              declaration.type ||
              elements.length !== 2 ||
              initial.arguments.length !== 1 ||
              (initial.typeArguments &&
                (initial.typeArguments.length !== 1 ||
                  initial.typeArguments[0]?.kind !== ts.SyntaxKind.NumberKeyword)) ||
              elements.some(
                (element) =>
                  !ts.isBindingElement(element) ||
                  !ts.isIdentifier(element.name) ||
                  element.initializer ||
                  element.dotDotDotToken,
              )
            ) {
              reject(declaration);
              continue;
            }
            const state = `${scope.owner}:${String(declaration.pos)}`;
            const names = elements.map((element) =>
              (element as ts.BindingElement).name.getText(source),
            );
            const initialValue = expression(initial.arguments[0]!, { ...scope, values: new Map() });
            if (
              !initialValue.numeric ||
              names[0] === names[1] ||
              names.some((name) => scope.values.has(name) || name === hook)
            )
              reject(declaration);
            scope.values.set(names[0]!, scalar(true, [state]));
            scope.values.set(names[1]!, { kind: 'setter', state });
          } else if (
            ts.isIdentifier(declaration.name) &&
            !declaration.type &&
            !scope.values.has(declaration.name.text) &&
            declaration.name.text !== hook
          ) {
            scope.values.set(declaration.name.text, expression(initial, scope));
          } else reject(declaration);
        }
      } else if (!component && events && ts.isExpressionStatement(statement))
        expression(statement.expression, scope, true);
      else reject(statement);
    }
    return output ?? scalar();
  };
  const render = (value: Value, scope: Scope): void => {
    if (value.kind === 'scalar') {
      if (scope.reachable && scope.temperatureDisplay) {
        for (const origin of value.origins ?? []) displayed.add(origin);
        if (scope.owner !== 'App' && value.numeric && value.received)
          for (const origin of value.origins ?? []) authoredStates.add(origin);
      }
      return;
    }
    if (value.kind !== 'jsx' || !value.jsx || !value.scope) {
      reject(source);
      return;
    }
    const node = value.jsx,
      // 変数の名前解決は作成時のscope、実使用と温度表示の位置は描画時の文脈を使う。
      local = {
        ...value.scope,
        reachable: value.scope.reachable && scope.reachable,
        temperatureDisplay: scope.temperatureDisplay === true,
      };
    if (!tick(node)) return;
    if (ts.isJsxFragment(node)) {
      for (const child of node.children) renderChild(child, local);
      return;
    }
    const opening = ts.isJsxElement(node) ? node.openingElement : node;
    const tag = opening.tagName.getText(source);
    const custom = components.has(tag);
    if (!custom && !TAGS.has(tag)) reject(opening);
    const fields = new Map<string, Value>();
    for (const attribute of opening.attributes.properties) {
      if (!ts.isJsxAttribute(attribute) || !ts.isIdentifier(attribute.name)) {
        reject(attribute);
        continue;
      }
      const name = attribute.name.text;
      const initializer = attribute.initializer;
      if (!initializer || fields.has(name)) {
        reject(attribute);
        continue;
      }
      let item: Value;
      if (ts.isStringLiteral(initializer)) item = { ...scalar(), text: initializer.text };
      else if (ts.isJsxExpression(initializer) && initializer.expression)
        item = expression(initializer.expression, local);
      else {
        reject(attribute);
        continue;
      }
      fields.set(name, item);
      if (!custom) {
        if (name === 'onClick' && tag === 'button' && item.kind === 'callback') {
          if (item.callback && item.scope)
            callback(item.callback, { ...item.scope, reachable: local.reachable }, []);
        } else if (!ATTRIBUTES.has(name) || item.kind !== 'scalar') reject(attribute);
      }
    }
    if (custom) {
      if (
        ts.isJsxElement(node) &&
        node.children.some((child) => !ts.isJsxText(child) || child.text.trim())
      )
        reject(node, 'この課題の部品には値と操作を明示したPropsで渡します。');
      const passed = new Map(
        [...fields].map(([name, item]) => [
          name,
          item.kind === 'scalar' ? { ...item, received: !!item.numeric } : item,
        ]),
      );
      visitComponent(
        tag,
        { kind: 'object', fields: passed },
        local.reachable,
        local.temperatureDisplay,
      );
    } else if (ts.isJsxElement(node)) {
      const id = fields.get('id')?.text;
      const childScope = {
        ...local,
        temperatureDisplay: local.temperatureDisplay || id === 'celsius' || id === 'fahrenheit',
      };
      for (const child of node.children) renderChild(child, childScope);
    }
  };
  const renderChild = (node: ts.JsxChild, scope: Scope): void => {
    if (ts.isJsxText(node)) return;
    if (ts.isJsxExpression(node)) {
      if (node.expression) render(expression(node.expression, scope), scope);
    } else render({ kind: 'jsx', jsx: node, scope }, scope);
  };
  const visitComponent = (
    name: string,
    props: Value,
    reachable: boolean,
    temperatureDisplay = false,
  ): void => {
    const node = components.get(name)!;
    if (!tick(node) || componentStack.has(name)) {
      reject(node, '部品の再帰はこの課題では使いません。');
      return;
    }
    componentStack.add(name);
    const scope: Scope = { values: new Map(), owner: name, reachable, temperatureDisplay };
    if (node.parameters.length > 1 || (name === 'App' && node.parameters.length) || !node.body)
      reject(node);
    for (const parameter of node.parameters) {
      if (!parameter.type) reject(parameter, '受け取るPropsには自分で型を指定します。');
      else typeValue(parameter.type);
      bind(parameter, props, scope);
    }
    if (node.body) render(body(node.body, scope, true), scope);
    componentStack.delete(name);
  };
  // 未使用部品も安全な構文を要求する。学習factはAppから到達した経路だけで収集する。
  for (const [name, node] of components) {
    const type = node.parameters[0]?.type;
    visitComponent(name, type ? typeValue(type) : { kind: 'object', fields: new Map() }, false);
  }
  if (components.has('App')) visitComponent('App', { kind: 'object', fields: new Map() }, true);
  for (const { node, scope } of pendingCallbacks)
    callback(node, { ...scope, reachable: false }, []);
  return {
    diagnostics,
    facts: {
      rendersAuthoredDisplay: [...authoredStates].some((state) => updated.has(state)),
      usesInteractiveState: [...displayed].some((state) => updated.has(state)),
    },
  };
}
