import { parse, type Node } from 'acorn';
import { fullAncestor } from 'acorn-walk';
import MagicString from 'magic-string';
import type { RunnerDiagnostic, RunnerDiagnosticKind } from '../../../../core/runtime/contracts';
import { JavaScriptAnalysisIssue, assertJavaScriptCapabilityPolicy } from './capabilityPolicy';
import type {
  JavaScriptAnalysisFailure,
  JavaScriptLegacyAnalysisResult,
  JavaScriptLegacyAnalysisRequest,
  JavaScriptAnalysisRequest,
  JavaScriptAnalysisResult,
  JavaScriptSourceFact,
  JavaScriptAssignmentOperator,
  JavaScriptBinaryOperator,
  JavaScriptCollectionTransformMethod,
  JavaScriptWorkspaceAnalysisRequest,
  JavaScriptWorkspaceAnalysisResult,
  JavaScriptWorkspaceAnalysisSuccess,
} from './contracts';
import { buildModuleGraph, JavaScriptModuleGraphError } from './moduleGraph';

type AstNode = Node & Readonly<Record<string, unknown>>;

const MAX_SOURCE_BYTES = 100 * 1024;
const MAX_AST_NODES = 20_000;
const MAX_AST_DEPTH = 256;
const MAX_STRING_LENGTH = 64 * 1024;
const MAX_ARRAY_ELEMENTS = 10_000;
const MAX_FACTS = 256;
const LOOP_TYPES = new Set([
  'WhileStatement',
  'DoWhileStatement',
  'ForStatement',
  'ForInStatement',
  'ForOfStatement',
]);
const FUNCTION_TYPES = new Set([
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunctionExpression',
]);
const BINARY_FACT_OPERATORS = new Set<JavaScriptBinaryOperator>([
  '+',
  '-',
  '*',
  '/',
  '%',
  '===',
  '!==',
  '>',
  '>=',
  '<',
  '<=',
  '&&',
  '||',
  '??',
]);
const ASSIGNMENT_FACT_OPERATORS = new Set<JavaScriptAssignmentOperator>([
  '=',
  '+=',
  '-=',
  '++',
  '--',
]);
const COLLECTION_TRANSFORM_METHODS = new Set<JavaScriptCollectionTransformMethod>([
  'map',
  'filter',
  'reduce',
]);

/** Acorn Nodeを追加propertyへ安全にアクセスできるRecordとして扱う。 */
function ast(node: Node): AstNode {
  return node as AstNode;
}

/** unknown値がAcorn Nodeかを最小propertyで確認する。 */
function isNode(value: unknown): value is Node {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Readonly<Record<string, unknown>>;
  return (
    typeof candidate.type === 'string' &&
    typeof candidate.start === 'number' &&
    typeof candidate.end === 'number'
  );
}

/** Analyzer failureをRunnerDiagnostic 1件へ正規化する。 */
function failure(
  request: JavaScriptAnalysisRequest,
  kind: Extract<RunnerDiagnosticKind, 'syntax' | 'security' | 'system'>,
  message: string,
  learnerMessage: string,
  line?: number,
  column?: number,
): JavaScriptAnalysisFailure {
  const file = 'files' in request ? request.entryFile : request.file;
  const diagnostic: RunnerDiagnostic = {
    code: `javascript-analyzer-${kind}`,
    kind,
    severity: 'error',
    message,
    learnerMessage,
    file,
    ...(line === undefined ? {} : { line }),
    ...(column === undefined ? {} : { column }),
  };
  return {
    status: 'failure',
    requestId: request.requestId,
    exerciseSessionId: request.exerciseSessionId,
    executionRevision: request.executionRevision,
    file,
    diagnostics: [diagnostic],
  };
}

/** Acorn syntax errorから1-based位置を抽出する。 */
function syntaxPosition(error: unknown): { readonly line?: number; readonly column?: number } {
  if (typeof error !== 'object' || error === null) return {};
  const location = (error as Readonly<Record<string, unknown>>).loc;
  if (typeof location !== 'object' || location === null) return {};
  const position = location as Readonly<Record<string, unknown>>;
  return {
    ...(typeof position.line === 'number' ? { line: position.line } : {}),
    ...(typeof position.column === 'number' ? { column: position.column + 1 } : {}),
  };
}

/** AST全体を一度走査し、budget超過前にbounded node配列へ固定する。 */
function collectBoundedNodes(program: Node, file: string): readonly Node[] {
  const nodes: Node[] = [];
  fullAncestor(program, (node: Node, _state: unknown, ancestors: Node[]) => {
    nodes.push(node);
    const current = ast(node);
    if (nodes.length > MAX_AST_NODES) {
      throw new JavaScriptAnalysisIssue('system', 'AST node数が上限を超えました', file);
    }
    if (ancestors.length > MAX_AST_DEPTH + 1) {
      throw new JavaScriptAnalysisIssue('system', 'ASTの入れ子が深すぎます', file);
    }
    if (
      node.type === 'Literal' &&
      typeof current.value === 'string' &&
      new TextEncoder().encode(current.value).byteLength > MAX_STRING_LENGTH
    ) {
      throw new JavaScriptAnalysisIssue('system', '文字列が長すぎます', file);
    }
    if (node.type === 'TemplateElement') {
      const value = current.value;
      if (typeof value === 'object' && value !== null) {
        const raw = (value as Readonly<Record<string, unknown>>).raw;
        if (
          typeof raw === 'string' &&
          new TextEncoder().encode(raw).byteLength > MAX_STRING_LENGTH
        ) {
          throw new JavaScriptAnalysisIssue('system', 'Template文字列が長すぎます', file);
        }
      }
    }
    if (
      node.type === 'ArrayExpression' &&
      Array.isArray(current.elements) &&
      current.elements.length > MAX_ARRAY_ELEMENTS
    ) {
      throw new JavaScriptAnalysisIssue('system', '配列要素数が上限を超えました', file);
    }
  });
  return nodes;
}

/** Nodeのdirective文字列を返す。 */
function directive(node: Node): string | undefined {
  const value = ast(node).directive;
  return typeof value === 'string' ? value : undefined;
}

/** Block functionのdirective prologue直後へguard開始位置を決める。 */
function functionGuardPosition(body: AstNode): number {
  const statements = Array.isArray(body.body) ? body.body.filter(isNode) : [];
  let position = body.start + 1;
  for (const statement of statements) {
    if (directive(statement) === undefined) break;
    position = statement.end;
  }
  return position;
}

/** LoopとFunctionへ例外非依存のbudget guardを挿入する。 */
function instrument(source: string, nodes: readonly Node[], guardIdentifier: string): string {
  const magic = new MagicString(source);
  for (const node of nodes) {
    const current = ast(node);
    if (FUNCTION_TYPES.has(node.type) && isNode(current.body)) {
      const body = ast(current.body);
      if (body.type === 'BlockStatement') {
        magic.appendLeft(
          functionGuardPosition(body),
          `if (!${guardIdentifier}.enterFunction()) return;try{`,
        );
        magic.appendLeft(body.end - 1, `}finally{${guardIdentifier}.leaveFunction();}`);
      } else if (node.type === 'ArrowFunctionExpression') {
        magic.prependLeft(
          body.start,
          `{if (!${guardIdentifier}.enterFunction()) return;try{return (`,
        );
        magic.appendRight(body.end, `);}finally{${guardIdentifier}.leaveFunction();}}`);
      }
    }
    if (LOOP_TYPES.has(node.type) && isNode(current.body)) {
      const body = ast(current.body);
      if (body.type === 'BlockStatement') {
        magic.appendLeft(body.start + 1, `if (!${guardIdentifier}.checkLoop()) break;`);
      } else {
        magic.prependLeft(body.start, `{if (!${guardIdentifier}.checkLoop()) break;`);
        magic.appendRight(body.end, '}');
      }
    }
  }
  return magic.toString();
}

/** MemberExpressionの非computed Identifier property名を返す。 */
function memberProperty(node: AstNode): string | undefined {
  if (node.type !== 'MemberExpression' || node.computed !== false) return undefined;
  const property = node.property;
  if (typeof property !== 'object' || property === null) return undefined;
  const candidate = property as Readonly<Record<string, unknown>>;
  return candidate.type === 'Identifier' && typeof candidate.name === 'string'
    ? candidate.name
    : undefined;
}

/** Literalが文字列なら値を返す。 */
function stringLiteral(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const candidate = value as Readonly<Record<string, unknown>>;
  return candidate.type === 'Literal' && typeof candidate.value === 'string'
    ? candidate.value
    : undefined;
}

/** AST propertyがIdentifierなら名前を返す。 */
function identifierName(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const candidate = value as Readonly<Record<string, unknown>>;
  return candidate.type === 'Identifier' && typeof candidate.name === 'string'
    ? candidate.name
    : undefined;
}

/** Collection Factへ公開できる0〜64の整数へ件数を絞り込む。 */
function boundedCollectionCount(value: unknown): number | undefined {
  return Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= 64
    ? Number(value)
    : undefined;
}

/** inline callbackの公開可能なparameter数を返す。 */
function callbackParameterCount(value: unknown): number | undefined {
  if (!isNode(value)) return undefined;
  const current = ast(value);
  if (value.type !== 'FunctionExpression' && value.type !== 'ArrowFunctionExpression') {
    return undefined;
  }
  const count = Array.isArray(current.params) ? current.params.length : 0;
  return count <= 4 ? count : undefined;
}

/** 非負整数Literalのcomputed accessだけを教材用indexとして識別する。 */
function isTeachingIndex(value: unknown): boolean {
  if (!isNode(value) || value.type !== 'Literal') return false;
  const index = ast(value).value;
  return Number.isSafeInteger(index) && Number(index) >= 0;
}

/** named export宣言から公開Identifier名をSource順で抽出する。 */
function namedExportNames(node: AstNode): readonly string[] {
  if (node.type !== 'ExportNamedDeclaration') return [];
  if (isNode(node.declaration)) {
    const declaration = ast(node.declaration);
    if (
      node.declaration.type === 'VariableDeclaration' &&
      Array.isArray(declaration.declarations)
    ) {
      return declaration.declarations
        .filter(isNode)
        .flatMap((item) => patternIdentifiers(ast(item).id))
        .map(identifierName)
        .filter((name): name is string => name !== undefined);
    }
    const name = identifierName(declaration.id);
    return name === undefined ? [] : [name];
  }
  if (!Array.isArray(node.specifiers)) return [];
  return node.specifiers
    .filter(isNode)
    .map((specifier) => identifierName(ast(specifier).exported))
    .filter((name): name is string => name !== undefined);
}

interface ScopeInfo {
  readonly node: Node;
  readonly kind: 'program' | 'function' | 'block';
  readonly depth: number;
  readonly parent?: ScopeInfo;
  readonly bindings: Set<string>;
}

/** Factへ共通する1-based source位置を返す。 */
function factLocation(node: Node, file: string) {
  const position = node.loc?.start;
  return {
    file,
    line: position?.line ?? 1,
    column: position === undefined ? 1 : position.column + 1,
  } as const;
}

/** Factの公開文字列上限をAnalyzer側でもfail-closedに適用する。 */
function boundedFactText(value: string, file: string): string {
  if (value.length > 128) {
    throw new JavaScriptAnalysisIssue('system', 'Source fact文字列が上限を超えました', file);
  }
  return value;
}

/** 宣言patternに含まれるIdentifierを再帰的に列挙する。 */
function patternIdentifiers(value: unknown): readonly Node[] {
  if (!isNode(value)) return [];
  const current = ast(value);
  if (value.type === 'Identifier') return [value];
  if (value.type === 'RestElement') return patternIdentifiers(current.argument);
  if (value.type === 'AssignmentPattern') return patternIdentifiers(current.left);
  if (value.type === 'ArrayPattern') {
    return Array.isArray(current.elements)
      ? current.elements.flatMap((element) => patternIdentifiers(element))
      : [];
  }
  if (value.type === 'ObjectPattern') {
    if (!Array.isArray(current.properties)) return [];
    return current.properties.flatMap((property) => {
      if (!isNode(property)) return [];
      const candidate = ast(property);
      return property.type === 'Property'
        ? patternIdentifiers(candidate.value)
        : patternIdentifiers(candidate.argument);
    });
  }
  return [];
}

/** AST nodeが新しいlexical scopeを開始するかを返す。 */
function scopeKind(node: Node): ScopeInfo['kind'] | undefined {
  if (node.type === 'Program') return 'program';
  if (FUNCTION_TYPES.has(node.type)) return 'function';
  if (node.type === 'BlockStatement') return 'block';
  return undefined;
}

/** varだけを最寄りFunction／Program scopeへhoistする。 */
function declarationScope(scope: ScopeInfo, kind: 'const' | 'let' | 'var'): ScopeInfo {
  if (kind !== 'var') return scope;
  let current: ScopeInfo = scope;
  while (current.kind === 'block' && current.parent !== undefined) current = current.parent;
  return current;
}

/** Function本体の波括弧を重複Scopeとして数えず、教材上のlexical深さへ正規化する。 */
function teachingScopeDepth(scope: ScopeInfo): number {
  let depth = 0;
  let current = scope;
  while (current.parent !== undefined) {
    const parent: ScopeInfo = current.parent;
    const isFunctionBodyBlock =
      current.kind === 'block' &&
      parent.kind === 'function' &&
      ast(parent.node).body === current.node;
    if (!isFunctionBodyBlock) depth += 1;
    current = parent;
  }
  return depth;
}

/** 公開Factとして扱うprimitive literal型だけを返す。 */
function literalValueType(value: unknown): 'string' | 'number' | 'boolean' | undefined {
  if (typeof value === 'string') return 'string';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  return undefined;
}

/** AST operatorを教材で許可したbinary Factへ絞り込む。 */
function binaryFactOperator(value: unknown): JavaScriptBinaryOperator | undefined {
  return typeof value === 'string' && BINARY_FACT_OPERATORS.has(value as JavaScriptBinaryOperator)
    ? (value as JavaScriptBinaryOperator)
    : undefined;
}

/** AST operatorを教材で許可したassignment Factへ絞り込む。 */
function assignmentFactOperator(value: unknown): JavaScriptAssignmentOperator | undefined {
  return typeof value === 'string' &&
    ASSIGNMENT_FACT_OPERATORS.has(value as JavaScriptAssignmentOperator)
    ? (value as JavaScriptAssignmentOperator)
    : undefined;
}

/** staticなCall calleeを学習用の短い名前へ変換する。 */
function callName(value: unknown): string | undefined {
  if (!isNode(value)) return undefined;
  const current = ast(value);
  if (value.type === 'Identifier') {
    return typeof current.name === 'string' ? current.name : undefined;
  }
  if (value.type === 'ChainExpression') return callName(current.expression);
  if (value.type !== 'MemberExpression' || current.computed !== false) return undefined;
  const object = callName(current.object);
  const property = identifierName(current.property);
  return object === undefined || property === undefined ? undefined : `${object}.${property}`;
}

/** Identifierが参照位置でなく宣言key／label／static propertyかを判定する。 */
function isIdentifierReference(
  node: Node,
  parent: Node | undefined,
  declarationIdentifiers: ReadonlySet<Node>,
): boolean {
  if (declarationIdentifiers.has(node) || parent === undefined) return false;
  const owner = ast(parent);
  if (parent.type === 'MemberExpression' && owner.computed === false && owner.property === node) {
    return false;
  }
  if (
    parent.type === 'Property' &&
    owner.computed === false &&
    owner.key === node &&
    owner.value !== node
  ) {
    return false;
  }
  if (
    (parent.type === 'LabeledStatement' ||
      parent.type === 'BreakStatement' ||
      parent.type === 'ContinueStatement') &&
    owner.label === node
  ) {
    return false;
  }
  return !parent.type.startsWith('Import');
}

/** 現在scopeからIdentifier宣言scopeをlexicalに解決する。 */
function resolveBinding(scope: ScopeInfo | undefined, name: string): ScopeInfo | undefined {
  let current = scope;
  while (current !== undefined) {
    if (current.bindings.has(name)) return current;
    current = current.parent;
  }
  return undefined;
}

/** binding scopeが現在Functionの内側ならlocal、外側ならclosureと判定する。 */
function bindingBelongsToFunction(binding: ScopeInfo, functionScope: ScopeInfo): boolean {
  let current: ScopeInfo | undefined = binding;
  while (current !== undefined) {
    if (current === functionScope) return true;
    current = current.parent;
  }
  return false;
}

/** ValidatorがChapter 00〜06のsource構造を検証するbounded factを抽出する。 */
function collectFacts(
  program: Node,
  nodes: readonly Node[],
  file: string,
): readonly JavaScriptSourceFact[] {
  const facts: JavaScriptSourceFact[] = [];
  const scopesByNode = new Map<Node, ScopeInfo>();
  const scopeByNode = new Map<Node, ScopeInfo>();
  const parentByNode = new Map<Node, Node | undefined>();
  const declarationKindByNode = new Map<Node, 'const' | 'let' | 'var'>();
  const declarationIdentifiers = new Set<Node>();

  const addFact = (fact: JavaScriptSourceFact): void => {
    facts.push(fact);
    if (facts.length > MAX_FACTS) {
      throw new JavaScriptAnalysisIssue('system', 'Source fact数が上限を超えました', file);
    }
  };

  fullAncestor(program, (node: Node, _state: unknown, ancestors: Node[]) => {
    let activeScope: ScopeInfo | undefined;
    for (const ancestor of ancestors) {
      const kind = scopeKind(ancestor);
      if (kind === undefined) continue;
      let scope = scopesByNode.get(ancestor);
      if (scope === undefined) {
        scope = {
          node: ancestor,
          kind,
          depth: activeScope === undefined ? 0 : activeScope.depth + 1,
          ...(activeScope === undefined ? {} : { parent: activeScope }),
          bindings: new Set<string>(),
        };
        scopesByNode.set(ancestor, scope);
      }
      activeScope = scope;
    }
    if (activeScope !== undefined) scopeByNode.set(node, activeScope);
    const current = ast(node);
    const parent = ancestors.at(-2);
    parentByNode.set(node, parent);

    if (node.type === 'VariableDeclarator' && parent?.type === 'VariableDeclaration') {
      const declarationKind = ast(parent).kind;
      if (
        (declarationKind === 'const' || declarationKind === 'let' || declarationKind === 'var') &&
        activeScope !== undefined
      ) {
        declarationKindByNode.set(node, declarationKind);
        for (const identifier of patternIdentifiers(current.id)) {
          declarationIdentifiers.add(identifier);
          const name = identifierName(identifier);
          if (name !== undefined) declarationScope(activeScope, declarationKind).bindings.add(name);
        }
      }
    }

    if (FUNCTION_TYPES.has(node.type)) {
      const functionScope = scopesByNode.get(node);
      if (functionScope !== undefined && Array.isArray(current.params)) {
        for (const parameter of current.params) {
          for (const identifier of patternIdentifiers(parameter)) {
            declarationIdentifiers.add(identifier);
            const name = identifierName(identifier);
            if (name !== undefined) functionScope.bindings.add(name);
          }
        }
      }
      if (isNode(current.id)) {
        declarationIdentifiers.add(current.id);
        const name = identifierName(current.id);
        const owner = node.type === 'FunctionDeclaration' ? functionScope?.parent : functionScope;
        if (name !== undefined) owner?.bindings.add(name);
      }
    }

    if (node.type.startsWith('Import') && isNode(current.local) && activeScope !== undefined) {
      declarationIdentifiers.add(current.local);
      const name = identifierName(current.local);
      if (name !== undefined) activeScope.bindings.add(name);
    }
  });

  const sortedNodes = [...nodes].sort(
    (left, right) => left.start - right.start || left.end - right.end,
  );
  const closureKeys = new Set<string>();
  for (const node of sortedNodes) {
    const current = ast(node);
    const location = factLocation(node, file);
    const scope = scopesByNode.get(node);
    if (scope !== undefined) {
      addFact({ kind: 'scope', scopeKind: scope.kind, depth: scope.depth, ...location });
    }

    if (node.type === 'VariableDeclarator') {
      const declarationKind = declarationKindByNode.get(node);
      if (declarationKind === 'const' || declarationKind === 'let' || declarationKind === 'var') {
        const activeScope = scopeByNode.get(node);
        const bindingScope =
          activeScope === undefined ? undefined : declarationScope(activeScope, declarationKind);
        for (const identifier of patternIdentifiers(current.id)) {
          const name = identifierName(identifier);
          if (name !== undefined) {
            addFact({
              kind: 'binding',
              name: boundedFactText(name, file),
              declarationKind,
              scopeDepth: bindingScope === undefined ? 0 : teachingScopeDepth(bindingScope),
              ...factLocation(identifier, file),
            });
          }
        }
      }

      if (isNode(current.id)) {
        const bindingCount = boundedCollectionCount(patternIdentifiers(current.id).length);
        if (
          bindingCount !== undefined &&
          (current.id.type === 'ArrayPattern' || current.id.type === 'ObjectPattern')
        ) {
          addFact({
            kind: 'destructuring',
            patternKind: current.id.type === 'ArrayPattern' ? 'array' : 'object',
            bindingCount,
            ...factLocation(current.id, file),
          });
        }
      }

      if (isNode(current.init) && current.init.type === 'CallExpression') {
        const init = ast(current.init);
        if (isNode(init.callee) && memberProperty(ast(init.callee)) === 'map') {
          addFact({ kind: 'immutable-update', updateKind: 'array-map', ...location });
        }
      }
    }

    if (node.type === 'ArrayExpression' || node.type === 'ObjectExpression') {
      const entries = node.type === 'ArrayExpression' ? current.elements : current.properties;
      const entryCount = Array.isArray(entries)
        ? boundedCollectionCount(entries.length)
        : undefined;
      if (entryCount !== undefined) {
        addFact({
          kind: 'collection',
          collectionKind: node.type === 'ArrayExpression' ? 'array' : 'object',
          entryCount,
          ...location,
        });
      }
      if (
        Array.isArray(entries) &&
        entries.some((entry) => isNode(entry) && entry.type === 'SpreadElement')
      ) {
        addFact({
          kind: 'immutable-update',
          updateKind: node.type === 'ArrayExpression' ? 'array-spread' : 'object-spread',
          ...location,
        });
      }
    }

    if (node.type === 'MemberExpression') {
      const parent = parentByNode.get(node);
      const isCalledMember = parent?.type === 'CallExpression' && ast(parent).callee === node;
      if (current.computed === true && isTeachingIndex(current.property)) {
        addFact({ kind: 'collection-access', accessKind: 'index', ...location });
      } else if (!isCalledMember && memberProperty(current) !== undefined) {
        addFact({ kind: 'collection-access', accessKind: 'property', ...location });
      }
    }

    if (node.type === 'Literal') {
      const valueType = literalValueType(current.value);
      if (valueType !== undefined) addFact({ kind: 'literal', valueType, ...location });
    }

    if (node.type === 'BinaryExpression' || node.type === 'LogicalExpression') {
      const operator = binaryFactOperator(current.operator);
      if (operator !== undefined) addFact({ kind: 'binary-expression', operator, ...location });
    }

    if (node.type === 'AssignmentExpression') {
      const name = identifierName(current.left);
      const operator = assignmentFactOperator(current.operator);
      if (name !== undefined && operator !== undefined) {
        addFact({
          kind: 'assignment',
          name: boundedFactText(name, file),
          operator,
          ...location,
        });
      }
    }

    if (node.type === 'UpdateExpression') {
      const name = identifierName(current.argument);
      const operator = assignmentFactOperator(current.operator);
      if (name !== undefined && operator !== undefined) {
        addFact({
          kind: 'assignment',
          name: boundedFactText(name, file),
          operator,
          ...location,
        });
      }
    }

    if (node.type === 'IfStatement' || node.type === 'SwitchStatement') {
      addFact({
        kind: 'branch',
        branchKind: node.type === 'IfStatement' ? 'if' : 'switch',
        hasAlternate: node.type === 'IfStatement' && isNode(current.alternate),
        ...location,
      });
    }
    const loopKind =
      node.type === 'ForStatement'
        ? 'for'
        : node.type === 'ForOfStatement'
          ? 'for-of'
          : node.type === 'ForInStatement'
            ? 'for-in'
            : node.type === 'WhileStatement'
              ? 'while'
              : node.type === 'DoWhileStatement'
                ? 'do-while'
                : undefined;
    if (loopKind !== undefined) addFact({ kind: 'loop', loopKind, ...location });

    if (FUNCTION_TYPES.has(node.type)) {
      const parameterCount = Array.isArray(current.params) ? current.params.length : 0;
      if (parameterCount > 32) {
        throw new JavaScriptAnalysisIssue('system', 'Function parameter数が上限を超えました', file);
      }
      addFact({
        kind: 'function',
        functionKind:
          node.type === 'FunctionDeclaration'
            ? 'declaration'
            : node.type === 'FunctionExpression'
              ? 'expression'
              : 'arrow',
        parameterCount,
        ...location,
      });
    }

    if (node.type === 'CallExpression') {
      const callee = callName(current.callee);
      if (callee !== undefined) {
        addFact({ kind: 'call', callee: boundedFactText(callee, file), ...location });
      }
      if (isNode(current.callee)) {
        const method = memberProperty(ast(current.callee));
        if (method === 'at') {
          addFact({ kind: 'collection-access', accessKind: 'at', ...location });
        }
        if (COLLECTION_TRANSFORM_METHODS.has(method as JavaScriptCollectionTransformMethod)) {
          const args = Array.isArray(current.arguments) ? current.arguments : [];
          const parameterCount = callbackParameterCount(args[0]);
          if (parameterCount !== undefined) {
            addFact({
              kind: 'collection-transform',
              method: method as JavaScriptCollectionTransformMethod,
              callbackParameterCount: parameterCount,
              ...location,
            });
          }
        }
      }
    }

    if (node.type === 'ReturnStatement') addFact({ kind: 'return', ...location });

    if (node.type === 'ImportSpecifier') {
      const name = identifierName(current.imported);
      if (name !== undefined) {
        addFact({
          kind: 'module-boundary',
          boundaryKind: 'import',
          name: boundedFactText(name, file),
          ...location,
        });
      }
    }

    if (node.type === 'ExportNamedDeclaration') {
      for (const name of namedExportNames(current)) {
        addFact({
          kind: 'module-boundary',
          boundaryKind: 'export',
          name: boundedFactText(name, file),
          ...location,
        });
      }
    }

    if (node.type === 'ThrowStatement') {
      addFact({ kind: 'error-flow', flowKind: 'throw', ...location });
    }
    if (node.type === 'CatchClause') {
      addFact({ kind: 'error-flow', flowKind: 'catch', ...location });
    }

    if (node.type === 'AssignmentExpression') {
      const assignment = current;
      if (assignment.operator === '=' && isNode(assignment.left)) {
        const left = ast(assignment.left);
        if (memberProperty(left) === 'textContent' && isNode(left.object)) {
          const call = ast(left.object);
          if (call.type === 'CallExpression' && isNode(call.callee)) {
            const callee = ast(call.callee);
            const root = isNode(callee.object) ? ast(callee.object) : undefined;
            if (
              callee.type === 'MemberExpression' &&
              memberProperty(callee) === 'querySelector' &&
              root?.type === 'Identifier' &&
              root.name === 'document'
            ) {
              const args = Array.isArray(call.arguments) ? call.arguments : [];
              const selector = stringLiteral(args[0]);
              const value = stringLiteral(assignment.right);
              if (selector !== undefined && value !== undefined) {
                addFact({
                  kind: 'query-selector-text-content-assignment',
                  selector: boundedFactText(selector, file),
                  value: boundedFactText(value, file),
                  ...location,
                });
              }
            }
          }
        }
      }
    }

    if (node.type === 'Identifier') {
      const parent = parentByNode.get(node);
      if (!isIdentifierReference(node, parent, declarationIdentifiers)) continue;
      const name = identifierName(node);
      const activeScope = scopeByNode.get(node);
      if (name === undefined || activeScope === undefined) continue;
      let functionScope: ScopeInfo | undefined = activeScope;
      while (functionScope !== undefined && functionScope.kind !== 'function') {
        functionScope = functionScope.parent;
      }
      const bindingScope = resolveBinding(activeScope, name);
      if (
        functionScope === undefined ||
        bindingScope === undefined ||
        bindingBelongsToFunction(bindingScope, functionScope)
      ) {
        continue;
      }
      const key = `${String(functionScope.node.start)}:${name}`;
      if (closureKeys.has(key)) continue;
      closureKeys.add(key);
      addFact({
        kind: 'closure',
        capturedName: boundedFactText(name, file),
        ...location,
      });
    }
  }
  return Object.freeze(facts);
}

/** UTF-8 sourceのSHA-256をlowercase hexで返す。 */
async function sha256(source: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Sourceを解析・制限・instrumentし、失敗を診断へ変換する。 */
async function analyzeLegacyJavaScriptSource(
  request: JavaScriptLegacyAnalysisRequest,
): Promise<JavaScriptLegacyAnalysisResult> {
  if (!/^[$A-Z_a-z][$\w]*$/u.test(request.guardIdentifier)) {
    return failure(request, 'system', 'Invalid guard identifier', '実行の準備に失敗しました。');
  }
  if (new TextEncoder().encode(request.source).byteLength > MAX_SOURCE_BYTES) {
    return failure(
      request,
      'system',
      'JavaScript source exceeds 100 KiB',
      'script.jsが大きすぎます。100 KiB以内にしてください。',
    );
  }

  let program: Node;
  try {
    program = parse(request.source, {
      ecmaVersion: 'latest',
      sourceType: request.sourceType,
      locations: true,
    });
  } catch (error: unknown) {
    const position = syntaxPosition(error);
    return failure(
      request,
      'syntax',
      error instanceof Error ? error.message : String(error),
      'JavaScriptの書き方を確認してください。括弧や引用符が閉じているか見直しましょう。',
      position.line,
      position.column,
    );
  }

  try {
    const nodes = collectBoundedNodes(program, request.file);
    if (
      nodes.some((node) => node.type === 'Identifier' && ast(node).name === request.guardIdentifier)
    ) {
      throw new JavaScriptAnalysisIssue(
        'system',
        '生成したbudget guard名が学習Sourceと衝突しました',
        request.file,
      );
    }
    assertJavaScriptCapabilityPolicy(program, request.file, request.capabilityProfile);
    const facts = collectFacts(program, nodes, request.file);
    return {
      status: 'success',
      requestId: request.requestId,
      exerciseSessionId: request.exerciseSessionId,
      executionRevision: request.executionRevision,
      file: request.file,
      instrumentedCode: instrument(request.source, nodes, request.guardIdentifier),
      sourceSha256: await sha256(request.source),
      facts,
      diagnostics: [],
    };
  } catch (error: unknown) {
    if (error instanceof JavaScriptAnalysisIssue) {
      return failure(
        request,
        error.kind,
        error.message,
        error.kind === 'security'
          ? `${error.message} 学習用Previewで安全に使える書き方へ直してください。`
          : 'コードが大きすぎるか複雑すぎます。処理を小さく分けてください。',
        error.line,
        error.column,
      );
    }
    return failure(
      request,
      'system',
      error instanceof Error ? error.message : String(error),
      'JavaScriptの解析に失敗しました。少し待ってからもう一度試してください。',
    );
  }
}

/** 到達可能moduleのSource bytesをpath昇順で固定して決定的hashを作る。 */
async function moduleGraphSha256(
  modules: readonly { readonly file: string; readonly source: string }[],
): Promise<string> {
  const canonical = JSON.stringify(
    [...modules]
      .sort((left, right) => (left.file < right.file ? -1 : left.file > right.file ? 1 : 0))
      .map(({ file, source }) => ({ path: file, source })),
  );
  return sha256(canonical);
}

/** Workspace内の到達可能moduleを全件解析し同じgraph identityへ結ぶ。 */
async function analyzeJavaScriptWorkspace(
  request: JavaScriptWorkspaceAnalysisRequest,
): Promise<JavaScriptAnalysisResult> {
  if (request.sourceType !== 'module') {
    return failure(
      request,
      'security',
      'Workspace analysis requires module sourceType',
      'Module Workspaceの実行形式が不正です。教材を再読み込みしてください。',
    );
  }
  if (!/^[$A-Z_a-z][$\w]*$/u.test(request.guardIdentifier)) {
    return failure(request, 'system', 'Invalid guard identifier', '実行の準備に失敗しました。');
  }
  let graph;
  try {
    graph = buildModuleGraph({ entryFile: request.entryFile, files: request.files });
  } catch (error: unknown) {
    const candidate =
      typeof error === 'object' && error !== null
        ? (error as Readonly<Record<string, unknown>>)
        : undefined;
    const file = typeof candidate?.file === 'string' ? candidate.file : request.entryFile;
    const line = typeof candidate?.line === 'number' ? candidate.line : undefined;
    const column = typeof candidate?.column === 'number' ? candidate.column : undefined;
    const kind = error instanceof JavaScriptModuleGraphError ? error.kind : 'system';
    const result = failure(
      request,
      kind,
      error instanceof Error ? error.message : String(error),
      kind === 'syntax'
        ? 'JavaScriptの書き方を確認してください。括弧や引用符が閉じているか見直しましょう。'
        : kind === 'security'
          ? `${error instanceof Error ? error.message : String(error)} Workspace内の相対importへ直してください。`
          : 'Module構成が大きすぎるか複雑すぎます。処理を小さく分けてください。',
      line,
      column,
    );
    return {
      ...result,
      diagnostics: result.diagnostics.map((diagnostic) => ({ ...diagnostic, file })),
    };
  }

  const modules: JavaScriptWorkspaceAnalysisSuccess['modules'][number][] = [];
  const facts: JavaScriptSourceFact[] = [];
  for (const module of graph.modules) {
    const analysis = await analyzeLegacyJavaScriptSource({
      requestId: request.requestId,
      exerciseSessionId: request.exerciseSessionId,
      executionRevision: request.executionRevision,
      file: module.file,
      source: module.source,
      sourceType: 'module',
      capabilityProfile: request.capabilityProfile,
      guardIdentifier: request.guardIdentifier,
    });
    if (analysis.status === 'failure') {
      return { ...analysis, file: request.entryFile };
    }
    if (!('instrumentedCode' in analysis)) {
      return failure(
        request,
        'system',
        'Nested Workspace analysis result is invalid',
        'JavaScriptの解析に失敗しました。少し待ってからもう一度試してください。',
      );
    }
    facts.push(...analysis.facts);
    if (facts.length > MAX_FACTS) {
      return failure(
        request,
        'system',
        'Workspace source fact count exceeds limit',
        'コード全体が複雑すぎます。処理を小さく分けてください。',
      );
    }
    modules.push({
      file: module.file,
      instrumentedCode: analysis.instrumentedCode,
      dependencies: module.dependencies,
    });
  }
  return {
    status: 'success',
    requestId: request.requestId,
    exerciseSessionId: request.exerciseSessionId,
    executionRevision: request.executionRevision,
    file: request.entryFile,
    entryFile: request.entryFile,
    graphSha256: await moduleGraphSha256(graph.modules),
    modules,
    facts,
    diagnostics: [],
  };
}

/** classic 1 FileとWorkspace module graphを同じWorker entryで解析する。 */
export async function analyzeJavaScriptSource(
  request: JavaScriptLegacyAnalysisRequest,
): Promise<JavaScriptLegacyAnalysisResult>;
export async function analyzeJavaScriptSource(
  request: JavaScriptWorkspaceAnalysisRequest,
): Promise<JavaScriptWorkspaceAnalysisResult>;
export async function analyzeJavaScriptSource(
  request: JavaScriptAnalysisRequest,
): Promise<JavaScriptAnalysisResult>;
export async function analyzeJavaScriptSource(
  request: JavaScriptAnalysisRequest,
): Promise<JavaScriptAnalysisResult> {
  return 'files' in request
    ? analyzeJavaScriptWorkspace(request)
    : analyzeLegacyJavaScriptSource(request);
}
