import ts from 'typescript';
import type { TypeScriptDiagnostic } from '../typescript/compileTypeScript';

export interface StaticComponentFacts {
  readonly reusesCardWithDistinctProps: boolean;
  readonly rendersReceivedChildren: boolean;
  readonly rendersAssignedPairs: boolean;
}
interface Component {
  readonly declaration: ts.FunctionDeclaration;
  readonly kind: 'CardProps' | 'PanelProps' | 'none';
  readonly bindings: ReadonlyMap<string, string>;
  readonly parameterName: string | undefined;
  readonly expression: ts.Expression;
}
interface Origin {
  readonly id: number;
  readonly field: string;
}
interface Closure {
  readonly nodes: readonly ts.Node[];
  readonly scope: Scope;
}
interface Value {
  readonly data: string | number | Closure;
  readonly origins: readonly Origin[];
}
interface Scope {
  readonly component: Component;
  readonly values: ReadonlyMap<string, Value>;
}
const INTRINSIC_TAGS = new Set(['section', 'div', 'h1', 'h2', 'p', 'strong', 'span']);
const FIXED_ATTRIBUTES = new Set(['id', 'aria-labelledby', 'className']);

/** 純粋な静的JSXを宣言へ解決する。名前・整形・分割は固定せず、能力を増やす式は認めない。 */
export function analyzeStaticComponents(sourceText: string): {
  readonly diagnostics: readonly TypeScriptDiagnostic[];
  readonly facts: StaticComponentFacts;
} {
  const source = ts.createSourceFile(
    'components.tsx',
    sourceText,
    ts.ScriptTarget.ES2023,
    true,
    ts.ScriptKind.TSX,
  );
  const diagnostics: TypeScriptDiagnostic[] = [];
  const reject = (node: ts.Node, message: string): void => {
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
  const aliases = new Map<string, string>();
  const components = new Map<string, Component>();
  let entry: string | undefined;
  if (/@ts-(?:ignore|expect-error|nocheck)\b/u.test(sourceText))
    reject(source, '型検査を無効にせず、Propsを直してください。');
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    const bindings = statement.importClause?.namedBindings;
    if (
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== './types' ||
      statement.importClause?.phaseModifier !== ts.SyntaxKind.TypeKeyword ||
      statement.importClause.name ||
      !bindings ||
      !ts.isNamedImports(bindings)
    ) {
      reject(statement, 'importは用意済みtypesの型だけです。');
      continue;
    }
    for (const binding of bindings.elements) {
      const original = binding.propertyName?.text ?? binding.name.text;
      if (
        !['CardProps', 'PanelProps', 'ReactElement'].includes(original) ||
        aliases.has(binding.name.text)
      )
        reject(binding, '用意済みのPropsとReactElement型を使います。');
      else aliases.set(binding.name.text, original);
    }
  }
  for (const statement of source.statements) {
    if (ts.isImportDeclaration(statement)) continue;
    if (
      ts.isExportDeclaration(statement) &&
      !statement.moduleSpecifier &&
      !statement.isTypeOnly &&
      statement.exportClause &&
      ts.isNamedExports(statement.exportClause)
    ) {
      for (const binding of statement.exportClause.elements) {
        if (binding.name.text !== 'App' || entry)
          reject(binding, '起動入口のAppだけをexportします。内部名は変えられます。');
        else entry = binding.propertyName?.text ?? binding.name.text;
      }
      continue;
    }
    if (
      !ts.isFunctionDeclaration(statement) ||
      !statement.name ||
      !/^[A-Z][A-Za-z0-9_]*$/u.test(statement.name.text) ||
      statement.asteriskToken ||
      statement.typeParameters ||
      statement.parameters.length > 1 ||
      statement.modifiers?.some((modifier) => modifier.kind !== ts.SyntaxKind.ExportKeyword) ||
      statement.body?.statements.length !== 1 ||
      !ts.isReturnStatement(statement.body.statements[0]!) ||
      !statement.body.statements[0].expression
    ) {
      reject(
        statement,
        'Componentは大文字で始まる表示関数にし、JSXだけをreturnします。副作用や非同期処理は使いません。',
      );
      continue;
    }
    const name = statement.name.text;
    if (components.has(name)) reject(statement, 'Component名が重複しています。');
    if (statement.modifiers?.length) {
      if (name !== 'App' || entry) reject(statement, '起動入口のAppだけをexportします。');
      else entry = name;
    }
    if (
      statement.type &&
      (!ts.isTypeReferenceNode(statement.type) ||
        !ts.isIdentifier(statement.type.typeName) ||
        aliases.get(statement.type.typeName.text) !== 'ReactElement' ||
        statement.type.typeArguments)
    )
      reject(statement.type, '戻り値の注釈は用意済みReactElement型にします。');
    const parameter = statement.parameters[0];
    const parameterType = parameter?.type;
    const kind =
      parameterType &&
      ts.isTypeReferenceNode(parameterType) &&
      ts.isIdentifier(parameterType.typeName) &&
      !parameterType.typeArguments
        ? aliases.get(parameterType.typeName.text)
        : 'none';
    const bindings = new Map<string, string>();
    let parameterName: string | undefined;
    if (kind !== 'CardProps' && kind !== 'PanelProps' && !(kind === 'none' && !parameter)) {
      reject(statement, '引数は用意済みCardPropsかPanelProps型にします。');
      continue;
    }
    if (parameter) {
      const fields = kind === 'CardProps' ? ['title', 'summary'] : ['children'];
      if (
        parameter.initializer ||
        parameter.dotDotDotToken ||
        parameter.questionToken ||
        parameter.modifiers
      )
        reject(parameter, '引数の初期化やrestは使いません。');
      if (ts.isIdentifier(parameter.name)) parameterName = parameter.name.text;
      else if (ts.isObjectBindingPattern(parameter.name)) {
        for (const binding of parameter.name.elements) {
          const field = binding.propertyName
            ? ts.isIdentifier(binding.propertyName)
              ? binding.propertyName.text
              : ''
            : ts.isIdentifier(binding.name)
              ? binding.name.text
              : '';
          if (
            !ts.isIdentifier(binding.name) ||
            !fields.includes(field) ||
            binding.initializer ||
            binding.dotDotDotToken ||
            bindings.has(binding.name.text)
          )
            reject(binding, '型のPropsを分割代入で読みます。引数名は変えられます。');
          else bindings.set(binding.name.text, field);
        }
      } else reject(parameter, 'Propsオブジェクトか分割代入で値を受け取ります。');
    }
    components.set(name, {
      declaration: statement,
      kind,
      bindings,
      parameterName,
      expression: statement.body.statements[0].expression,
    });
  }
  if (!entry || !components.has(entry) || components.get(entry)?.kind !== 'none')
    reject(source, '引数なしの表示ComponentをAppとしてexportします。');
  let jsxCount = 0;
  const edges = new Map<string, string[]>();
  for (const [name, component] of components) {
    const calls: string[] = [];
    edges.set(name, calls);
    const fields = component.kind === 'CardProps' ? ['title', 'summary'] : ['children'];
    let childrenReads = 0;
    const fieldOf = (expression: ts.Expression): string | undefined => {
      if (ts.isIdentifier(expression)) return component.bindings.get(expression.text);
      if (
        ts.isPropertyAccessExpression(expression) &&
        ts.isIdentifier(expression.expression) &&
        expression.expression.text === component.parameterName &&
        fields.includes(expression.name.text)
      )
        return expression.name.text;
      return undefined;
    };
    const value = (expression: ts.Expression): void => {
      const node = unparenthesize(expression);
      if (ts.isStringLiteral(node) || ts.isNumericLiteral(node)) return;
      const field = fieldOf(node);
      if (field) {
        if (field === 'children') childrenReads += 1;
        return;
      }
      if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node)) {
        jsx(node);
        return;
      }
      reject(node, 'JSXには文字列・数値・受け取ったProps・静的JSXだけを渡します。');
    };
    const jsx = (node: ts.Node): void => {
      jsxCount += 1;
      if (jsxCount > 256) {
        reject(node, 'この導入では小さな表示に分けてください。');
        return;
      }
      if (ts.isJsxText(node)) return;
      if (ts.isJsxExpression(node)) {
        if (node.expression) value(node.expression);
        return;
      }
      if (ts.isJsxFragment(node)) {
        node.children.forEach(jsx);
        return;
      }
      if (!ts.isJsxElement(node) && !ts.isJsxSelfClosingElement(node)) {
        reject(node, '表示は静的JSXで書きます。');
        return;
      }
      const opening = ts.isJsxElement(node) ? node.openingElement : node;
      const tag = ts.isIdentifier(opening.tagName) ? opening.tagName.text : '';
      const intrinsic = INTRINSIC_TAGS.has(tag);
      const target = components.get(tag);
      if (!intrinsic && !target)
        reject(opening, '用意した表示Componentかsection・div・見出し・p・strong・spanを使います。');
      if (target) calls.push(tag);
      const allowed = intrinsic
        ? FIXED_ATTRIBUTES
        : new Set(
            target?.kind === 'CardProps'
              ? ['title', 'summary']
              : target?.kind === 'PanelProps'
                ? ['children']
                : [],
          );
      for (const attribute of opening.attributes.properties) {
        if (!ts.isJsxAttribute(attribute) || !allowed.has(attribute.name.getText(source))) {
          reject(attribute, 'spread・ref・イベント・URL・HTML挿入は使えません。');
          continue;
        }
        if (intrinsic && (!attribute.initializer || !ts.isStringLiteral(attribute.initializer)))
          reject(attribute, 'DOM属性は固定文字列にします。');
        else if (
          attribute.initializer &&
          ts.isJsxExpression(attribute.initializer) &&
          attribute.initializer.expression
        )
          value(attribute.initializer.expression);
      }
      if (ts.isJsxElement(node)) node.children.forEach(jsx);
    };
    const expression = unparenthesize(component.expression);
    if (
      !ts.isJsxElement(expression) &&
      !ts.isJsxSelfClosingElement(expression) &&
      !ts.isJsxFragment(expression)
    )
      reject(expression, 'ComponentからJSXをreturnします。');
    else jsx(expression);
    if (childrenReads > 1)
      reject(component.declaration, 'この導入では受け取ったchildrenを1回だけ表示します。');
  }
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const visit = (name: string): void => {
    if (visiting.has(name)) {
      reject(components.get(name)!.declaration, 'Componentを自分自身へ戻す再帰は使いません。');
      return;
    }
    if (visited.has(name)) return;
    visiting.add(name);
    for (const target of edges.get(name) ?? []) visit(target);
    visiting.delete(name);
    visited.add(name);
  };
  for (const name of components.keys()) visit(name);
  const empty = {
    reusesCardWithDistinctProps: false,
    rendersReceivedChildren: false,
    rendersAssignedPairs: false,
  };
  if (diagnostics.length || !entry) return { diagnostics, facts: empty };
  try {
    return { diagnostics, facts: evaluateDisplay(components, entry) };
  } catch {
    reject(source, '静的な表示の展開が大きすぎます。小さなComponentの組み合わせにしてください。');
    return { diagnostics, facts: empty };
  }
}

/** 括弧だけを外す。assertionや任意の式は評価しない。 */
function unparenthesize(node: ts.Expression): ts.Expression {
  return ts.isParenthesizedExpression(node) ? unparenthesize(node.expression) : node;
}

/** 有限JSXを抽象評価し、実行せずPropsの表示経路を追う。未使用の宣言を達成条件に数えない。 */
function evaluateDisplay(
  components: ReadonlyMap<string, Component>,
  entry: string,
): StaticComponentFacts {
  let work = 0;
  let sequence = 0;
  const cards = new Map<
    number,
    { name: string; values: string; shown: Set<string>; panels: readonly number[] }
  >();
  const displayedChildren = new Set<number>();
  const read = (expression: ts.Expression, scope: Scope): Value | undefined => {
    const node = unparenthesize(expression);
    if (ts.isStringLiteral(node) || ts.isNumericLiteral(node))
      return { data: node.text, origins: [] };
    const field = ts.isIdentifier(node)
      ? scope.component.bindings.get(node.text)
      : ts.isPropertyAccessExpression(node)
        ? node.name.text
        : undefined;
    if (field) return scope.values.get(field);
    return { data: { nodes: [node], scope }, origins: [] };
  };
  const display = (item: Value | undefined, panels: readonly number[], role?: string): void => {
    if (!item) return;
    for (const origin of item.origins) {
      if (origin.field === 'children') displayedChildren.add(origin.id);
      else if (role === origin.field) cards.get(origin.id)?.shown.add(origin.field);
    }
    if (typeof item.data === 'object') {
      const ancestors = [
        ...panels,
        ...item.origins.filter((origin) => origin.field === 'children').map((origin) => origin.id),
      ];
      for (const node of item.data.nodes) walk(node, item.data.scope, ancestors, role);
    }
  };
  const invoke = (
    name: string,
    values: ReadonlyMap<string, Value>,
    panels: readonly number[],
    role?: string,
  ): void => {
    const component = components.get(name)!;
    const id = ++sequence;
    if (component.kind === 'CardProps')
      cards.set(id, {
        name,
        values: JSON.stringify(['title', 'summary'].map((field) => values.get(field)?.data)),
        shown: new Set(),
        panels,
      });
    const bound = new Map(
      [...values].map(([field, item]) => [
        field,
        { ...item, origins: [...item.origins, { id, field }] },
      ]),
    );
    walk(component.expression, { component, values: bound }, panels, role);
  };
  const walk = (node: ts.Node, scope: Scope, panels: readonly number[], role?: string): void => {
    if (++work > 2048) throw new Error('Static expansion limit');
    if (ts.isParenthesizedExpression(node)) {
      walk(node.expression, scope, panels, role);
      return;
    }
    if (ts.isJsxExpression(node)) {
      if (node.expression) display(read(node.expression, scope), panels, role);
      return;
    }
    if (ts.isJsxFragment(node)) {
      node.children.forEach((child) => {
        walk(child, scope, panels, role);
      });
      return;
    }
    if (!ts.isJsxElement(node) && !ts.isJsxSelfClosingElement(node)) return;
    const opening = ts.isJsxElement(node) ? node.openingElement : node;
    const tag = opening.tagName.getText();
    if (INTRINSIC_TAGS.has(tag)) {
      const childRole =
        tag === 'h2'
          ? 'title'
          : tag === 'p'
            ? 'summary'
            : ['span', 'strong'].includes(tag)
              ? role
              : undefined;
      if (ts.isJsxElement(node))
        node.children.forEach((child) => {
          walk(child, scope, panels, childRole);
        });
      return;
    }
    const values = new Map<string, Value>();
    for (const attribute of opening.attributes.properties) {
      if (!ts.isJsxAttribute(attribute) || !attribute.initializer) continue;
      const item = ts.isStringLiteral(attribute.initializer)
        ? { data: attribute.initializer.text, origins: [] }
        : ts.isJsxExpression(attribute.initializer) && attribute.initializer.expression
          ? read(attribute.initializer.expression, scope)
          : undefined;
      if (item) values.set(attribute.name.getText(), item);
    }
    if (ts.isJsxElement(node)) {
      const children = node.children.filter((child) => !ts.isJsxText(child) || child.text.trim());
      if (children.length)
        values.set('children', { data: { nodes: children, scope }, origins: [] });
    }
    invoke(tag, values, panels, role);
  };
  invoke(entry, new Map(), []);
  const groups = new Map<string, Set<string>>();
  let rendersReceivedChildren = false;
  const assigned = new Set([
    JSON.stringify(['HTML', '内容を組み立てる']),
    JSON.stringify(['CSS', '見た目を整える']),
  ]);
  for (const card of cards.values()) {
    if (!card.shown.has('title') || !card.shown.has('summary')) continue;
    assigned.delete(card.values);
    const signatures = groups.get(card.name) ?? new Set<string>();
    signatures.add(card.values);
    groups.set(card.name, signatures);
    if (card.panels.some((id) => displayedChildren.has(id))) rendersReceivedChildren = true;
  }
  return {
    reusesCardWithDistinctProps: [...groups.values()].some((values) => values.size >= 2),
    rendersReceivedChildren,
    rendersAssignedPairs: assigned.size === 0,
  };
}
