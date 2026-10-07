import ts from 'typescript';
import type { TypeScriptDiagnostic } from '../typescript/compileTypeScript';

export interface ExternalSourceFacts {
  readonly usesExternalEffect: boolean;
  readonly tracksSelectedSource: boolean;
  readonly cleansSameSubscription: boolean;
  readonly returnsReceivedValue: boolean;
  readonly derivesDuringRender: boolean;
}

/** 固定DOM購読への入力・依存値・cleanupの由来を追い、任意Effect/Hookを許可しない。 */
export function analyzeExternalSource(
  sourceText: string,
  customHook: boolean,
): {
  readonly diagnostics: readonly TypeScriptDiagnostic[];
  readonly facts: ExternalSourceFacts;
} {
  const file = customHook ? 'sourceHook.ts' : 'components.tsx';
  const source = ts.createSourceFile(
    file,
    sourceText,
    ts.ScriptTarget.ES2023,
    true,
    customHook ? ts.ScriptKind.TS : ts.ScriptKind.TSX,
  );
  const diagnostics: TypeScriptDiagnostic[] = [];
  const empty: ExternalSourceFacts = {
    usesExternalEffect: false,
    tracksSelectedSource: false,
    cleansSameSubscription: false,
    returnsReceivedValue: false,
    derivesDuringRender: false,
  };
  const reject = (
    message = 'この課題は固定の外部入力への購読・cleanupと純粋な表示だけを扱います。',
  ): void => {
    if (diagnostics.length < 50 && !diagnostics.some((item) => item.message === message))
      diagnostics.push({ code: 0, file, message });
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
      reject();
    ts.forEachChild(node, (child) => {
      stack.push(child);
    });
  }
  if (count > 2048 || /@ts-(?:ignore|expect-error|nocheck)\b/u.test(sourceText))
    reject('構文上限を守り、型検査を無効にしないでください。');
  const imports = new Map<string, string>();
  const localNames = new Set<string>();
  let component: ts.FunctionDeclaration | undefined;
  const name = customHook ? 'useSourceValue' : 'SourcePanel';
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
      const module = statement.moduleSpecifier.text;
      for (const binding of clause.namedBindings.elements) {
        const original = binding.propertyName?.text ?? binding.name.text;
        const allowed =
          (module === 'react' &&
            ['useState', 'useEffect'].includes(original) &&
            !clause.phaseModifier &&
            !binding.isTypeOnly) ||
          (module === './source' &&
            original === 'subscribe' &&
            !clause.phaseModifier &&
            !binding.isTypeOnly) ||
          (module === './types' &&
            original === (customHook ? 'SourceId' : 'SourcePanelProps') &&
            clause.phaseModifier === ts.SyntaxKind.TypeKeyword);
        if (
          !allowed ||
          localNames.has(binding.name.text) ||
          [...imports.values()].includes(original)
        )
          reject();
        else {
          imports.set(binding.name.text, original);
          localNames.add(binding.name.text);
        }
      }
    } else if (
      ts.isFunctionDeclaration(statement) &&
      statement.name?.text === name &&
      statement.body &&
      !component &&
      statement.modifiers?.length === 1 &&
      statement.modifiers[0]?.kind === ts.SyntaxKind.ExportKeyword &&
      !statement.asteriskToken &&
      !statement.typeParameters &&
      !statement.type
    )
      component = statement;
    else reject();
  }
  const imported = (node: ts.Node, original: string): boolean =>
    ts.isIdentifier(node) && imports.get(node.text) === original;
  const parameter = component?.parameters[0];
  const parameterType = parameter?.type;
  if (
    !component?.body ||
    component.parameters.length !== 1 ||
    !parameter ||
    parameter.modifiers ||
    parameter.initializer ||
    parameter.dotDotDotToken ||
    parameter.questionToken ||
    !parameterType ||
    !ts.isTypeReferenceNode(parameterType) ||
    parameterType.typeArguments ||
    !imported(parameterType.typeName, customHook ? 'SourceId' : 'SourcePanelProps')
  ) {
    reject('用意済みのtargetの型で1つのComponent/Hookを定義してください。');
    return { diagnostics, facts: empty };
  }
  let target: string | undefined;
  if (customHook && ts.isIdentifier(parameter.name)) target = parameter.name.text;
  else if (
    !customHook &&
    ts.isObjectBindingPattern(parameter.name) &&
    parameter.name.elements.length === 1
  ) {
    const binding = parameter.name.elements[0]!;
    if (
      ts.isIdentifier(binding.name) &&
      (binding.propertyName?.getText(source) ?? binding.name.text) === 'target' &&
      !binding.dotDotDotToken &&
      !binding.initializer
    )
      target = binding.name.text;
  }
  if (!target) {
    reject('受け取ったtargetを購読対象に使います。');
    return { diagnostics, facts: empty };
  }
  const binding = (node: ts.BindingName): void => {
    if (ts.isIdentifier(node)) {
      if (localNames.has(node.text))
        reject('import・Hook・local値を同名宣言で隠さないでください。');
      localNames.add(node.text);
    } else for (const item of node.elements) if (ts.isBindingElement(item)) binding(item.name);
  };
  const walkBindings = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) || ts.isParameter(node)) binding(node.name);
    if (ts.isFunctionDeclaration(node) && node.name) binding(node.name);
    ts.forEachChild(node, walkBindings);
  };
  walkBindings(component);
  const statements = component.body.statements;
  const state = statements[0];
  const declaration =
    state &&
    ts.isVariableStatement(state) &&
    !state.modifiers &&
    state.declarationList.flags === ts.NodeFlags.Const &&
    state.declarationList.declarations.length === 1
      ? state.declarationList.declarations[0]
      : undefined;
  const call = declaration?.initializer;
  if (
    !declaration ||
    declaration.type ||
    !ts.isArrayBindingPattern(declaration.name) ||
    declaration.name.elements.length !== 2 ||
    !call ||
    !ts.isCallExpression(call) ||
    !imported(call.expression, 'useState') ||
    call.typeArguments ||
    call.questionDotToken ||
    call.arguments.length !== 1 ||
    !ts.isStringLiteral(call.arguments[0]!) ||
    call.arguments[0].text !== '' ||
    declaration.name.elements.some(
      (item) =>
        !ts.isBindingElement(item) ||
        !ts.isIdentifier(item.name) ||
        item.initializer ||
        item.dotDotDotToken ||
        item.propertyName,
    )
  ) {
    reject('最上位で空文字列のStateを1つ作ります。');
    return { diagnostics, facts: empty };
  }
  const valueName = declaration.name.elements[0]!.getText(source);
  const setter = declaration.name.elements[1]!.getText(source);
  const effect = statements[1];
  const effectCall = effect && ts.isExpressionStatement(effect) ? effect.expression : undefined;
  if (
    !effectCall ||
    !ts.isCallExpression(effectCall) ||
    !imported(effectCall.expression, 'useEffect') ||
    effectCall.typeArguments ||
    effectCall.questionDotToken ||
    effectCall.arguments.length !== 2
  ) {
    reject('Stateの次に外部入力へのEffectを1つ定義します。');
    return { diagnostics, facts: empty };
  }
  const setup = effectCall.arguments[0]!;
  const dependencies = effectCall.arguments[1]!;
  if (
    !ts.isArrowFunction(setup) ||
    setup.modifiers ||
    setup.typeParameters ||
    setup.type ||
    setup.parameters.length ||
    !ts.isBlock(setup.body) ||
    !ts.isArrayLiteralExpression(dependencies) ||
    dependencies.elements.length > 1
  ) {
    reject();
    return { diagnostics, facts: empty };
  }
  const tracksTarget =
    dependencies.elements.length === 1 &&
    ts.isIdentifier(dependencies.elements[0]!) &&
    dependencies.elements[0].getText(source) === target;
  if (dependencies.elements.length === 1 && !tracksTarget) reject();
  const isTarget = (node: ts.Expression): boolean => ts.isIdentifier(node) && node.text === target;
  const observed = { subscribed: false, connectsTarget: false, forwardsValue: false };
  const subscription = (node: ts.Expression): boolean => {
    if (
      !ts.isCallExpression(node) ||
      !imported(node.expression, 'subscribe') ||
      node.typeArguments ||
      node.questionDotToken ||
      node.arguments.length !== 2
    ) {
      reject();
      return false;
    }
    if (observed.subscribed) reject('同じEffect内で購読を二重に作らないでください。');
    observed.subscribed = true;
    const selected = node.arguments[0]!;
    if (
      !isTarget(selected) &&
      !(ts.isStringLiteral(selected) && ['source-a', 'source-b'].includes(selected.text))
    )
      reject();
    observed.connectsTarget = isTarget(selected);
    const receive = node.arguments[1]!;
    observed.forwardsValue = ts.isIdentifier(receive) && receive.text === setter;
    if (!observed.forwardsValue) reject('購読で受け取った値をそのままStateのsetterへ渡します。');
    return true;
  };
  const cleanupNames = new Set<string>();
  let cleans = false;
  let returned = false;
  const emptyCleanup = (node: ts.Expression): boolean =>
    ts.isArrowFunction(node) &&
    !node.modifiers &&
    !node.typeParameters &&
    !node.type &&
    !node.parameters.length &&
    ts.isBlock(node.body) &&
    node.body.statements.length === 0;
  const invokesCleanup = (node: ts.Node): boolean =>
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    cleanupNames.has(node.expression.text) &&
    !node.typeArguments &&
    !node.questionDotToken &&
    node.arguments.length === 0;
  for (const item of setup.body.statements) {
    if (returned) {
      reject();
      continue;
    }
    if (
      ts.isVariableStatement(item) &&
      !item.modifiers &&
      item.declarationList.flags === ts.NodeFlags.Const &&
      item.declarationList.declarations.length === 1
    ) {
      const local = item.declarationList.declarations[0]!;
      if (!ts.isIdentifier(local.name) || local.type || !local.initializer) {
        reject();
        continue;
      }
      if (ts.isIdentifier(local.initializer) && cleanupNames.has(local.initializer.text))
        cleanupNames.add(local.name.text);
      else if (subscription(local.initializer)) cleanupNames.add(local.name.text);
    } else if (ts.isReturnStatement(item) && item.expression) {
      returned = true;
      const output = item.expression;
      if (ts.isIdentifier(output) && cleanupNames.has(output.text)) cleans = true;
      else if (ts.isCallExpression(output) && imported(output.expression, 'subscribe'))
        cleans = subscription(output);
      else if (emptyCleanup(output)) cleans = false;
      else if (invokesCleanup(output))
        cleans = false; // setup中の解除は型成功でも同期を保てない負例。
      else if (
        ts.isArrowFunction(output) &&
        !output.modifiers &&
        !output.typeParameters &&
        !output.type &&
        !output.parameters.length
      ) {
        const body = ts.isBlock(output.body) ? output.body.statements : undefined;
        cleans = body
          ? body.length === 1 &&
            ts.isExpressionStatement(body[0]!) &&
            invokesCleanup(body[0].expression)
          : invokesCleanup(output.body);
        if (!cleans) reject();
      } else reject();
    } else if (
      ts.isExpressionStatement(item) &&
      ts.isCallExpression(item.expression) &&
      imported(item.expression.expression, 'subscribe')
    )
      subscription(item.expression);
    else reject();
  }
  if (!observed.subscribed) reject();
  let receives = false;
  let derives = customHook;
  if (
    statements.length !== 3 ||
    !statements[2] ||
    !ts.isReturnStatement(statements[2]) ||
    !statements[2].expression
  )
    reject('Effectの後はStateから表示または返す値を直接導きます。');
  else if (customHook) {
    const output = statements[2].expression;
    receives = ts.isIdentifier(output) && output.text === valueName;
    if (!receives && !ts.isStringLiteral(output)) reject();
  } else {
    const ids = new Set<string>();
    const render = (node: ts.Node): void => {
      if (ts.isParenthesizedExpression(node)) {
        render(node.expression);
        return;
      }
      if (!ts.isJsxElement(node) && !ts.isJsxSelfClosingElement(node)) {
        reject();
        return;
      }
      const opening = ts.isJsxElement(node) ? node.openingElement : node;
      if (
        !ts.isIdentifier(opening.tagName) ||
        !['section', 'div', 'p', 'h2', 'span', 'strong'].includes(opening.tagName.text) ||
        opening.typeArguments
      )
        reject();
      let id: string | undefined;
      const attributes = new Set<string>();
      for (const attribute of opening.attributes.properties) {
        if (
          !ts.isJsxAttribute(attribute) ||
          !ts.isIdentifier(attribute.name) ||
          attributes.has(attribute.name.text) ||
          !['id', 'className', 'role', 'aria-live'].includes(attribute.name.text) ||
          !attribute.initializer ||
          !ts.isStringLiteral(attribute.initializer)
        ) {
          reject();
          continue;
        }
        attributes.add(attribute.name.text);
        if (attribute.name.text === 'id') {
          id = attribute.initializer.text;
          if (ids.has(id) || !['observed', 'length'].includes(id))
            reject('固定の購読観測や外部入力のidを作り直さないでください。');
          ids.add(id);
        }
      }
      if (ts.isJsxElement(node))
        for (const child of node.children) {
          if (ts.isJsxText(child)) continue;
          if (ts.isJsxExpression(child)) {
            const output = child.expression;
            if (!output || child.dotDotDotToken) {
              reject();
              continue;
            }
            const rawValue = ts.isIdentifier(output) && output.text === valueName;
            const lengthValue =
              ts.isPropertyAccessExpression(output) &&
              !output.questionDotToken &&
              ts.isIdentifier(output.expression) &&
              output.expression.text === valueName &&
              output.name.text === 'length';
            if (
              !rawValue &&
              !lengthValue &&
              !ts.isStringLiteral(output) &&
              !ts.isNumericLiteral(output)
            )
              reject();
            if (id === 'observed' && rawValue) receives = true;
            if (id === 'length' && lengthValue) derives = true;
          } else render(child);
        }
    };
    render(statements[2].expression);
  }
  return {
    diagnostics,
    facts: {
      usesExternalEffect: observed.subscribed && observed.forwardsValue,
      tracksSelectedSource: tracksTarget && observed.connectsTarget,
      cleansSameSubscription: cleans,
      returnsReceivedValue: receives,
      derivesDuringRender: derives,
    },
  };
}
