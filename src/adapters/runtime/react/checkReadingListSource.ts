import ts from 'typescript';
import type { TypeScriptDiagnostic } from '../typescript/compileTypeScript';

export interface ReadingListFacts {
  readonly definesBookComponent: boolean;
  readonly ownsReadingState: boolean;
  readonly usesStableBookKeys: boolean;
}

const tags = new Set([
  'section',
  'div',
  'ul',
  'li',
  'h1',
  'h2',
  'h3',
  'p',
  'span',
  'strong',
  'button',
]);
const attributes = new Set([
  'id',
  'className',
  'type',
  'key',
  'data-id',
  'aria-label',
  'aria-live',
  'aria-pressed',
  'aria-labelledby',
  'disabled',
  'onClick',
  'book',
  'onToggle',
]);
const forbiddenNames = new Set([
  'window',
  'document',
  'globalThis',
  'location',
  'navigator',
  'fetch',
  'eval',
  'Function',
  'constructor',
  'prototype',
  '__proto__',
  'setTimeout',
  'setInterval',
  'requestAnimationFrame',
]);

type MapRenderer = ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction;
interface RendererKeyFacts {
  readonly renders: boolean;
  readonly stable: boolean;
}
type ReadingValue = boolean | { readonly [property: string]: ReadingValue };
type ReadingKey = boolean | 'unrelated';
interface SourceBinding {
  readonly node: ts.Declaration;
  readonly fields: readonly string[];
}

/** 代入パターンの値や既定値を読み取りと混同せず、実際の書込先を取り出す。 */
function writtenProperties(expression: ts.Expression): readonly ts.PropertyAccessExpression[] {
  const pending = [expression];
  const properties: ts.PropertyAccessExpression[] = [];
  while (pending.length) {
    let target = pending.pop()!;
    while (
      ts.isParenthesizedExpression(target) ||
      ts.isAsExpression(target) ||
      ts.isTypeAssertionExpression(target) ||
      ts.isNonNullExpression(target)
    )
      target = target.expression;
    if (ts.isPropertyAccessExpression(target)) properties.push(target);
    else if (
      ts.isBinaryExpression(target) &&
      target.operatorToken.kind === ts.SyntaxKind.EqualsToken
    )
      pending.push(target.left);
    else if (ts.isObjectLiteralExpression(target)) {
      for (const property of target.properties) {
        if (ts.isPropertyAssignment(property)) pending.push(property.initializer);
        else if (ts.isSpreadAssignment(property)) pending.push(property.expression);
      }
    } else if (ts.isArrayLiteralExpression(target)) {
      for (const element of target.elements)
        pending.push(ts.isSpreadElement(element) ? element.expression : element);
    }
  }
  return properties;
}

/** 固定booleanだけを判定し、Stateなど未確定の条件は絞り込まない。 */
function literalBoolean(node: ts.Expression): boolean | undefined {
  while (
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isNonNullExpression(node)
  )
    node = node.expression;
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  return undefined;
}

/** 固定条件とreturnの後を除き、実行し得る文だけを読む。未知の条件は両側を残す。 */
function reachableStatements(node: ts.Node, visit: (node: ts.Node) => void): boolean {
  if (ts.isFunctionLike(node)) return false;
  if (ts.isBlock(node)) {
    for (const statement of node.statements) if (reachableStatements(statement, visit)) return true;
  } else if (ts.isIfStatement(node)) {
    const condition = literalBoolean(node.expression);
    const thenReturns = condition !== false && reachableStatements(node.thenStatement, visit);
    const elseReturns =
      condition !== true && !!node.elseStatement && reachableStatements(node.elseStatement, visit);
    return condition === true
      ? thenReturns
      : condition === false
        ? elseReturns
        : thenReturns && elseReturns;
  } else if (ts.isReturnStatement(node)) {
    visit(node);
    return true;
  } else if (ts.isVariableStatement(node)) {
    for (const declaration of node.declarationList.declarations) visit(declaration);
  } else if (ts.isExpressionStatement(node)) visit(node);
  else
    ts.forEachChild(node, (child) => {
      reachableStatements(child, visit);
    });
  return false;
}

function bindingFields(binding: ts.BindingName, name: string): readonly string[] | undefined {
  if (ts.isIdentifier(binding)) return binding.text === name ? [] : undefined;
  for (const [index, element] of binding.elements.entries()) {
    if (!ts.isBindingElement(element)) continue;
    const nested = bindingFields(element.name, name);
    if (nested === undefined) continue;
    const property = ts.isArrayBindingPattern(binding)
      ? String(index)
      : (element.propertyName?.getText().replace(/^['"]|['"]$/gu, '') ?? element.name.getText());
    return [property, ...nested];
  }
  return undefined;
}

/** 内側の変数・引数を優先し、別スコープの同名宣言を取り違えない。 */
function sourceBinding(name: string, from: ts.Node): SourceBinding | undefined {
  for (let scope = from; ; scope = scope.parent) {
    if (ts.isFunctionLike(scope)) {
      for (const parameter of scope.parameters) {
        const fields = bindingFields(parameter.name, name);
        if (fields !== undefined) return { node: parameter, fields };
      }
    }
    if (!ts.isBlock(scope) && !ts.isSourceFile(scope)) continue;
    for (const statement of scope.statements) {
      if (ts.isFunctionDeclaration(statement) && statement.name?.text === name)
        return { node: statement, fields: [] };
      if (ts.isVariableStatement(statement)) {
        for (const declaration of statement.declarationList.declarations) {
          const fields = bindingFields(declaration.name, name);
          if (fields !== undefined) return { node: declaration, fields };
        }
      }
      if (ts.isImportDeclaration(statement)) {
        const bindings = statement.importClause?.namedBindings;
        if (bindings && ts.isNamedImports(bindings)) {
          const binding = bindings.elements.find((element) => element.name.text === name);
          if (binding) return { node: binding, fields: [] };
        }
      }
    }
    if (ts.isSourceFile(scope)) break;
  }
  return undefined;
}

function mapRenderer(callback: ts.Node | undefined, from: ts.Node): MapRenderer | undefined {
  if (!callback) return undefined;
  if (ts.isParenthesizedExpression(callback)) return mapRenderer(callback.expression, from);
  if (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback)) return callback;
  if (!ts.isIdentifier(callback)) return undefined;
  const binding = sourceBinding(callback.text, from);
  if (!binding || binding.fields.length) return undefined;
  if (ts.isFunctionDeclaration(binding.node)) return binding.node.body ? binding.node : undefined;
  if (ts.isVariableDeclaration(binding.node)) {
    const value = binding.node.initializer;
    return value && (ts.isArrowFunction(value) || ts.isFunctionExpression(value))
      ? value
      : undefined;
  }
  return undefined;
}

function exportedRenderer(source: ts.SourceFile, name: string): MapRenderer | undefined {
  for (const statement of source.statements) {
    if (
      ts.isExportDeclaration(statement) &&
      statement.exportClause &&
      ts.isNamedExports(statement.exportClause)
    ) {
      const item = statement.exportClause.elements.find((element) => element.name.text === name);
      if (item) return mapRenderer(item.propertyName ?? item.name, source);
    }
    const exported =
      ts.canHaveModifiers(statement) &&
      ts.getModifiers(statement)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
    if (!exported) continue;
    if (ts.isFunctionDeclaration(statement) && statement.name?.text === name && statement.body)
      return statement;
    if (ts.isVariableStatement(statement)) {
      const declaration = statement.declarationList.declarations.find(
        (item) => ts.isIdentifier(item.name) && item.name.text === name,
      );
      if (declaration) return mapRenderer(declaration.initializer, source);
    }
  }
  return undefined;
}

/** IDの別名・分割代入・JSXの一時変数も、同じmap引数までたどる。 */
function rendererKeys(
  renderer: MapRenderer,
  cache: Map<MapRenderer, RendererKeyFacts>,
  active = new Set<MapRenderer>(),
): RendererKeyFacts {
  const cached = cache.get(renderer);
  if (cached) return cached;
  if (active.has(renderer)) return { renders: false, stable: false };
  active.add(renderer);
  const parameter = renderer.parameters[0];
  let renders = false;
  let stable = true;
  const resolving = new Set<ts.Node>();
  const isItem = (value: ts.Expression): boolean => {
    if (!ts.isIdentifier(value)) return false;
    const binding = sourceBinding(value.text, value);
    if (!binding || binding.fields.length) return false;
    if (binding.node === parameter) return true;
    if (
      !ts.isVariableDeclaration(binding.node) ||
      !binding.node.initializer ||
      resolving.has(binding.node)
    )
      return false;
    const initial = binding.node.initializer;
    return resolve(binding.node, () => isItem(initial));
  };
  const resolve = (node: ts.Node, operation: () => boolean): boolean => {
    resolving.add(node);
    try {
      return operation();
    } finally {
      resolving.delete(node);
    }
  };
  const isId = (value: ts.Expression): boolean => {
    if (ts.isParenthesizedExpression(value)) return isId(value.expression);
    if (ts.isPropertyAccessExpression(value))
      return value.name.text === 'id' && isItem(value.expression);
    if (!ts.isIdentifier(value)) return false;
    const binding = sourceBinding(value.text, value);
    if (!binding || resolving.has(binding.node)) return false;
    if (binding.node === parameter) return binding.fields.join('.') === 'id';
    if (!ts.isVariableDeclaration(binding.node) || !binding.node.initializer) return false;
    const initial = binding.node.initializer;
    return resolve(binding.node, () =>
      binding.fields.join('.') === 'id' ? isItem(initial) : !binding.fields.length && isId(initial),
    );
  };
  const expression = (value: ts.Expression): void => {
    if (ts.isParenthesizedExpression(value)) {
      expression(value.expression);
      return;
    }
    if (ts.isIdentifier(value)) {
      const binding = sourceBinding(value.text, value);
      if (
        binding &&
        !binding.fields.length &&
        ts.isVariableDeclaration(binding.node) &&
        binding.node.initializer &&
        !resolving.has(binding.node)
      ) {
        resolving.add(binding.node);
        expression(binding.node.initializer);
        resolving.delete(binding.node);
      }
    } else if (ts.isCallExpression(value)) {
      const called = mapRenderer(value.expression, value);
      if (called) {
        const returned = rendererKeys(called, cache, active);
        renders ||= returned.renders;
        stable &&= returned.stable && value.arguments.length === 1 && isItem(value.arguments[0]!);
      }
    } else if (ts.isConditionalExpression(value)) {
      const condition = literalBoolean(value.condition);
      if (condition !== false) expression(value.whenTrue);
      if (condition !== true) expression(value.whenFalse);
    } else if (
      ts.isBinaryExpression(value) &&
      value.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken
    ) {
      if (literalBoolean(value.left) !== false) expression(value.right);
    } else if (
      ts.isJsxElement(value) ||
      ts.isJsxSelfClosingElement(value) ||
      ts.isJsxFragment(value)
    ) {
      renders = true;
      const opening = ts.isJsxElement(value) ? value.openingElement : value;
      const keyed =
        !ts.isJsxFragment(opening) &&
        opening.attributes.properties.some(
          (attribute) =>
            ts.isJsxAttribute(attribute) &&
            attribute.name.getText() === 'key' &&
            attribute.initializer &&
            ts.isJsxExpression(attribute.initializer) &&
            attribute.initializer.expression &&
            isId(attribute.initializer.expression),
        );
      stable &&= keyed;
    }
  };
  const returns = (node: ts.Node): void => {
    if (ts.isReturnStatement(node)) {
      if (node.expression) expression(node.expression);
    }
  };
  if (renderer.body) {
    if (ts.isBlock(renderer.body)) reachableStatements(renderer.body, returns);
    else expression(renderer.body);
  }
  active.delete(renderer);
  const result = { renders, stable };
  cache.set(renderer, result);
  return result;
}

/** 数値や実DOMは実行せず、Stateの値が実使用するBookCardへ渡る経路だけを追う。 */
function readingUsage(sources: ReadonlyMap<string, ts.SourceFile>): ReadingListFacts {
  const card = sources.get('BookCard.tsx');
  const parent = sources.get('components.tsx');
  const cardRenderer = card && exportedRenderer(card, 'BookCard');
  if (!cardRenderer)
    return { definesBookComponent: false, ownsReadingState: false, usesStableBookKeys: false };
  if (!parent)
    return { definesBookComponent: true, ownsReadingState: false, usesStableBookKeys: false };
  const app = exportedRenderer(parent, 'App');
  if (!app)
    return { definesBookComponent: false, ownsReadingState: false, usesStableBookKeys: false };
  const active = new Set<MapRenderer>();
  // 同じhelperの共有部分は1解析内で再利用し、非循環の分岐を指数的に展開しない。
  const keyFacts = new Map<MapRenderer, RendererKeyFacts>();
  let budget = 2000;
  // JSXを作った時点では使用と数えず、返すツリーに由来を付けて運ぶ。
  const renderedBooks = new WeakMap<object, readonly ReadingValue[]>();
  const booksIn = (value: ReadingValue): readonly ReadingValue[] =>
    typeof value === 'object' ? (renderedBooks.get(value) ?? []) : [];
  const renderedKeys = new WeakMap<object, readonly ReadingKey[]>();
  const keysIn = (value: ReadingValue): readonly ReadingKey[] =>
    typeof value === 'object' ? (renderedKeys.get(value) ?? []) : [];
  const tree = (
    books: readonly ReadingValue[],
    keys: readonly ReadingKey[] = [],
    node: { readonly [property: string]: ReadingValue } = {},
  ): ReadingValue => {
    renderedBooks.set(node, books);
    renderedKeys.set(node, keys);
    return node;
  };
  const mergeRenderings = (
    first: ReadingValue,
    second: ReadingValue,
    selected: ReadingValue,
  ): ReadingValue => {
    const books = [...booksIn(first), ...booksIn(second)];
    const keys = [...keysIn(first), ...keysIn(second)];
    return books.length || keys.length ? tree(books, keys) : selected;
  };
  type Values = Map<ts.Declaration, ReadingValue>;
  const pick = (value: ReadingValue, fields: readonly string[]): ReadingValue => {
    for (const field of fields)
      value = typeof value === 'boolean' ? value : (value[field] ?? false);
    return value;
  };
  const imported = (node: ts.Node, name: string, module: string): boolean => {
    if (!ts.isIdentifier(node)) return false;
    const binding = sourceBinding(node.text, node);
    if (!binding || !ts.isImportSpecifier(binding.node)) return false;
    const declaration = binding.node.parent.parent.parent;
    return (
      (binding.node.propertyName?.text ?? binding.node.name.text) === name &&
      ts.isImportDeclaration(declaration) &&
      ts.isStringLiteral(declaration.moduleSpecifier) &&
      declaration.moduleSpecifier.text === module
    );
  };
  const run = (
    renderer: MapRenderer,
    arguments_: readonly ReadingValue[],
    outer: Values,
  ): ReadingValue => {
    if (active.has(renderer) || --budget < 0) return false;
    active.add(renderer);
    const values = new Map(outer);
    renderer.parameters.forEach((parameter, index) =>
      values.set(parameter, arguments_[index] ?? false),
    );
    let returned: ReadingValue = false;
    const statements = (node: ts.Node): void => {
      if (ts.isFunctionLike(node)) return;
      if (ts.isVariableDeclaration(node)) {
        values.set(node, node.initializer ? value(node.initializer, values) : false);
        return;
      }
      if (ts.isReturnStatement(node)) {
        if (node.expression) {
          const next = value(node.expression, values);
          returned = returned ? mergeRenderings(returned, next, next || returned) : next;
        }
        return;
      }
      if (ts.isExpressionStatement(node)) {
        value(node.expression, values);
        return;
      }
    };
    try {
      if (renderer.body) {
        if (ts.isBlock(renderer.body)) reachableStatements(renderer.body, statements);
        else returned = value(renderer.body, values);
      }
      return returned;
    } finally {
      active.delete(renderer);
    }
  };
  const value = (node: ts.Expression, values: Values): ReadingValue => {
    if (--budget < 0) return false;
    if (
      ts.isParenthesizedExpression(node) ||
      ts.isAsExpression(node) ||
      ts.isNonNullExpression(node)
    )
      return value(node.expression, values);
    if (ts.isIdentifier(node)) {
      const binding = sourceBinding(node.text, node);
      if (!binding) return false;
      let result = values.get(binding.node);
      if (
        result === undefined &&
        ts.isVariableDeclaration(binding.node) &&
        binding.node.initializer
      ) {
        values.set(binding.node, false);
        result = value(binding.node.initializer, values);
        values.set(binding.node, result);
      }
      return pick(result ?? false, binding.fields);
    }
    if (ts.isPropertyAccessExpression(node))
      return pick(value(node.expression, values), [node.name.text]);
    if (ts.isArrayLiteralExpression(node)) {
      const items = node.elements.map((element) => value(element, values));
      const array = Object.fromEntries(items.map((item, index) => [String(index), item]));
      const books = items.flatMap(booksIn);
      return books.length ? tree(books, items.flatMap(keysIn), array) : array;
    }
    if (ts.isObjectLiteralExpression(node)) {
      const fields: Record<string, ReadingValue> = {};
      let copiedState = false;
      for (const property of node.properties) {
        if (ts.isPropertyAssignment(property))
          fields[property.name.getText()] = value(property.initializer, values);
        else if (ts.isShorthandPropertyAssignment(property))
          fields[property.name.text] = value(property.name, values);
        else if (ts.isSpreadAssignment(property)) {
          const copied = value(property.expression, values);
          if (copied === true) copiedState = true;
          else if (typeof copied === 'object') Object.assign(fields, copied);
        }
      }
      return copiedState ? true : fields;
    }
    if (ts.isCallExpression(node)) {
      if (imported(node.expression, 'useState', 'react')) return { '0': true, '1': false };
      if (ts.isPropertyAccessExpression(node.expression)) {
        const receiver = value(node.expression.expression, values);
        if (node.expression.name.text === 'filter') return receiver;
        if (node.expression.name.text === 'map') {
          const callback = mapRenderer(node.arguments[0], node);
          const mapped = callback ? run(callback, [receiver], values) : false;
          const keys = callback ? rendererKeys(callback, keyFacts) : undefined;
          const books = booksIn(mapped);
          const nestedKeys = keysIn(mapped);
          // 別の一覧は描画結果として保持するが、書籍Keyの成否には数えない。
          return keys?.renders
            ? tree(books, [...nestedKeys, books.length ? keys.stable : 'unrelated'])
            : books.length || nestedKeys.length
              ? mapped
              : receiver;
        }
      }
      const called = mapRenderer(node.expression, node);
      return called
        ? run(
            called,
            node.arguments.map((argument) => value(argument, values)),
            values,
          )
        : false;
    }
    if (ts.isConditionalExpression(node)) {
      const condition = literalBoolean(node.condition);
      if (condition === true) return value(node.whenTrue, values);
      if (condition === false) return value(node.whenFalse, values);
      const first = value(node.whenTrue, values);
      const second = value(node.whenFalse, values);
      return mergeRenderings(
        first,
        second,
        first === true || second === true ? true : first || second,
      );
    }
    if (ts.isBinaryExpression(node)) {
      const left = value(node.left, values);
      const condition = literalBoolean(node.left);
      if (node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken && condition === false)
        return left;
      if (node.operatorToken.kind === ts.SyntaxKind.BarBarToken && condition === true) return left;
      return value(node.right, values);
    }
    if (ts.isJsxFragment(node) || ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const children: ReadingValue[] = [];
      if (!ts.isJsxSelfClosingElement(node))
        for (const child of node.children) {
          if (ts.isJsxExpression(child)) {
            if (child.expression) children.push(value(child.expression, values));
          } else if (
            ts.isJsxElement(child) ||
            ts.isJsxSelfClosingElement(child) ||
            ts.isJsxFragment(child)
          )
            children.push(value(child, values));
        }
      const childTree = tree(children.flatMap(booksIn), children.flatMap(keysIn));
      if (ts.isJsxFragment(node)) return childTree;
      const opening = ts.isJsxElement(node) ? node.openingElement : node;
      const props: Record<string, ReadingValue> = { children: childTree };
      for (const attribute of opening.attributes.properties) {
        if (
          ts.isJsxAttribute(attribute) &&
          attribute.initializer &&
          ts.isJsxExpression(attribute.initializer) &&
          attribute.initializer.expression
        )
          props[attribute.name.getText()] = value(attribute.initializer.expression, values);
      }
      if (imported(opening.tagName, 'BookCard', './BookCard'))
        return tree([props['book'] ?? false]);
      const child = mapRenderer(opening.tagName, opening);
      return child ? run(child, [props], values) : childTree;
    }
    return false;
  };
  const displayed = run(app, [], new Map());
  const books = booksIn(displayed);
  const keys = keysIn(displayed);
  const state = books.some(
    (book) =>
      book === true ||
      (typeof book === 'object' &&
        ['id', 'title', 'read'].every((property) => book[property] === true)),
  );
  return {
    definesBookComponent: books.length > 0,
    ownsReadingState: state,
    usesStableBookKeys: keys.includes(true) && !keys.includes(false),
  };
}

/** 更新前の本は変更せず、明示的に作ったコピーへの代入だけを認める。 */
function isFreshReadingValue(node: ts.Expression, seen = new Set<ts.Node>()): boolean {
  if (ts.isParenthesizedExpression(node)) return isFreshReadingValue(node.expression, seen);
  if (ts.isObjectLiteralExpression(node) || ts.isArrayLiteralExpression(node)) return true;
  if (ts.isCallExpression(node)) {
    if (ts.isPropertyAccessExpression(node.expression))
      return ['map', 'filter', 'slice', 'toReversed', 'toSorted', 'toSpliced', 'with'].includes(
        node.expression.name.text,
      );
    const called = mapRenderer(node.expression, node);
    if (!called?.body || seen.has(called)) return false;
    const returns: ts.Expression[] = [];
    const collect = (child: ts.Node): void => {
      if (ts.isFunctionLike(child)) return;
      if (ts.isReturnStatement(child)) {
        if (child.expression) returns.push(child.expression);
        return;
      }
      ts.forEachChild(child, collect);
    };
    if (ts.isBlock(called.body)) collect(called.body);
    else returns.push(called.body);
    seen.add(called);
    try {
      return returns.length > 0 && returns.every((returned) => isFreshReadingValue(returned, seen));
    } finally {
      seen.delete(called);
    }
  }
  if (!ts.isIdentifier(node)) return false;
  const binding = sourceBinding(node.text, node);
  if (
    !binding ||
    binding.fields.length ||
    !ts.isVariableDeclaration(binding.node) ||
    !binding.node.initializer ||
    seen.has(binding.node)
  )
    return false;
  seen.add(binding.node);
  try {
    return isFreshReadingValue(binding.node.initializer, seen);
  } finally {
    seen.delete(binding.node);
  }
}

/** 完成形を固定せず、安全な表示・親State・配列操作を許可する。実際の正しさはDOM操作とANDで採点する。 */
export function analyzeReadingList(files: Readonly<Record<string, string>>): {
  readonly diagnostics: readonly TypeScriptDiagnostic[];
  readonly facts: ReadingListFacts;
} {
  const diagnostics: TypeScriptDiagnostic[] = [];
  const sources = new Map<string, ts.SourceFile>();
  for (const file of ['BookCard.tsx', 'components.tsx']) {
    const text = files[file];
    if (text === undefined) continue;
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.ES2023, true, ts.ScriptKind.TSX);
    sources.set(file, source);
    const reject = (node: ts.Node, message: string): void => {
      const position = source.getLineAndCharacterOfPosition(node.getStart(source));
      diagnostics.push({
        code: 0,
        file,
        line: position.line + 1,
        column: position.character + 1,
        message,
      });
    };
    if (/@ts-(?:ignore|expect-error|nocheck)\b/u.test(text))
      reject(source, '型を無効にせず、用意されたBookとPropsの型に合わせます。');
    for (const statement of source.statements) {
      if (ts.isImportDeclaration(statement)) {
        const module = ts.isStringLiteral(statement.moduleSpecifier)
          ? statement.moduleSpecifier.text
          : '';
        if (!['react', './types', './data', './BookCard'].includes(module))
          reject(statement, 'この課題は用意された型・データ・BookCardとuseStateを使います。');
        if (module === 'react') {
          const bindings = statement.importClause?.namedBindings;
          if (!bindings || !ts.isNamedImports(bindings) || statement.importClause.name)
            reject(statement, 'ReactからはuseStateだけを名前付きimportします。');
          else
            for (const item of bindings.elements) {
              if ((item.propertyName?.text ?? item.name.text) !== 'useState')
                reject(
                  item,
                  'この読書リストにEffectや別Hookは必要ありません。useStateを使います。',
                );
            }
        }
      }
    }
    let nodes = 0;
    const visit = (node: ts.Node): void => {
      nodes += 1;
      if (nodes > 1600) return;
      if (ts.isIdentifier(node) && forbiddenNames.has(node.text))
        reject(node, '読書データとReactの値を使い、DOMや外部の機能を直接操作しません。');
      if (
        ts.isElementAccessExpression(node) ||
        ts.isNewExpression(node) ||
        ts.isClassDeclaration(node) ||
        ts.isClassExpression(node) ||
        ts.isAwaitExpression(node) ||
        ts.isYieldExpression(node) ||
        ts.isForStatement(node) ||
        ts.isForInStatement(node) ||
        ts.isForOfStatement(node) ||
        ts.isWhileStatement(node) ||
        ts.isDoStatement(node) ||
        ts.isJsxSpreadAttribute(node) ||
        (ts.isSpreadAssignment(node) && node.expression.kind === ts.SyntaxKind.ThisKeyword) ||
        node.kind === ts.SyntaxKind.AnyKeyword ||
        node.kind === ts.SyntaxKind.ThisKeyword
      )
        reject(
          node,
          'この課題は関数・型付きProps・useState・map/filterと表示の組み合わせで作ります。',
        );
      const written =
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
        node.operatorToken.kind <= ts.SyntaxKind.LastAssignment
          ? node.left
          : (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) &&
              [ts.SyntaxKind.PlusPlusToken, ts.SyntaxKind.MinusMinusToken].includes(node.operator)
            ? node.operand
            : undefined;
      if (written)
        for (const property of writtenProperties(written))
          if (!isFreshReadingValue(property.expression))
            reject(property, '更新前の本を直接書き換えず、コピーした新しい本を配列へ返します。');
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        [
          'push',
          'pop',
          'shift',
          'unshift',
          'splice',
          'sort',
          'reverse',
          'fill',
          'copyWithin',
        ].includes(node.expression.name.text) &&
        !isFreshReadingValue(node.expression.expression)
      )
        reject(node, '更新前の配列を直接変えず、新しい配列をStateへ渡します。');
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        const name = node.tagName.getText(source);
        if (!tags.has(name) && !/^[A-Z][A-Za-z0-9]*$/u.test(name))
          reject(node, '一覧・見出し・説明・buttonと自作Componentで表示します。');
        for (const attribute of node.attributes.properties) {
          if (
            !ts.isJsxAttribute(attribute) ||
            (tags.has(name)
              ? !attributes.has(attribute.name.getText(source))
              : ['ref', 'dangerouslySetInnerHTML'].includes(attribute.name.getText(source)))
          )
            reject(attribute, '指定した表示属性とbuttonのonClickだけを使います。');
          else if (
            attribute.name.getText(source) === 'onClick' &&
            tags.has(name) &&
            name !== 'button'
          )
            reject(attribute, 'クリックする操作はbuttonへ付けます。');
        }
      }

      ts.forEachChild(node, visit);
    };
    visit(source);
    if (nodes > 1600) reject(source, '表示と操作を小さい部品へ分け、コード量を見直してください。');
  }
  return {
    diagnostics,
    facts: readingUsage(sources),
  };
}
