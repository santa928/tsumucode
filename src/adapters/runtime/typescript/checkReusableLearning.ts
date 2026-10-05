/** 関数型・generic・readonlyの初回課題だけを、有限な構文と非emit型検査で確認する。 */
import ts from 'typescript';
import { checkTypeScript } from './compileTypeScript';

export type ReusableLearningProfile =
  'number-callback-v1' | 'generic-identity-v1' | 'readonly-copy-v1';

export interface ReusableLearningFacts {
  readonly programShapeAccepted: boolean;
  readonly typeContractAccepted: boolean;
  readonly usesInputValue: boolean;
  readonly callsAccepted: boolean;
  readonly forbiddenEscapeAbsent: boolean;
  readonly positiveProbeAccepted: boolean;
  readonly negativeProbesRejected: boolean;
}

export type ReusableLearningResult =
  | {
      readonly status: 'ready';
      readonly profile: ReusableLearningProfile;
      readonly facts: ReusableLearningFacts;
    }
  | { readonly status: 'system-error' };

const EMPTY_FACTS: ReusableLearningFacts = {
  programShapeAccepted: false,
  typeContractAccepted: false,
  usesInputValue: false,
  callsAccepted: false,
  forbiddenEscapeAbsent: true,
  positiveProbeAccepted: false,
  negativeProbesRejected: false,
};

function unwrap(node: ts.Expression): ts.Expression {
  while (ts.isParenthesizedExpression(node)) node = node.expression;
  return node;
}

function identifier(node: ts.Node | undefined, name: string): boolean {
  return !!node && ts.isIdentifier(node) && node.text === name;
}

function nameOf(node: ts.Node | undefined): string {
  return node && ts.isIdentifier(node) ? node.text : '';
}

function typeReference(node: ts.TypeNode | undefined, name: string): boolean {
  return (
    !!node &&
    ts.isTypeReferenceNode(node) &&
    identifier(node.typeName, name) &&
    !node.typeArguments?.length
  );
}

function numeric(node: ts.Node | undefined, value?: number): boolean {
  return (
    !!node && ts.isNumericLiteral(node) && (value === undefined || Number(node.text) === value)
  );
}

function arrayType(node: ts.TypeNode | undefined, readonly: boolean): boolean {
  if (!node) return false;
  if (ts.isTypeReferenceNode(node))
    return (
      identifier(node.typeName, readonly ? 'ReadonlyArray' : 'Array') &&
      node.typeArguments?.length === 1 &&
      node.typeArguments[0]?.kind === ts.SyntaxKind.NumberKeyword
    );
  if (readonly)
    return (
      ts.isTypeOperatorNode(node) &&
      node.operator === ts.SyntaxKind.ReadonlyKeyword &&
      arrayType(node.type, false)
    );
  return ts.isArrayTypeNode(node) && node.elementType.kind === ts.SyntaxKind.NumberKeyword;
}

function parameter(node: ts.ParameterDeclaration | undefined): string {
  return node &&
    !node.modifiers?.length &&
    !node.questionToken &&
    !node.dotDotDotToken &&
    !node.initializer
    ? nameOf(node.name)
    : '';
}

/** returnだけ、またはローカルへ1回複写してreturnする同じ値の別解を受理する。 */
function returned(body: ts.ConciseBody | undefined): ts.Expression | undefined {
  if (!body) return undefined;
  if (!ts.isBlock(body)) return unwrap(body);
  const statements = body.statements;
  const last = statements.at(-1);
  if (!last || !ts.isReturnStatement(last) || !last.expression) return undefined;
  if (statements.length === 1) return unwrap(last.expression);
  const first = statements[0];
  if (
    statements.length !== 2 ||
    !first ||
    !ts.isVariableStatement(first) ||
    first.modifiers?.length ||
    first.declarationList.declarations.length !== 1
  )
    return undefined;
  const local = first.declarationList.declarations[0]!;
  return local.initializer &&
    nameOf(local.name) &&
    identifier(unwrap(last.expression), nameOf(local.name))
    ? unwrap(local.initializer)
    : undefined;
}

interface NamedFunction {
  readonly name: string;
  readonly fn: ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression;
  readonly annotation?: ts.TypeNode;
}

/** 関数宣言と、変数に付けたarrow/function式だけを同じ責務として読む。 */
function namedFunction(node: ts.Statement | undefined): NamedFunction | undefined {
  if (!node) return undefined;
  if (ts.isFunctionDeclaration(node) && node.name && !node.modifiers?.length && !node.asteriskToken)
    return { name: node.name.text, fn: node };
  if (
    !ts.isVariableStatement(node) ||
    node.modifiers?.length ||
    node.declarationList.declarations.length !== 1
  )
    return undefined;
  const declaration = node.declarationList.declarations[0]!;
  const initializer = declaration.initializer && unwrap(declaration.initializer);
  if (
    !nameOf(declaration.name) ||
    !initializer ||
    !(ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer)) ||
    initializer.modifiers?.length ||
    ('asteriskToken' in initializer && initializer.asteriskToken)
  )
    return undefined;
  return {
    name: nameOf(declaration.name),
    fn: initializer,
    ...(declaration.type ? { annotation: declaration.type } : {}),
  };
}

function call(
  node: ts.Expression | undefined,
  name: string,
  count: number,
): ts.CallExpression | undefined {
  if (!node) return undefined;
  node = unwrap(node);
  return ts.isCallExpression(node) &&
    !node.questionDotToken &&
    identifier(node.expression, name) &&
    node.arguments.length === count
    ? node
    : undefined;
}

function method(
  node: ts.Expression | undefined,
  name: string,
  member: string,
  count: number,
): ts.CallExpression | undefined {
  if (!node) return undefined;
  node = unwrap(node);
  return ts.isCallExpression(node) &&
    !node.questionDotToken &&
    !node.typeArguments?.length &&
    ts.isPropertyAccessExpression(node.expression) &&
    !node.expression.questionDotToken &&
    identifier(node.expression.expression, name) &&
    node.expression.name.text === member &&
    node.arguments.length === count
    ? node
    : undefined;
}

function consoleValue(node: ts.Statement | undefined): ts.Expression | undefined {
  return node && ts.isExpressionStatement(node)
    ? method(node.expression, 'console', 'log', 1)?.arguments[0]
    : undefined;
}

function arithmetic(node: ts.Expression, input: string): boolean {
  node = unwrap(node);
  return (
    ts.isBinaryExpression(node) &&
    [ts.SyntaxKind.AsteriskToken, ts.SyntaxKind.PlusToken].includes(node.operatorToken.kind) &&
    ((identifier(unwrap(node.left), input) &&
      (numeric(unwrap(node.right)) || identifier(unwrap(node.right), input))) ||
      (numeric(unwrap(node.left)) && identifier(unwrap(node.right), input)))
  );
}

function variable(node: ts.Statement | undefined): ts.VariableDeclaration | undefined {
  return node &&
    ts.isVariableStatement(node) &&
    !node.modifiers?.length &&
    node.declarationList.declarations.length === 1
    ? node.declarationList.declarations[0]
    : undefined;
}

interface Inspection {
  readonly shape: boolean;
  readonly type: boolean;
  readonly value: boolean;
  readonly calls: boolean;
  readonly exportSource: string;
  readonly positiveLines: readonly string[];
  readonly negativeLines: readonly { readonly source: string; readonly code: number }[];
}

function callback(file: ts.SourceFile): Inspection {
  const first = file.statements[0];
  const alias = first && ts.isTypeAliasDeclaration(first) ? first : undefined;
  const aliasName = alias?.name.text ?? '';
  const apply = namedFunction(file.statements[1]);
  const operation = namedFunction(file.statements[2]);
  const input = parameter(apply?.fn.parameters[0]);
  const handler = parameter(apply?.fn.parameters[1]);
  const operationInput = parameter(operation?.fn.parameters[0]);
  const signature =
    alias && ts.isTypeAliasDeclaration(alias) && ts.isFunctionTypeNode(alias.type)
      ? alias.type
      : undefined;
  const type =
    !!alias &&
    !!signature &&
    !alias.modifiers?.length &&
    !alias.typeParameters?.length &&
    !signature.typeParameters?.length &&
    signature.parameters.length === 1 &&
    !!parameter(signature.parameters[0]) &&
    signature.parameters[0]?.type?.kind === ts.SyntaxKind.NumberKeyword &&
    signature.type.kind === ts.SyntaxKind.NumberKeyword &&
    apply?.fn.parameters[0]?.type?.kind === ts.SyntaxKind.NumberKeyword &&
    typeReference(apply.fn.parameters[1]?.type, aliasName) &&
    apply.fn.type?.kind === ts.SyntaxKind.NumberKeyword &&
    !!operation &&
    (typeReference(operation.annotation, aliasName)
      ? (!operation.fn.parameters[0]?.type ||
          operation.fn.parameters[0].type.kind === ts.SyntaxKind.NumberKeyword) &&
        (!operation.fn.type || operation.fn.type.kind === ts.SyntaxKind.NumberKeyword)
      : operation.fn.parameters[0]?.type?.kind === ts.SyntaxKind.NumberKeyword &&
        operation.fn.type?.kind === ts.SyntaxKind.NumberKeyword);
  const invoke = call(returned(apply?.fn.body), handler, 1);
  const result = returned(operation?.fn.body);
  return {
    shape:
      file.statements.length === 5 &&
      !!aliasName &&
      !!apply &&
      !!operation &&
      apply.fn.parameters.length === 2 &&
      operation.fn.parameters.length === 1 &&
      !apply.fn.typeParameters?.length &&
      !operation.fn.typeParameters?.length &&
      !!input &&
      !!handler &&
      !!operationInput,
    type,
    value:
      !!invoke &&
      !invoke.typeArguments?.length &&
      identifier(invoke.arguments[0], input) &&
      !!result &&
      arithmetic(result, operationInput),
    calls: [3, 5].every((value, index) => {
      const invocation = call(consoleValue(file.statements[index + 3]), apply?.name ?? '', 2);
      return (
        !!invocation &&
        !invocation.typeArguments?.length &&
        numeric(invocation.arguments[0], value) &&
        identifier(invocation.arguments[1], operation?.name ?? '')
      );
    }),
    exportSource: `export type { ${aliasName} as __tsumucode_operation };\nexport { ${apply?.name ?? ''} as __tsumucode_function };`,
    positiveLines: [
      'const operation: __tsumucode_operation = (value: number): number => value;',
      'const result: number = __tsumucode_function(0, operation);',
    ],
    negativeLines: [
      {
        source: 'const wrongInput: __tsumucode_operation = (value: string): number => 0;',
        code: 2322,
      },
      {
        source: 'const wrongOutput: __tsumucode_operation = (value: number): string => "0";',
        code: 2322,
      },
      { source: '__tsumucode_function("0", (value: number): number => value);', code: 2345 },
      {
        source:
          'const wrongResult: string = __tsumucode_function(0, (value: number): number => value);',
        code: 2322,
      },
    ],
  };
}

function generic(file: ts.SourceFile): Inspection {
  const keep = namedFunction(file.statements[0]);
  const typeParameter = keep?.fn.typeParameters?.[0];
  const typeName = nameOf(typeParameter?.name);
  const input = parameter(keep?.fn.parameters[0]);
  const entries = [variable(file.statements[1]), variable(file.statements[2])];
  const type =
    keep?.fn.typeParameters?.length === 1 &&
    !!typeParameter &&
    !typeParameter.modifiers?.length &&
    !typeParameter.constraint &&
    !typeParameter.default &&
    !!typeName &&
    typeReference(keep.fn.parameters[0]?.type, typeName) &&
    typeReference(keep.fn.type, typeName);
  return {
    shape:
      file.statements.length === 5 &&
      !!keep &&
      keep.fn.parameters.length === 1 &&
      !!input &&
      entries.every((entry) => !!entry && !!nameOf(entry.name)),
    type,
    value: !!keep && !!returned(keep.fn.body) && identifier(returned(keep.fn.body), input),
    calls: entries.every((entry, index) => {
      const invocation = call(entry?.initializer, keep?.name ?? '', 1);
      const argument = invocation?.arguments[0];
      return (
        !!entry &&
        !!invocation &&
        (!invocation.typeArguments?.length ||
          (invocation.typeArguments.length === 1 &&
            invocation.typeArguments[0]?.kind ===
              (index === 0 ? ts.SyntaxKind.NumberKeyword : ts.SyntaxKind.StringKeyword))) &&
        entry.type?.kind ===
          (index === 0 ? ts.SyntaxKind.NumberKeyword : ts.SyntaxKind.StringKeyword) &&
        (index === 0
          ? numeric(argument, 2)
          : !!argument && ts.isStringLiteral(argument) && argument.text === '型のクイズ') &&
        identifier(consoleValue(file.statements[index + 3]), nameOf(entry.name))
      );
    }),
    exportSource: `export { ${keep?.name ?? ''} as __tsumucode_function };`,
    positiveLines: [
      'const numberResult: number = __tsumucode_function<number>(0);',
      'const stringResult: string = __tsumucode_function<string>("文字");',
    ],
    negativeLines: [
      { source: '__tsumucode_function<number>("文字");', code: 2345 },
      { source: 'const wrongNumber: string = __tsumucode_function<number>(0);', code: 2322 },
      { source: 'const wrongString: number = __tsumucode_function<string>("文字");', code: 2322 },
    ],
  };
}

function readonlyCopy(file: ts.SourceFile): Inspection {
  const append = namedFunction(file.statements[0]);
  const input = parameter(append?.fn.parameters[0]);
  const original = variable(file.statements[1]);
  const updated = variable(file.statements[2]);
  const originalName = nameOf(original?.name);
  const updatedName = nameOf(updated?.name);
  const output = returned(append?.fn.body);
  const concat = method(output, input, 'concat', 1);
  const copied =
    !!output &&
    ts.isArrayLiteralExpression(output) &&
    output.elements.length === 2 &&
    output.elements.some(
      (element) => ts.isSpreadElement(element) && identifier(element.expression, input),
    ) &&
    output.elements.some((element) => numeric(element));
  const appendCall = call(updated?.initializer, append?.name ?? '', 1);
  const sourceArray = original?.initializer;
  const pushStatement = file.statements[3];
  const push =
    pushStatement && ts.isExpressionStatement(pushStatement)
      ? method(pushStatement.expression, originalName, 'push', 1)
      : undefined;
  return {
    shape:
      file.statements.length === 6 &&
      !!append &&
      append.fn.parameters.length === 1 &&
      !append.fn.typeParameters?.length &&
      !!input &&
      !!originalName &&
      !!updatedName,
    type: arrayType(append?.fn.parameters[0]?.type, true) && arrayType(append?.fn.type, false),
    value: copied || (!!concat && numeric(concat.arguments[0])),
    calls:
      !!sourceArray &&
      ts.isArrayLiteralExpression(sourceArray) &&
      sourceArray.elements.length === 2 &&
      numeric(sourceArray.elements[0], 1) &&
      numeric(sourceArray.elements[1], 2) &&
      !!appendCall &&
      !appendCall.typeArguments?.length &&
      identifier(appendCall.arguments[0], originalName) &&
      !!push &&
      numeric(push.arguments[0], 4) &&
      [originalName, updatedName].every((name, index) => {
        const join = method(consoleValue(file.statements[index + 4]), name, 'join', 1);
        return (
          !!join &&
          !!join.arguments[0] &&
          ts.isStringLiteral(join.arguments[0]) &&
          join.arguments[0].text === ','
        );
      }),
    exportSource: `export { ${append?.name ?? ''} as __tsumucode_function };`,
    positiveLines: [
      'const input: Parameters<typeof __tsumucode_function>[0] = [0];',
      'const output: number[] = __tsumucode_function(input); output.push(1);',
    ],
    negativeLines: [
      {
        source: 'const wrongInput: Parameters<typeof __tsumucode_function>[0] = ["0"];',
        code: 2322,
      },
      {
        source: 'const input: Parameters<typeof __tsumucode_function>[0] = []; input[0] = 1;',
        code: 2542,
      },
      {
        source: 'const input: Parameters<typeof __tsumucode_function>[0] = []; input.push(1);',
        code: 2339,
      },
    ],
  };
}

/** 型の契約と実値を使う処理を確認し、正負probeはコピー内で完結させる。 */
export function checkReusableLearning(
  files: Readonly<Record<string, string>>,
  libraries: Readonly<Record<string, string>>,
  profile: ReusableLearningProfile,
): ReusableLearningResult {
  if (Object.keys(files).some((name) => name.startsWith('__tsumucode_')))
    return { status: 'system-error' };
  const source = files['main.ts'];
  if (Object.keys(files).length !== 1 || source === undefined)
    return { status: 'ready', profile, facts: EMPTY_FACTS };
  if (source.length > 8192) return { status: 'system-error' };
  try {
    const file = ts.createSourceFile('main.ts', source, ts.ScriptTarget.ES2023, true);
    const pending = [{ node: file as ts.Node, depth: 0 }];
    let nodes = 0;
    let forbiddenEscapeAbsent = true;
    while (pending.length) {
      const { node, depth } = pending.pop()!;
      if (++nodes > 2048 || depth > 64) return { status: 'system-error' };
      if (
        node.kind === ts.SyntaxKind.AnyKeyword ||
        ts.isAsExpression(node) ||
        ts.isTypeAssertionExpression(node) ||
        ts.isNonNullExpression(node)
      )
        forbiddenEscapeAbsent = false;
      if (
        ts.isIdentifier(node) &&
        (node.text.startsWith('__tsumucode_') ||
          (['console', 'undefined'].includes(node.text) &&
            !ts.isPropertyAccessExpression(node.parent) &&
            !ts.isTypeReferenceNode(node.parent)))
      ) {
        if (node.text.startsWith('__tsumucode_')) return { status: 'system-error' };
        forbiddenEscapeAbsent = false;
      }
      ts.forEachChild(node, (child) => {
        pending.push({ node: child, depth: depth + 1 });
      });
    }
    const scanner = ts.createScanner(
      ts.ScriptTarget.ES2023,
      false,
      ts.LanguageVariant.Standard,
      source,
    );
    for (
      let token = scanner.scan();
      token !== ts.SyntaxKind.EndOfFileToken;
      token = scanner.scan()
    ) {
      if (
        (token === ts.SyntaxKind.SingleLineCommentTrivia ||
          token === ts.SyntaxKind.MultiLineCommentTrivia) &&
        (/@ts-(?:ignore|expect-error|nocheck)\b/u.test(scanner.getTokenText()) ||
          /^\/\/\/\s*<reference\b/u.test(scanner.getTokenText()))
      )
        forbiddenEscapeAbsent = false;
    }
    const inspection =
      profile === 'number-callback-v1'
        ? callback(file)
        : profile === 'generic-identity-v1'
          ? generic(file)
          : readonlyCopy(file);
    const facts = {
      ...EMPTY_FACTS,
      programShapeAccepted: inspection.shape,
      typeContractAccepted: inspection.type,
      usesInputValue: inspection.value,
      callsAccepted: inspection.calls,
      forbiddenEscapeAbsent,
    };
    if (
      ![
        inspection.shape,
        inspection.type,
        inspection.value,
        inspection.calls,
        forbiddenEscapeAbsent,
      ].every(Boolean)
    )
      return { status: 'ready', profile, facts };
    if (checkTypeScript(files, libraries).status !== 'valid') return { status: 'system-error' };
    const copy = source + '\n' + inspection.exportSource + '\n';
    const prefix =
      profile === 'number-callback-v1'
        ? 'import { __tsumucode_function, type __tsumucode_operation } from "./main.js";\n'
        : 'import { __tsumucode_function } from "./main.js";\n';
    const positive = checkTypeScript(
      {
        'main.ts': copy,
        '__tsumucode_positive.ts': prefix + inspection.positiveLines.join('\n') + '\n',
      },
      libraries,
    );
    const negative = checkTypeScript(
      {
        'main.ts': copy,
        '__tsumucode_negative.ts':
          prefix + inspection.negativeLines.map((line) => `{ ${line.source} }`).join('\n') + '\n',
      },
      libraries,
    );
    if (
      positive.status !== 'valid' ||
      negative.status !== 'type-error' ||
      negative.diagnostics.length !== inspection.negativeLines.length ||
      !inspection.negativeLines.every((line, index) =>
        negative.diagnostics.some(
          (d) =>
            d.file === '__tsumucode_negative.ts' &&
            d.line === index + 2 &&
            d.code === line.code &&
            (d.column ?? 0) > 0,
        ),
      )
    )
      return { status: 'system-error' };
    return {
      status: 'ready',
      profile,
      facts: { ...facts, positiveProbeAccepted: true, negativeProbesRejected: true },
    };
  } catch {
    return { status: 'system-error' };
  }
}
