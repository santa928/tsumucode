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
type ReadingValue = boolean | { readonly [property: string]: ReadingValue };
interface SourceBinding {
  readonly node: ts.Declaration;
  readonly fields: readonly string[];
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
  for (let scope: ts.Node | undefined = from; scope; scope = scope.parent) {
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
function rendererKeys(renderer: MapRenderer): { renders: boolean; stable: boolean } {
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
    if (ts.isParenthesizedExpression(value)) return expression(value.expression);
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
    } else if (ts.isConditionalExpression(value)) {
      expression(value.whenTrue);
      expression(value.whenFalse);
    } else if (
      ts.isBinaryExpression(value) &&
      value.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken
    ) {
      expression(value.right);
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
      stable &&= Boolean(keyed);
    }
  };
  const returns = (node: ts.Node): void => {
    if (ts.isFunctionLike(node)) return;
    if (ts.isReturnStatement(node)) {
      if (node.expression) expression(node.expression);
      return;
    }
    ts.forEachChild(node, returns);
  };
  if (renderer.body) {
    if (ts.isBlock(renderer.body)) returns(renderer.body);
    else expression(renderer.body);
  }
  return { renders, stable };
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
  let budget = 2000;
  // JSXを作った時点では使用と数えず、返すツリーに由来を付けて運ぶ。
  const renderedBooks = new WeakMap<object, readonly ReadingValue[]>();
  const booksIn = (value: ReadingValue): readonly ReadingValue[] =>
    typeof value === 'object' ? (renderedBooks.get(value) ?? []) : [];
  const renderedKeys = new WeakMap<object, readonly boolean[]>();
  const keysIn = (value: ReadingValue): readonly boolean[] =>
    typeof value === 'object' ? (renderedKeys.get(value) ?? []) : [];
  const tree = (books: readonly ReadingValue[], keys: readonly boolean[] = []): ReadingValue => {
    const node = {};
    renderedBooks.set(node, books);
    renderedKeys.set(node, keys);
    return node;
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
          const books = [...booksIn(returned), ...booksIn(next)];
          const keys = [...keysIn(returned), ...keysIn(next)];
          returned = books.length || keys.length ? tree(books, keys) : next || returned;
        }
        return;
      }
      if (ts.isExpressionStatement(node)) {
        value(node.expression, values);
        return;
      }
      ts.forEachChild(node, statements);
    };
    try {
      if (renderer.body) {
        if (ts.isBlock(renderer.body)) statements(renderer.body);
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
    if (ts.isArrayLiteralExpression(node))
      return Object.fromEntries(
        node.elements.map((element, index) => [String(index), value(element, values)]),
      );
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
          const keys = callback ? rendererKeys(callback) : undefined;
          return keys?.renders
            ? tree(booksIn(mapped), [...keysIn(mapped), keys.stable])
            : booksIn(mapped).length || keysIn(mapped).length
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
      const first = value(node.whenTrue, values);
      const second = value(node.whenFalse, values);
      const books = [...booksIn(first), ...booksIn(second)];
      const keys = [...keysIn(first), ...keysIn(second)];
      return books.length || keys.length
        ? tree(books, keys)
        : first === true || second === true
          ? true
          : first || second;
    }
    if (ts.isBinaryExpression(node)) {
      value(node.left, values);
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
    usesStableBookKeys: keys.length > 0 && keys.every(Boolean),
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
          if (!bindings || !ts.isNamedImports(bindings) || statement.importClause?.name)
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
      if (
        written &&
        ts.isPropertyAccessExpression(written) &&
        !isFreshReadingValue(written.expression)
      )
        reject(written, '更新前の本を直接書き換えず、コピーした新しい本を配列へ返します。');
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
