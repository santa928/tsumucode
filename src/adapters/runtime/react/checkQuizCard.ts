import ts from 'typescript';
import type { TypeScriptDiagnostic } from '../typescript/compileTypeScript';

export interface QuizCardFacts {
  readonly rendersQuestion: boolean;
  readonly usesStableChoiceKeys: boolean;
  readonly forwardsSelectedChoice: boolean;
}

/** 固定Propsからの一覧と同じ選択肢のCallbackを、元TSXのbindingで確認する。 */
export function analyzeQuizCard(sourceText: string): {
  readonly diagnostics: readonly TypeScriptDiagnostic[];
  readonly facts: QuizCardFacts;
} {
  const source = ts.createSourceFile(
    'QuestionCard.tsx',
    sourceText,
    ts.ScriptTarget.ES2023,
    true,
    ts.ScriptKind.TSX,
  );
  const diagnostics: TypeScriptDiagnostic[] = [];
  const empty: QuizCardFacts = {
    rendersQuestion: false,
    usesStableChoiceKeys: false,
    forwardsSelectedChoice: false,
  };
  const reject = (
    node: ts.Node,
    message = '用意済みのPropsから問題と選択肢だけを表示してください。',
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
      file: 'QuestionCard.tsx',
      line: line + 1,
      column: character + 1,
      message,
    });
  };
  const stack: ts.Node[] = [source];
  let count = 0;
  while (stack.length && count <= 2048) {
    const node = stack.pop()!;
    count++;
    if (
      ts.isAsExpression(node) ||
      ts.isTypeAssertionExpression(node) ||
      ts.isNonNullExpression(node) ||
      node.kind === ts.SyntaxKind.AnyKeyword ||
      ts.isNewExpression(node) ||
      ts.isAwaitExpression(node) ||
      ts.isYieldExpression(node)
    )
      reject(node);
    ts.forEachChild(node, (child) => {
      stack.push(child);
    });
  }
  if (count > 2048 || /@ts-(?:ignore|expect-error|nocheck)\b/u.test(sourceText))
    reject(source, '構文上限を守り、型検査を無効にしないでください。');
  const aliases = new Set<string>();
  let component: ts.FunctionDeclaration | undefined;
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
        if (
          (binding.propertyName?.text ?? binding.name.text) !== 'QuestionCardProps' ||
          aliases.has(binding.name.text)
        )
          reject(binding);
        else aliases.add(binding.name.text);
      }
    } else if (
      ts.isFunctionDeclaration(statement) &&
      statement.name?.text === 'QuestionCard' &&
      statement.body &&
      !component &&
      !statement.asteriskToken &&
      !statement.typeParameters &&
      !statement.type &&
      statement.modifiers?.length === 1 &&
      statement.modifiers[0]?.kind === ts.SyntaxKind.ExportKeyword
    )
      component = statement;
    else reject(statement);
  }
  const parameter = component?.parameters[0];
  if (
    !component?.body ||
    component.parameters.length !== 1 ||
    !parameter ||
    !ts.isObjectBindingPattern(parameter.name) ||
    parameter.initializer ||
    parameter.dotDotDotToken ||
    parameter.questionToken ||
    parameter.modifiers ||
    !parameter.type ||
    !ts.isTypeReferenceNode(parameter.type) ||
    !ts.isIdentifier(parameter.type.typeName) ||
    !aliases.has(parameter.type.typeName.text) ||
    parameter.type.typeArguments
  ) {
    reject(
      component ?? source,
      'QuestionCardPropsでquestion、answered、onAnswerを受け取ってください。',
    );
    return { diagnostics, facts: empty };
  }
  const bindings = new Map<string, string>();
  for (const binding of parameter.name.elements) {
    const original = binding.propertyName ?? binding.name;
    if (
      !ts.isIdentifier(original) ||
      !['question', 'answered', 'onAnswer'].includes(original.text) ||
      !ts.isIdentifier(binding.name) ||
      binding.initializer ||
      binding.dotDotDotToken ||
      bindings.has(original.text) ||
      [...bindings.values()].includes(binding.name.getText(source)) ||
      aliases.has(binding.name.getText(source))
    )
      reject(binding);
    else bindings.set(original.text, binding.name.text);
  }
  const returned = component.body.statements[0];
  if (
    bindings.size !== 3 ||
    component.body.statements.length !== 1 ||
    !returned ||
    !ts.isReturnStatement(returned) ||
    !returned.expression
  ) {
    reject(component, 'Componentは受け取ったPropsからJSXを返してください。');
    return { diagnostics, facts: empty };
  }
  const unwrap = (node: ts.Expression): ts.Expression =>
    ts.isParenthesizedExpression(node) ? unwrap(node.expression) : node;
  const named = (node: ts.Expression, name: string | undefined): boolean => {
    const value = unwrap(node);
    return ts.isIdentifier(value) && value.text === name;
  };
  const questionProperty = (node: ts.Expression, property: string): boolean => {
    const value = unwrap(node);
    return (
      ts.isPropertyAccessExpression(value) &&
      named(value.expression, bindings.get('question')) &&
      value.name.text === property
    );
  };
  const found = { question: 0, lists: 0, stable: 0, forwarded: 0, labels: 0, fixedDisplay: 0 };
  const jsx = (original: ts.Expression, choice?: string, index?: string): void => {
    const node = unwrap(original);
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const opening = ts.isJsxElement(node) ? node.openingElement : node;
      const tag = opening.tagName.getText(source);
      if (!['section', 'h2', 'button'].includes(tag) || ts.isJsxSelfClosingElement(node)) {
        reject(node);
        return;
      }
      const attributes = new Map<string, ts.JsxAttribute>();
      for (const attribute of opening.attributes.properties) {
        if (!ts.isJsxAttribute(attribute) || attributes.has(attribute.name.getText(source)))
          reject(attribute);
        else attributes.set(attribute.name.getText(source), attribute);
      }
      const literal = (key: string, text: string): boolean => {
        const value = attributes.get(key)?.initializer;
        return !!value && ts.isStringLiteral(value) && value.text === text;
      };
      const expression = (key: string): ts.Expression | undefined => {
        const value = attributes.get(key)?.initializer;
        return value && ts.isJsxExpression(value) && value.expression
          ? unwrap(value.expression)
          : undefined;
      };
      if (tag === 'section' && attributes.size !== 0) reject(opening);
      if (tag === 'h2' && (attributes.size !== 1 || !literal('id', 'question'))) reject(opening);
      if (tag === 'button') {
        const key = expression('key'),
          id = expression('id'),
          disabled = expression('disabled'),
          event = expression('onClick');
        if (
          !choice ||
          attributes.size !== 5 ||
          !literal('type', 'button') ||
          !id ||
          !named(id, choice)
        )
          reject(opening);
        if (key && (named(key, choice) || named(key, index))) {
          if (named(key, choice)) found.stable++;
        } else reject(key ?? opening);
        if (
          !disabled ||
          !(
            named(disabled, bindings.get('answered')) ||
            disabled.kind === ts.SyntaxKind.FalseKeyword ||
            disabled.kind === ts.SyntaxKind.TrueKeyword
          )
        )
          reject(disabled ?? opening);
        if (
          !event ||
          !ts.isArrowFunction(event) ||
          event.parameters.length ||
          event.modifiers ||
          event.typeParameters ||
          event.type
        )
          reject(event ?? opening);
        else {
          let call: ts.Expression | undefined;
          if (ts.isBlock(event.body)) {
            const statement = event.body.statements[0];
            if (
              event.body.statements.length === 1 &&
              statement &&
              ts.isExpressionStatement(statement)
            )
              call = unwrap(statement.expression);
          } else call = unwrap(event.body);
          if (
            !call ||
            !ts.isCallExpression(call) ||
            !named(call.expression, bindings.get('onAnswer')) ||
            call.typeArguments ||
            call.arguments.length !== 1
          )
            reject(call ?? event);
          else if (named(call.arguments[0]!, choice)) {
            if (disabled && named(disabled, bindings.get('answered'))) found.forwarded++;
          } else if (!ts.isStringLiteral(unwrap(call.arguments[0]!))) reject(call.arguments[0]!);
        }
      }
      for (const child of node.children) {
        if (ts.isJsxText(child)) {
          if (child.text.trim()) reject(child);
        } else if (ts.isJsxExpression(child) && child.expression) {
          const value = unwrap(child.expression);
          if (tag === 'h2' && questionProperty(value, 'text')) found.question++;
          else if (tag === 'button' && named(value, choice)) found.labels++;
          else if (ts.isStringLiteral(value)) found.fixedDisplay++;
          else jsx(value, choice, index);
        } else if (ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child))
          jsx(child, choice, index);
        else reject(child);
      }
      return;
    }
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'map' &&
      questionProperty(node.expression.expression, 'choices') &&
      !node.typeArguments &&
      node.arguments.length === 1 &&
      !choice
    ) {
      const callback = node.arguments[0]!;
      if (
        !ts.isArrowFunction(callback) ||
        callback.modifiers ||
        callback.typeParameters ||
        callback.type ||
        callback.parameters.length < 1 ||
        callback.parameters.length > 2 ||
        callback.parameters.some(
          (item) =>
            !ts.isIdentifier(item.name) ||
            item.initializer ||
            item.dotDotDotToken ||
            item.questionToken ||
            item.modifiers ||
            item.type ||
            aliases.has(item.name.getText(source)) ||
            [...bindings.values()].includes(item.name.getText(source)),
        ) ||
        new Set(callback.parameters.map((item) => item.name.getText(source))).size !==
          callback.parameters.length
      ) {
        reject(callback);
        return;
      }
      let body: ts.Expression | undefined;
      if (ts.isBlock(callback.body)) {
        const statement = callback.body.statements[0];
        if (callback.body.statements.length === 1 && statement && ts.isReturnStatement(statement))
          body = statement.expression;
      } else body = callback.body;
      if (!body) reject(callback);
      else {
        found.lists++;
        jsx(
          body,
          callback.parameters[0]!.name.getText(source),
          callback.parameters[1]?.name.getText(source),
        );
      }
      return;
    }
    reject(node);
  };
  jsx(returned.expression);
  return {
    diagnostics,
    facts: {
      rendersQuestion:
        diagnostics.length === 0 &&
        found.question === 1 &&
        found.lists === 1 &&
        found.labels === 1 &&
        found.fixedDisplay === 0,
      usesStableChoiceKeys: diagnostics.length === 0 && found.lists === 1 && found.stable === 1,
      forwardsSelectedChoice:
        diagnostics.length === 0 && found.lists === 1 && found.forwarded === 1,
    },
  };
}
