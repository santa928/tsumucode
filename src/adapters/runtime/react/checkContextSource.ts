import ts from 'typescript';
import { analyzeControlledForm } from './checkControlledFormSource';
import type { TypeScriptDiagnostic } from '../typescript/compileTypeScript';

export interface ContextFacts {
  readonly readsSameProvidedValue: boolean;
  readonly forwardsProvidedUpdate: boolean;
  readonly derivesFromProvidedValue: boolean;
}

/**
 * 固定Providerを読む2consumerだけを、検査済みProps経路へ正規化する。
 * 削除するimport・Hook・nullguardも元ASTで検査し、学習者JSを実行しない。
 * 正規化後の位置は元Sourceへ転記せず、実TS診断だけが元の位置を持つ。
 */
export function analyzeContext(sourceText: string): {
  readonly diagnostics: readonly TypeScriptDiagnostic[];
  readonly facts: ContextFacts;
} {
  const source = ts.createSourceFile(
    'components.tsx',
    sourceText,
    ts.ScriptTarget.ES2023,
    true,
    ts.ScriptKind.TSX,
  );
  const diagnostics: TypeScriptDiagnostic[] = [];
  const empty: ContextFacts = {
    readsSameProvidedValue: false,
    forwardsProvidedUpdate: false,
    derivesFromProvidedValue: false,
  };
  const reject = (
    message = 'この課題は固定Contextを読むNameFieldとNameSummaryだけを編集します。',
  ): void => {
    if (diagnostics.length < 50 && !diagnostics.some((item) => item.message === message))
      diagnostics.push({ code: 0, file: 'components.tsx', message });
  };
  const stack: ts.Node[] = [source];
  let count = 0;
  while (stack.length && count <= 2048) {
    const node = stack.pop()!;
    count++;
    if (
      node.kind === ts.SyntaxKind.AnyKeyword ||
      ts.isAsExpression(node) ||
      ts.isTypeAssertionExpression(node) ||
      ts.isNonNullExpression(node)
    )
      reject('型抑制やassertionを使わず、nullを確認してください。');
    ts.forEachChild(node, (child) => {
      stack.push(child);
    });
  }
  if (count > 2048 || /@ts-(?:ignore|expect-error|nocheck)\b/u.test(sourceText))
    reject('構文上限を守り、型検査を無効にしないでください。');
  const reserved = new Set([
    '__contextState',
    '__FieldProps',
    '__SummaryProps',
    '__providedName',
    '__updateProvidedName',
    'App',
  ]);
  const imports = new Set<string>();
  const typeBindings: string[] = [];
  let hook: string | undefined;
  let context: string | undefined;
  const components = new Map<string, ts.FunctionDeclaration>();
  for (const statement of source.statements) {
    if (ts.isImportDeclaration(statement)) {
      const clause = statement.importClause;
      if (
        !ts.isStringLiteral(statement.moduleSpecifier) ||
        !clause?.namedBindings ||
        !ts.isNamedImports(clause.namedBindings) ||
        clause.name ||
        statement.attributes ||
        !clause.namedBindings.elements.length
      ) {
        reject();
        continue;
      }
      for (const binding of clause.namedBindings.elements) {
        const name = binding.name.text;
        const original = binding.propertyName?.text ?? name;
        if (imports.has(name) || reserved.has(name)) {
          reject('importの重複や予約名は使えません。');
          continue;
        }
        imports.add(name);
        if (
          statement.moduleSpecifier.text === 'react' &&
          original === 'useContext' &&
          !clause.phaseModifier &&
          !binding.isTypeOnly &&
          !hook
        )
          hook = name;
        else if (
          statement.moduleSpecifier.text === './nameContext' &&
          original === 'NameContext' &&
          !clause.phaseModifier &&
          !binding.isTypeOnly &&
          !context
        )
          context = name;
        else if (
          statement.moduleSpecifier.text === './types' &&
          original === 'InputChangeEvent' &&
          clause.phaseModifier === ts.SyntaxKind.TypeKeyword
        )
          typeBindings.push(binding.getText(source));
        else reject('importは固定useContext・NameContext・InputChangeEventだけです。');
      }
    } else if (
      ts.isFunctionDeclaration(statement) &&
      statement.name &&
      ['NameField', 'NameSummary'].includes(statement.name.text) &&
      statement.body &&
      !statement.parameters.length &&
      !statement.type &&
      !statement.typeParameters &&
      !statement.asteriskToken &&
      statement.modifiers?.length === 1 &&
      statement.modifiers[0]?.kind === ts.SyntaxKind.ExportKeyword &&
      !components.has(statement.name.text)
    )
      components.set(statement.name.text, statement);
    else reject();
  }
  if (!hook || !context || components.size !== 2)
    reject('同じ固定Contextを読む2つのconsumerを定義してください。');
  const plainGuard = (statement: ts.Statement | undefined, name: string): boolean => {
    if (
      !statement ||
      !ts.isIfStatement(statement) ||
      statement.elseStatement ||
      !ts.isBinaryExpression(statement.expression) ||
      statement.expression.operatorToken.kind !== ts.SyntaxKind.EqualsEqualsEqualsToken
    )
      return false;
    const { left, right } = statement.expression;
    if (!(
      (ts.isIdentifier(left) && left.text === name && right.kind === ts.SyntaxKind.NullKeyword) ||
      (ts.isIdentifier(right) && right.text === name && left.kind === ts.SyntaxKind.NullKeyword)
    ))
      return false;
    const result =
      ts.isBlock(statement.thenStatement) && statement.thenStatement.statements.length === 1
        ? statement.thenStatement.statements[0]
        : statement.thenStatement;
    if (
      !result ||
      !ts.isReturnStatement(result) ||
      !result.expression ||
      !ts.isJsxElement(result.expression)
    )
      return false;
    const jsx = result.expression;
    return (
      ts.isIdentifier(jsx.openingElement.tagName) &&
      jsx.openingElement.tagName.text === 'p' &&
      jsx.closingElement.tagName.getText(source) === 'p' &&
      !jsx.openingElement.typeArguments &&
      !jsx.openingElement.attributes.properties.length &&
      jsx.children.length === 1 &&
      ts.isJsxText(jsx.children[0]!) &&
      !!jsx.children[0].getText(source).trim()
    );
  };
  const normalized: string[] = [];
  for (const [name, component] of components) {
    const statements = [...component.body!.statements];
    const first = statements.shift();
    const declaration =
      first &&
      ts.isVariableStatement(first) &&
      !first.modifiers &&
      first.declarationList.flags === ts.NodeFlags.Const &&
      first.declarationList.declarations.length === 1
        ? first.declarationList.declarations[0]
        : undefined;
    const call = declaration?.initializer;
    if (
      !declaration ||
      !ts.isIdentifier(declaration.name) ||
      declaration.type ||
      !call ||
      !ts.isCallExpression(call) ||
      !ts.isIdentifier(call.expression) ||
      call.expression.text !== hook ||
      call.typeArguments ||
      call.arguments.length !== 1 ||
      !ts.isIdentifier(call.arguments[0]!) ||
      call.arguments[0].getText(source) !== context
    ) {
      reject('consumerの先頭で固定Contextを1回読みます。');
      continue;
    }
    const variable = declaration.name.text;
    if (!plainGuard(statements.shift(), variable)) {
      reject('Contextがnullなら、副作用のないpの案内だけを返してください。');
      continue;
    }
    // importやContext変数をlocal宣言で隠さない。別consumerの同名localは許容する。
    const bindings = new Set(imports);
    const collectBinding = (node: ts.BindingName): void => {
      if (ts.isIdentifier(node)) {
        if (bindings.has(node.text) || reserved.has(node.text))
          reject('Hook・Context・local値を同名宣言で隠さないでください。');
        bindings.add(node.text);
      } else
        for (const element of node.elements)
          if (ts.isBindingElement(element)) collectBinding(element.name);
    };
    const walk = (node: ts.Node): void => {
      if (ts.isVariableDeclaration(node) || ts.isParameter(node)) collectBinding(node.name);
      if (ts.isFunctionDeclaration(node) && node.name) collectBinding(node.name);
      ts.forEachChild(node, walk);
    };
    walk(component);
    normalized.push(
      `function ${name}(${variable}: ${name === 'NameField' ? '__FieldProps' : '__SummaryProps'}) {\n${statements
        .map((statement) => {
          if (
            ts.isVariableStatement(statement) &&
            statement.declarationList.declarations.length === 1
          ) {
            const declaration = statement.declarationList.declarations[0]!;
            const arrow = declaration.initializer;
            if (arrow && ts.isArrowFunction(arrow)) {
              if (
                statement.modifiers ||
                statement.declarationList.flags !== ts.NodeFlags.Const ||
                !ts.isIdentifier(declaration.name) ||
                declaration.type ||
                arrow.modifiers ||
                arrow.typeParameters ||
                arrow.type
              ) {
                reject('handlerは同期const arrowを使います。');
                return '';
              }
              // wrapperの全条件を確認したうえで、同じ元bodyを既存handler検査へ渡す。
              return `function ${declaration.name.text}(${arrow.parameters.map((parameter) => parameter.getText(source)).join(', ')}) ${ts.isBlock(arrow.body) ? arrow.body.getText(source) : '{ return ' + arrow.body.getText(source) + '; }'}`;
            }
          }
          return statement.getText(source);
        })
        .join('\n')}\n}`,
    );
  }
  if (diagnostics.length) return { diagnostics, facts: empty };
  const normalizedSource = `import { useState as __contextState } from 'react';
import type { NameFieldProps as __FieldProps, NameSummaryProps as __SummaryProps${typeBindings.length ? ', ' + typeBindings.join(', ') : ''} } from './types';
${normalized.join('\n')}
export function App() {
  const [__providedName, __updateProvidedName] = __contextState('');
  return <section><NameField value={__providedName} onNameChange={__updateProvidedName} /><NameSummary value={__providedName} /><button id="reset" type="button" onClick={() => __updateProvidedName('')}>やり直し</button></section>;
}`;
  const analyzed = analyzeControlledForm(normalizedSource);
  for (const item of analyzed.diagnostics) reject(item.message);
  return {
    diagnostics,
    facts: {
      readsSameProvidedValue: analyzed.facts.sharesParentState,
      forwardsProvidedUpdate:
        analyzed.facts.usesControlledInput && analyzed.facts.sharesParentState,
      derivesFromProvidedValue:
        analyzed.facts.derivesFromSameState && analyzed.facts.sharesParentState,
    },
  };
}
