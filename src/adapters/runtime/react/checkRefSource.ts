import ts from 'typescript';
import type { TypeScriptDiagnostic } from '../typescript/compileTypeScript';
import { analyzeControlledForm } from './checkControlledFormSource';

export interface RefFacts {
  readonly usesInputRef: boolean;
  readonly focusesFromEvent: boolean;
  readonly keepsStateForDisplay: boolean;
}

/** 元SourceのRef能力を指定inputのfocusへ閉じ、残るState/入力は既存契約で検査する。 */
export function analyzeRef(sourceText: string): {
  readonly diagnostics: readonly TypeScriptDiagnostic[];
  readonly facts: RefFacts;
} {
  const source = ts.createSourceFile(
    'components.tsx',
    sourceText,
    ts.ScriptTarget.ES2023,
    true,
    ts.ScriptKind.TSX,
  );
  const diagnostics: TypeScriptDiagnostic[] = [];
  const empty: RefFacts = {
    usesInputRef: false,
    focusesFromEvent: false,
    keepsStateForDisplay: false,
  };
  // 正規化した位置を元Sourceの診断へ転記しない。
  const reject = (message = 'Refは指定の入力へのnull安全なfocusだけに使います。'): void => {
    if (diagnostics.length < 50 && !diagnostics.some((item) => item.message === message))
      diagnostics.push({ code: 0, file: 'components.tsx', message });
  };
  let count = 0;
  const stack: ts.Node[] = [source];
  while (stack.length && count <= 2048) {
    const node = stack.pop()!;
    count++;
    if (
      node.kind === ts.SyntaxKind.AnyKeyword ||
      ts.isAsExpression(node) ||
      ts.isTypeAssertionExpression(node) ||
      ts.isNonNullExpression(node)
    )
      reject();
    ts.forEachChild(node, (child) => {
      stack.push(child);
    });
  }
  if (count > 2048 || /@ts-(?:ignore|expect-error|nocheck)\b/u.test(sourceText))
    reject('構文上限を守り、型検査を無効にしないでください。');
  let hook: string | undefined;
  let app: ts.FunctionDeclaration | undefined;
  const imports: ts.Statement[] = [];
  const bindings = new Set<string>();
  for (const statement of source.statements) {
    if (ts.isImportDeclaration(statement)) {
      const clause = statement.importClause;
      if (
        !ts.isStringLiteral(statement.moduleSpecifier) ||
        !clause?.namedBindings ||
        !ts.isNamedImports(clause.namedBindings) ||
        clause.name
      ) {
        reject();
        continue;
      }
      const remaining: ts.ImportSpecifier[] = [];
      for (const item of clause.namedBindings.elements) {
        if (bindings.has(item.name.text)) reject('importとlocal値を同名宣言で隠さないでください。');
        bindings.add(item.name.text);
        const original = item.propertyName?.text ?? item.name.text;
        if (
          statement.moduleSpecifier.text === 'react' &&
          original === 'useRef' &&
          !clause.phaseModifier &&
          !item.isTypeOnly &&
          !hook
        )
          hook = item.name.text;
        else remaining.push(item);
      }
      if (remaining.length)
        imports.push(
          ts.factory.updateImportDeclaration(
            statement,
            statement.modifiers,
            ts.factory.updateImportClause(
              clause,
              clause.phaseModifier,
              undefined,
              ts.factory.createNamedImports(remaining),
            ),
            statement.moduleSpecifier,
            statement.attributes,
          ),
        );
    } else if (
      ts.isFunctionDeclaration(statement) &&
      statement.name?.text === 'App' &&
      statement.body &&
      !app &&
      statement.parameters.length === 0 &&
      !statement.typeParameters &&
      !statement.type &&
      !statement.asteriskToken &&
      statement.modifiers?.length === 1 &&
      statement.modifiers[0]?.kind === ts.SyntaxKind.ExportKeyword
    )
      app = statement;
    else reject();
  }
  if (!hook || !app?.body) {
    reject('Appの最上位でuseRefを1回使います。');
    return { diagnostics, facts: empty };
  }
  const collect = (node: ts.Node): void => {
    const binding = (name: ts.BindingName): void => {
      if (ts.isIdentifier(name)) {
        if (bindings.has(name.text)) reject('importとlocal値を同名宣言で隠さないでください。');
        bindings.add(name.text);
      } else for (const item of name.elements) if (ts.isBindingElement(item)) binding(item.name);
    };
    if (ts.isVariableDeclaration(node) || ts.isParameter(node)) binding(node.name);
    if (ts.isFunctionDeclaration(node) && node.name) binding(node.name);
    ts.forEachChild(node, collect);
  };
  collect(app);
  let refStatement: ts.VariableStatement | undefined;
  let refName: string | undefined;
  for (const statement of app.body.statements) {
    if (!ts.isVariableStatement(statement) || statement.declarationList.declarations.length !== 1)
      continue;
    const declaration = statement.declarationList.declarations[0]!;
    const call = declaration.initializer;
    if (
      !call ||
      !ts.isCallExpression(call) ||
      !ts.isIdentifier(call.expression) ||
      call.expression.text !== hook
    )
      continue;
    if (
      refStatement ||
      statement.modifiers ||
      statement.declarationList.flags !== ts.NodeFlags.Const ||
      !ts.isIdentifier(declaration.name) ||
      declaration.type ||
      call.questionDotToken ||
      call.arguments.length !== 1 ||
      call.arguments[0]?.kind !== ts.SyntaxKind.NullKeyword ||
      call.typeArguments?.length !== 1 ||
      !ts.isTypeReferenceNode(call.typeArguments[0]!) ||
      call.typeArguments[0].getText(source) !== 'HTMLInputElement'
    )
      reject();
    else {
      refStatement = statement;
      refName = declaration.name.text;
    }
  }
  if (!refStatement || !refName) {
    reject('useRef<HTMLInputElement>(null)から入力用のRefを作ります。');
    return { diagnostics, facts: empty };
  }
  const readsCurrent = (node: ts.Node): boolean =>
    ts.isPropertyAccessExpression(node) &&
    node.name.text === 'current' &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === refName &&
    !node.questionDotToken;
  const focusCall = (node: ts.Node, guarded: boolean): boolean =>
    ts.isCallExpression(node) &&
    node.arguments.length === 0 &&
    !node.typeArguments &&
    ts.isPropertyAccessExpression(node.expression) &&
    node.expression.name.text === 'focus' &&
    readsCurrent(node.expression.expression) &&
    (!!node.expression.questionDotToken || guarded);
  const expressionStatement = (node: ts.Statement | undefined, guarded: boolean): boolean =>
    !!node && ts.isExpressionStatement(node) && focusCall(node.expression, guarded);
  let focusHandler: ts.FunctionDeclaration | undefined;
  let focused = false;
  for (const statement of app.body.statements) {
    if (!ts.isFunctionDeclaration(statement) || !statement.body) continue;
    const containsRef = (node: ts.Node): boolean =>
      (ts.isIdentifier(node) && node.text === refName) ||
      (ts.forEachChild(node, containsRef) ?? false);
    const usesRef = containsRef(statement.body);
    // 空handlerはStarterの未完状態として受理する。
    if (!usesRef && statement.body.statements.length !== 0) continue;
    if (
      focusHandler ||
      !statement.name ||
      statement.parameters.length ||
      statement.modifiers ||
      statement.asteriskToken ||
      statement.typeParameters ||
      statement.type
    ) {
      reject();
      continue;
    }
    focusHandler = statement;
    const items = statement.body.statements;
    const item = items[0];
    if (!items.length) continue;
    if (items.length === 1 && expressionStatement(item, false)) focused = true;
    else if (
      items.length === 1 &&
      item &&
      ts.isIfStatement(item) &&
      readsCurrent(item.expression) &&
      !item.elseStatement
    ) {
      const body = ts.isBlock(item.thenStatement)
        ? item.thenStatement.statements
        : [item.thenStatement];
      if (body.length === 1 && expressionStatement(body[0], true)) focused = true;
      else reject();
    } else reject();
  }
  if (!focusHandler?.name) {
    reject('同期Event handlerから入力へのfocusを呼びます。');
    return { diagnostics, facts: empty };
  }
  let attached = 0;
  let connected = 0;
  const focusName = focusHandler.name.text;
  const insideFocus = (node: ts.Node): boolean => {
    for (let owner = node; owner !== source; owner = owner.parent) {
      if (owner === focusHandler) return true;
    }
    return false;
  };
  const attr = (
    node: ts.JsxOpeningElement | ts.JsxSelfClosingElement,
    name: string,
  ): ts.JsxAttribute | undefined =>
    node.attributes.properties.find(
      (item): item is ts.JsxAttribute =>
        ts.isJsxAttribute(item) && item.name.getText(source) === name,
    );
  const textAttr = (
    node: ts.JsxOpeningElement | ts.JsxSelfClosingElement,
    name: string,
  ): string | undefined => {
    const value = attr(node, name)?.initializer;
    return value && ts.isStringLiteral(value) ? value.text : undefined;
  };
  const refAttr = (node: ts.Node): boolean =>
    ts.isJsxExpression(node.parent) &&
    node.parent.expression === node &&
    ts.isJsxAttribute(node.parent.parent) &&
    node.parent.parent.name.getText(source) === 'ref';
  const validate = (node: ts.Node): void => {
    if (
      ts.isIdentifier(node) &&
      node.text === refName &&
      !insideFocus(node) &&
      !(ts.isVariableDeclaration(node.parent) && node.parent.name === node) &&
      !refAttr(node)
    )
      reject();
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === hook &&
      node.parent.parent !== refStatement.declarationList
    )
      reject();
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const ref = attr(node, 'ref');
      if (ref) {
        if (
          node.tagName.getText(source) !== 'input' ||
          textAttr(node, 'id') !== 'name' ||
          !ref.initializer ||
          !ts.isJsxExpression(ref.initializer) ||
          !ref.initializer.expression ||
          !ts.isIdentifier(ref.initializer.expression) ||
          ref.initializer.expression.text !== refName
        )
          reject();
        else attached++;
      }
      if (textAttr(node, 'id') === 'focus') {
        const click = attr(node, 'onClick')?.initializer;
        const parent = node.parent;
        if (
          !ts.isJsxElement(parent) ||
          node.tagName.getText(source) !== 'button' ||
          textAttr(node, 'type') !== 'button' ||
          node.attributes.properties.length !== 3 ||
          !click ||
          !ts.isJsxExpression(click) ||
          !click.expression ||
          !ts.isIdentifier(click.expression) ||
          click.expression.text !== focusName ||
          parent.children.some((child) => !ts.isJsxText(child))
        )
          reject();
        else connected++;
      }
    }
    ts.forEachChild(node, validate);
  };
  validate(app);
  if (attached > 1 || connected !== 1) reject();
  if (diagnostics.length) return { diagnostics, facts: empty };
  const transform: ts.TransformerFactory<ts.SourceFile> = (context) => {
    const visitor: ts.Visitor = (node) => {
      if (node === refStatement || node === focusHandler) return undefined;
      if (ts.isJsxElement(node) && textAttr(node.openingElement, 'id') === 'focus')
        return undefined;
      if (ts.isJsxAttribute(node) && node.name.getText(source) === 'ref') return undefined;
      return ts.visitEachChild(node, visitor, context);
    };
    return (file) => ts.visitNode(file, visitor) as ts.SourceFile;
  };
  const normalized = ts.factory.updateSourceFile(source, [...imports, app]);
  const result = ts.transform(normalized, [transform]);
  const analyzed = analyzeControlledForm(ts.createPrinter().printFile(result.transformed[0]!));
  result.dispose();
  for (const item of analyzed.diagnostics) reject(item.message);
  return {
    diagnostics,
    facts: {
      usesInputRef: attached === 1,
      focusesFromEvent: focused && connected === 1,
      keepsStateForDisplay:
        analyzed.facts.usesSingleState &&
        analyzed.facts.usesControlledInput &&
        analyzed.facts.derivesFromSameState,
    },
  };
}
