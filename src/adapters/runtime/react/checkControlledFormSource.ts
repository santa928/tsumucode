import ts from 'typescript';
import type { TypeScriptDiagnostic } from '../typescript/compileTypeScript';

export interface ControlledFormFacts {
  readonly usesSingleState: boolean;
  readonly usesControlledInput: boolean;
  readonly derivesFromSameState: boolean;
  readonly preventsSubmit: boolean;
  readonly sharesParentState: boolean;
}

type Origin = 'name' | 'attempted' | 'input';
type Kind =
  | 'value'
  | 'form'
  | 'props'
  | 'event-input'
  | 'event-input-target'
  | 'event-submit'
  | 'setter'
  | 'callback';
interface Value {
  readonly kind: Kind;
  readonly origins: ReadonlySet<Origin>;
  readonly fields?: ReadonlyMap<string, Value>;
  readonly lengthOfName?: boolean;
  readonly rawName?: boolean;
  readonly summaryName?: boolean;
  readonly callback?: Callback;
  readonly forwarded?: boolean;
}
interface Scope {
  readonly values: Map<string, Value>;
  readonly handlers: Map<string, ts.FunctionDeclaration>;
  readonly owner: string;
  readonly observed: Observations;
}
interface Observations {
  controlled: boolean;
  length: boolean;
  message: boolean;
  summary: boolean;
  canceled: boolean;
}
const emptyObservations = (): Observations => ({
  controlled: false,
  length: false,
  message: false,
  summary: false,
  canceled: false,
});
interface Callback {
  readonly node: ts.ArrowFunction | ts.FunctionDeclaration;
  readonly scope: Scope;
}
interface EventFacts {
  updatedInput: boolean;
  canceled: boolean;
}
const value = (origins: readonly Origin[] = []): Value => ({
  kind: 'value',
  origins: new Set(origins),
  rawName: origins.length === 1 && origins[0] === 'name',
});
const TAGS = new Set([
  'section',
  'div',
  'h1',
  'h2',
  'p',
  'span',
  'strong',
  'form',
  'label',
  'input',
  'button',
]);
const ATTRIBUTES = new Set([
  'id',
  'className',
  'type',
  'name',
  'htmlFor',
  'value',
  'role',
  'aria-label',
  'aria-describedby',
  'aria-invalid',
  'aria-live',
]);
const TYPES = new Set([
  'FormState',
  'NameFieldProps',
  'NameSummaryProps',
  'InputChangeEvent',
  'FormSubmitEvent',
]);
const OPERATORS = new Set([
  ts.SyntaxKind.PlusToken,
  ts.SyntaxKind.EqualsEqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsEqualsToken,
  ts.SyntaxKind.LessThanToken,
  ts.SyntaxKind.GreaterThanToken,
  ts.SyntaxKind.AmpersandAmpersandToken,
  ts.SyntaxKind.BarBarToken,
]);

/**
 * 1つの親State・型付きの純粋な子・同期入力/送信へ閉じたAST契約。
 * 実際に描画するPropsとcallbackの経路だけを追い、学習者をWorkerでは実行しない。
 */
export function analyzeControlledForm(sourceText: string): {
  readonly diagnostics: readonly TypeScriptDiagnostic[];
  readonly facts: ControlledFormFacts;
} {
  const source = ts.createSourceFile(
    'components.tsx',
    sourceText,
    ts.ScriptTarget.ES2023,
    true,
    ts.ScriptKind.TSX,
  );
  const diagnostics: TypeScriptDiagnostic[] = [];
  const facts: ControlledFormFacts = {
    usesSingleState: false,
    usesControlledInput: false,
    derivesFromSameState: false,
    preventsSubmit: false,
    sharesParentState: false,
  };
  const reject = (
    node: ts.Node,
    message = 'この課題は1つの親Stateと同期入力・送信、純粋な子Componentだけを扱います。',
  ): void => {
    if (diagnostics.length >= 50) return;
    const position = source.getLineAndCharacterOfPosition(node.getStart(source));
    if (
      diagnostics.some(
        (item) =>
          item.line === position.line + 1 &&
          item.column === position.character + 1 &&
          item.message === message,
      )
    )
      return;
    diagnostics.push({
      code: 0,
      file: 'components.tsx',
      line: position.line + 1,
      column: position.character + 1,
      message,
    });
  };
  let nodeCount = 0;
  const count = (node: ts.Node): void => {
    nodeCount++;
    if (node.kind === ts.SyntaxKind.AnyKeyword)
      reject(node, 'anyで型を弱めず、用意済みの型を使います。');
    ts.forEachChild(node, count);
  };
  count(source);
  if (nodeCount > 2048 || /@ts-(?:ignore|expect-error|nocheck)\b/u.test(sourceText)) {
    reject(source, '構文上限を守り、型検査を無効にしないでください。');
    return { diagnostics, facts };
  }
  let hook: string | undefined;
  const typeAliases = new Map<string, string>();
  const components = new Map<string, ts.FunctionDeclaration>();
  for (const statement of source.statements) {
    if (ts.isImportDeclaration(statement)) {
      const clause = statement.importClause;
      if (
        !ts.isStringLiteral(statement.moduleSpecifier) ||
        !clause?.namedBindings ||
        !ts.isNamedImports(clause.namedBindings) ||
        clause.name
      ) {
        reject(statement);
        continue;
      }
      for (const binding of clause.namedBindings.elements) {
        const original = binding.propertyName?.text ?? binding.name.text;
        if (
          statement.moduleSpecifier.text === 'react' &&
          original === 'useState' &&
          !clause.phaseModifier &&
          !binding.isTypeOnly &&
          !hook
        )
          hook = binding.name.text;
        else if (
          statement.moduleSpecifier.text === './types' &&
          clause.phaseModifier === ts.SyntaxKind.TypeKeyword &&
          TYPES.has(original) &&
          !typeAliases.has(binding.name.text)
        )
          typeAliases.set(binding.name.text, original);
        else reject(binding, 'importはuseStateと用意済みのState・Props・Event型だけです。');
      }
    } else if (
      ts.isFunctionDeclaration(statement) &&
      statement.name &&
      statement.body &&
      !statement.asteriskToken &&
      !statement.typeParameters &&
      !statement.type &&
      !components.has(statement.name.text) &&
      (!statement.modifiers ||
        statement.modifiers.every((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword))
    )
      components.set(statement.name.text, statement);
    else reject(statement);
  }
  const app = components.get('App');
  if (
    !hook ||
    !app?.body ||
    app.parameters.length ||
    !app.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ||
    components.size > 3
  ) {
    reject(source, '引数のないAppから1つのStateを共有してください。子Componentは2つまでです。');
    return { diagnostics, facts };
  }
  const statements = [...app.body.statements];
  const first = statements.shift();
  const declaration =
    first &&
    ts.isVariableStatement(first) &&
    first.declarationList.flags === ts.NodeFlags.Const &&
    first.declarationList.declarations.length === 1
      ? first.declarationList.declarations[0]
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
    reject(first ?? source, 'App先頭でuseStateの値とsetterを受け取ります。');
    return { diagnostics, facts };
  }
  const stateName = (pattern.elements[0] as ts.BindingElement).name.getText(source);
  const setterName = (pattern.elements[1] as ts.BindingElement).name.getText(source);
  const formState =
    call.typeArguments?.length === 1 &&
    ts.isTypeReferenceNode(call.typeArguments[0]!) &&
    typeAliases.get(call.typeArguments[0].getText(source)) === 'FormState';
  if (
    stateName === setterName ||
    [stateName, setterName].includes(hook) ||
    (call.typeArguments &&
      !formState &&
      !(
        call.typeArguments.length === 1 &&
        call.typeArguments[0]?.kind === ts.SyntaxKind.StringKeyword
      ))
  )
    reject(call);
  const state: Value = formState
    ? {
        kind: 'form',
        origins: new Set(['name', 'attempted']),
        fields: new Map([
          ['name', value(['name'])],
          ['attempted', value(['attempted'])],
        ]),
      }
    : value(['name']);
  const root: Scope = {
    values: new Map([
      [stateName, state],
      [setterName, { kind: 'setter', origins: new Set() }],
    ]),
    handlers: new Map(),
    owner: 'App',
    observed: emptyObservations(),
  };
  const rendered: {
    name: string;
    type: string;
    parent: ts.Node | undefined;
    owner: string;
    connected: boolean;
    observed: Observations;
  }[] = [];
  const observations = emptyObservations();
  const ids = new Set<string>();
  const stack = new Set<string>();
  const combine = (...items: readonly Value[]): Value => ({
    kind: 'value',
    origins: new Set(items.flatMap((item) => [...item.origins])),
  });
  const referenceType = (node: ts.TypeNode | undefined): string | undefined =>
    node && ts.isTypeReferenceNode(node) && !node.typeArguments
      ? typeAliases.get(node.typeName.getText(source))
      : undefined;
  const unwrap = (node: ts.Expression): ts.Expression =>
    ts.isParenthesizedExpression(node) ? unwrap(node.expression) : node;

  const expression = (
    raw: ts.Expression,
    scope: Scope,
    mode: 'render' | 'event' | 'updater',
    eventFacts?: EventFacts,
  ): Value => {
    const node = unwrap(raw);
    if (
      ts.isStringLiteral(node) ||
      ts.isNumericLiteral(node) ||
      node.kind === ts.SyntaxKind.TrueKeyword ||
      node.kind === ts.SyntaxKind.FalseKeyword
    )
      return value();
    if (ts.isIdentifier(node)) {
      const found = scope.values.get(node.text);
      if (found && !(mode === 'updater' && found.kind.startsWith('event-'))) return found;
      const handler = scope.handlers.get(node.text);
      if (handler)
        return { kind: 'callback', origins: new Set(), callback: { node: handler, scope } };
      reject(node);
      return value();
    }
    if (ts.isPropertyAccessExpression(node)) {
      const receiver = expression(node.expression, scope, mode, eventFacts);
      if (
        (receiver.kind === 'form' || receiver.kind === 'props') &&
        receiver.fields?.has(node.name.text)
      )
        return receiver.fields.get(node.name.text)!;
      if (receiver.kind === 'event-input' && mode === 'event' && node.name.text === 'currentTarget')
        return { kind: 'event-input-target', origins: new Set() };
      if (receiver.kind === 'event-input-target' && mode === 'event' && node.name.text === 'value')
        return value(['input']);
      if (receiver.kind === 'value' && node.name.text === 'length')
        return { ...combine(receiver), lengthOfName: receiver.rawName === true };
      reject(node);
      return value();
    }
    if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.ExclamationToken)
      return combine(expression(node.operand, scope, mode, eventFacts));
    if (ts.isBinaryExpression(node) && OPERATORS.has(node.operatorToken.kind))
      return combine(
        expression(node.left, scope, mode, eventFacts),
        expression(node.right, scope, mode, eventFacts),
      );
    if (ts.isConditionalExpression(node))
      return combine(
        expression(node.condition, scope, mode, eventFacts),
        expression(node.whenTrue, scope, mode, eventFacts),
        expression(node.whenFalse, scope, mode, eventFacts),
      );
    if (ts.isObjectLiteralExpression(node)) {
      const fields = new Map<string, Value>();
      for (const property of node.properties) {
        if (ts.isSpreadAssignment(property)) {
          const base = expression(property.expression, scope, mode, eventFacts);
          if (base.kind !== 'form' || !base.fields) reject(property);
          else for (const [name, field] of base.fields) fields.set(name, field);
        } else if (
          ts.isPropertyAssignment(property) &&
          (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) &&
          ['name', 'attempted'].includes(property.name.text)
        )
          fields.set(property.name.text, expression(property.initializer, scope, mode, eventFacts));
        else if (
          ts.isShorthandPropertyAssignment(property) &&
          ['name', 'attempted'].includes(property.name.text) &&
          !property.objectAssignmentInitializer
        )
          fields.set(property.name.text, expression(property.name, scope, mode, eventFacts));
        else reject(property);
      }
      if (fields.size !== 2 || !fields.has('name') || !fields.has('attempted'))
        reject(node, 'FormStateのnameとattemptedを新しい値へ更新してください。');
      return {
        kind: 'form',
        origins: new Set([...fields.values()].flatMap((field) => [...field.origins])),
        fields,
      };
    }
    if (ts.isArrowFunction(node) && !node.modifiers && !node.typeParameters && !node.type)
      return { kind: 'callback', origins: new Set(), callback: { node, scope } };
    if (ts.isCallExpression(node) && !node.typeArguments) {
      if (
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === 'trim' &&
        node.arguments.length === 0
      ) {
        const receiver = expression(node.expression.expression, scope, mode, eventFacts);
        if (receiver.kind === 'value')
          return {
            ...combine(receiver),
            summaryName: receiver.rawName === true || receiver.summaryName === true,
          };
      } else if (
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === 'preventDefault' &&
        node.arguments.length === 0 &&
        mode === 'event'
      ) {
        const receiver = expression(node.expression.expression, scope, mode, eventFacts);
        if (receiver.kind === 'event-submit') {
          if (eventFacts) eventFacts.canceled = true;
          return value();
        }
      } else {
        const target = expression(node.expression, scope, mode, eventFacts);
        if (mode === 'event' && node.arguments.length === 1 && target.kind === 'setter') {
          const argument = expression(node.arguments[0]!, scope, mode, eventFacts);
          const next = argument.callback ? execute(argument.callback, 'updater', state) : argument;
          if (
            eventFacts &&
            (formState ? next.fields?.get('name')?.origins.has('input') : next.origins.has('input'))
          )
            eventFacts.updatedInput = true;
          return value();
        }
        if (
          mode === 'event' &&
          node.arguments.length === 1 &&
          target.callback &&
          target.forwarded
        ) {
          const argument = expression(node.arguments[0]!, scope, mode, eventFacts);
          execute(target.callback, 'event', argument, eventFacts);
          return value();
        }
      }
      reject(node);
      return value();
    }
    reject(node);
    return value();
  };

  /** Eventオブジェクトの遅延読取りを禁じ、同期handler内で取得した文字列だけを更新へ渡す。 */
  const execute = (
    callback: Callback,
    mode: 'event' | 'updater',
    argument?: Value,
    eventFacts?: EventFacts,
  ): Value => {
    const { node } = callback;
    if (
      node.parameters.length > (argument ? 1 : 0) ||
      !node.body ||
      (ts.isFunctionDeclaration(node) && node.asteriskToken) ||
      node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword)
    ) {
      reject(node);
      return value();
    }
    const parameter = node.parameters[0];
    const scope: Scope = { ...callback.scope, values: new Map(callback.scope.values) };
    if (parameter) {
      if (
        !ts.isIdentifier(parameter.name) ||
        parameter.initializer ||
        parameter.dotDotDotToken ||
        parameter.questionToken ||
        scope.values.has(parameter.name.text)
      ) {
        reject(parameter);
        return value();
      }
      const expected =
        argument?.kind === 'event-input'
          ? 'InputChangeEvent'
          : argument?.kind === 'event-submit'
            ? 'FormSubmitEvent'
            : undefined;
      if (
        parameter.type &&
        (expected
          ? referenceType(parameter.type) !== expected
          : mode === 'event' && parameter.type.kind !== ts.SyntaxKind.StringKeyword)
      )
        reject(parameter.type);
      scope.values.set(parameter.name.text, argument ?? value());
    }
    if (!ts.isBlock(node.body)) return expression(node.body, scope, mode, eventFacts);
    let result = value();
    let returned = false;
    for (const statement of node.body.statements) {
      if (returned) {
        reject(statement);
        continue;
      }
      if (ts.isVariableStatement(statement)) declare(statement, scope, mode, eventFacts);
      else if (mode === 'event' && ts.isExpressionStatement(statement))
        expression(statement.expression, scope, mode, eventFacts);
      else if (ts.isReturnStatement(statement) && statement.expression) {
        result = expression(statement.expression, scope, mode, eventFacts);
        returned = true;
      } else if (
        mode === 'event' &&
        ts.isThrowStatement(statement) &&
        ts.isNewExpression(statement.expression) &&
        ts.isIdentifier(statement.expression.expression) &&
        statement.expression.expression.text === 'Error' &&
        !statement.expression.typeArguments &&
        statement.expression.arguments?.length === 1 &&
        ts.isStringLiteral(statement.expression.arguments[0]!)
      )
        returned = true;
      else reject(statement);
    }
    if (mode === 'updater' && !returned)
      reject(node, 'updaterはEventを保持せず、純粋な次の値を返します。');
    return result;
  };
  const declare = (
    statement: ts.VariableStatement,
    scope: Scope,
    mode: 'render' | 'event' | 'updater',
    eventFacts?: EventFacts,
  ): void => {
    if (statement.modifiers || statement.declarationList.flags !== ts.NodeFlags.Const)
      reject(statement);
    for (const declaration of statement.declarationList.declarations) {
      if (
        !ts.isIdentifier(declaration.name) ||
        !declaration.initializer ||
        declaration.type ||
        scope.values.has(declaration.name.text) ||
        scope.handlers.has(declaration.name.text)
      ) {
        reject(declaration);
        continue;
      }
      const found = expression(declaration.initializer, scope, mode, eventFacts);
      if (found.kind.startsWith('event-') || found.kind === 'setter' || found.callback)
        reject(declaration, 'Eventとsetterは別名で保持せず、handlerで値を読み取ってください。');
      scope.values.set(declaration.name.text, found);
    }
  };
  const connect = (
    node: ts.Expression,
    scope: Scope,
    event: 'input' | 'submit' | 'click',
  ): EventFacts => {
    const eventFacts: EventFacts = { updatedInput: false, canceled: false };
    const found = expression(node, scope, 'render');
    if (found.callback)
      execute(
        found.callback,
        'event',
        event === 'click'
          ? undefined
          : { kind: event === 'input' ? 'event-input' : 'event-submit', origins: new Set() },
        eventFacts,
      );
    else reject(node, '操作時に呼ぶ同期handlerを渡します。');
    return eventFacts;
  };
  const componentType = (component: ts.FunctionDeclaration): string | undefined =>
    referenceType(component.parameters[0]?.type);
  const render = (raw: ts.Expression, scope: Scope, parent?: ts.Node): void => {
    const node = unwrap(raw);
    if (!ts.isJsxElement(node) && !ts.isJsxSelfClosingElement(node)) {
      expression(node, scope, 'render');
      return;
    }
    const opening = ts.isJsxElement(node) ? node.openingElement : node;
    if (!ts.isIdentifier(opening.tagName) || opening.typeArguments) {
      reject(opening);
      return;
    }
    const tag = opening.tagName.text;
    const properties = new Map<string, ts.JsxAttribute>();
    for (const property of opening.attributes.properties) {
      if (
        !ts.isJsxAttribute(property) ||
        !ts.isIdentifier(property.name) ||
        properties.has(property.name.text)
      )
        reject(property);
      else properties.set(property.name.text, property);
    }
    const read = (name: string): Value => {
      const initial = properties.get(name)?.initializer;
      if (initial && ts.isStringLiteral(initial)) return value();
      if (initial && ts.isJsxExpression(initial) && initial.expression)
        return expression(initial.expression, scope, 'render');
      return value();
    };
    const attrExpression = (name: string): ts.Expression | undefined => {
      const initial = properties.get(name)?.initializer;
      return initial && ts.isJsxExpression(initial) ? initial.expression : undefined;
    };
    const id = properties.get('id')?.initializer;
    const identifier = id && ts.isStringLiteral(id) ? id.text : undefined;
    if (TAGS.has(tag)) {
      if (identifier) {
        if (ids.has(identifier)) reject(opening, 'idは描画する要素間で一意にしてください。');
        ids.add(identifier);
      }
      for (const [name, property] of properties) {
        if (['onChange', 'onSubmit', 'onClick'].includes(name)) {
          const handler = attrExpression(name);
          const event = name === 'onChange' ? 'input' : name === 'onSubmit' ? 'submit' : 'click';
          if (
            !handler ||
            tag !== (event === 'input' ? 'input' : event === 'submit' ? 'form' : 'button')
          )
            reject(property);
          else {
            const result = connect(handler, scope, event);
            if (
              event === 'input' &&
              identifier === 'name' &&
              read('value').rawName &&
              result.updatedInput
            )
              observations.controlled = scope.observed.controlled = true;
            if (event === 'submit' && identifier === 'name-form' && result.canceled)
              observations.canceled = scope.observed.canceled = true;
          }
        } else if (!ATTRIBUTES.has(name)) reject(property);
        else {
          const field = read(name);
          if (field.kind !== 'value') reject(property);
          if (
            ['id', 'type', 'role', 'htmlFor', 'aria-describedby'].includes(name) &&
            (!property.initializer || !ts.isStringLiteral(property.initializer))
          )
            reject(property);
        }
      }
    } else {
      const component = components.get(tag);
      const type = component && componentType(component);
      if (
        !component ||
        !['NameFieldProps', 'NameSummaryProps'].includes(type ?? '') ||
        stack.has(tag)
      ) {
        reject(opening);
        return;
      }
      const allowed = type === 'NameFieldProps' ? ['value', 'onNameChange'] : ['value'];
      if (
        [...properties.keys()].some((name) => !allowed.includes(name)) ||
        allowed.some((name) => !properties.has(name))
      )
        reject(opening);
      const fields = new Map(
        allowed.map((name) => [
          name,
          name === 'onNameChange' ? { ...read(name), forwarded: true } : read(name),
        ]),
      );
      const callback = fields.get('onNameChange');
      if (type === 'NameFieldProps' && callback && !callback.callback && callback.kind !== 'setter')
        reject(properties.get('onNameChange')!);
      const observed = emptyObservations();
      rendered.push({
        name: tag,
        type: type!,
        parent,
        owner: scope.owner,
        connected: fields.get('value')?.rawName ?? false,
        observed,
      });
      const child: Scope = { values: new Map(), handlers: new Map(), owner: tag, observed };
      const parameter = component.parameters[0];
      if (
        component.parameters.length !== 1 ||
        !parameter ||
        parameter.initializer ||
        parameter.dotDotDotToken ||
        parameter.questionToken
      )
        reject(component);
      else if (ts.isIdentifier(parameter.name))
        child.values.set(parameter.name.text, { kind: 'props', origins: new Set(), fields });
      else if (ts.isObjectBindingPattern(parameter.name)) {
        for (const binding of parameter.name.elements) {
          const original = binding.propertyName?.getText(source) ?? binding.name.getText(source);
          if (
            !ts.isIdentifier(binding.name) ||
            binding.initializer ||
            binding.dotDotDotToken ||
            !fields.has(original) ||
            child.values.has(binding.name.text)
          )
            reject(binding);
          else child.values.set(binding.name.text, fields.get(original)!);
        }
      } else reject(parameter);
      stack.add(tag);
      body(component.body!.statements, child);
      stack.delete(tag);
    }
    if (ts.isJsxElement(node))
      for (const child of node.children) {
        if (ts.isJsxText(child)) continue;
        if (ts.isJsxExpression(child)) {
          if (!child.expression || child.dotDotDotToken) {
            if (child.dotDotDotToken) reject(child);
            continue;
          }
          const result = expression(child.expression, scope, 'render');
          if (result.kind !== 'value') reject(child);
          if (identifier === 'length' && result.lengthOfName)
            observations.length = scope.observed.length = true;
          if (
            identifier === 'message' &&
            result.origins.has('name') &&
            result.origins.has('attempted')
          )
            observations.message = scope.observed.message = true;
          if (identifier === 'name-summary' && (result.rawName || result.summaryName))
            observations.summary = scope.observed.summary = true;
        } else render(child, scope, node);
      }
  };
  const body = (items: readonly ts.Statement[], scope: Scope): void => {
    let output: ts.Expression | undefined;
    for (const statement of items) {
      if (output) {
        reject(statement);
        continue;
      }
      if (
        ts.isFunctionDeclaration(statement) &&
        statement.name &&
        statement.body &&
        !statement.type &&
        !statement.typeParameters &&
        !statement.modifiers &&
        !statement.asteriskToken &&
        !scope.handlers.has(statement.name.text) &&
        !scope.values.has(statement.name.text)
      )
        scope.handlers.set(statement.name.text, statement);
      else if (ts.isVariableStatement(statement)) declare(statement, scope, 'render');
      else if (ts.isReturnStatement(statement) && statement.expression)
        output = statement.expression;
      else reject(statement);
    }
    if (!output) reject(source);
    else render(output, scope);
    // 未接続handlerも能力検査するが、学習factには数えない。
    for (const handler of scope.handlers.values()) {
      const type = referenceType(handler.parameters[0]?.type);
      const argument: Value | undefined =
        type === 'InputChangeEvent'
          ? { kind: 'event-input', origins: new Set() }
          : type === 'FormSubmitEvent'
            ? { kind: 'event-submit', origins: new Set() }
            : handler.parameters[0]?.type?.kind === ts.SyntaxKind.StringKeyword
              ? value(['input'])
              : undefined;
      execute({ node: handler, scope }, 'event', argument);
    }
  };
  const initial = call.arguments[0]!;
  if (formState) {
    const original = expression(initial, { ...root, values: new Map() }, 'render');
    if (original.kind !== 'form') reject(initial);
  } else if (!ts.isStringLiteral(initial)) reject(initial, '共有Stateは文字列から始めます。');
  stack.add('App');
  body(statements, root);
  stack.delete('App');
  for (const [name, component] of components)
    if (name !== 'App' && !rendered.some((item) => item.name === name))
      reject(component, '描画する子Componentだけを定義してください。');
  const field = rendered.find(
    (item) =>
      item.type === 'NameFieldProps' &&
      item.owner === 'App' &&
      item.connected &&
      item.observed.controlled,
  );
  const summary = rendered.find(
    (item) =>
      item.type === 'NameSummaryProps' &&
      item.owner === 'App' &&
      item.connected &&
      item.observed.summary &&
      item.observed.length &&
      item.parent === field?.parent,
  );
  return {
    diagnostics,
    facts: {
      usesSingleState: true,
      usesControlledInput: observations.controlled,
      derivesFromSameState:
        observations.length && (formState ? observations.message : observations.summary),
      preventsSubmit: observations.canceled,
      sharesParentState: !!field && !!summary,
    },
  };
}
