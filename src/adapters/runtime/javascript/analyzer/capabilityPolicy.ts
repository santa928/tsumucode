import type { Node } from 'acorn';
import { fullAncestor } from 'acorn-walk';
import type { RunnerDiagnosticKind } from '../../../../core/runtime/contracts';

type AnalysisIssueKind = Extract<RunnerDiagnosticKind, 'security' | 'system'>;
type AstNode = Node & Readonly<Record<string, unknown>>;

const NETWORK_IDENTIFIERS = new Set([
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'EventSource',
  'sendBeacon',
]);
const WORKER_IDENTIFIERS = new Set(['Worker', 'SharedWorker']);
const STORAGE_IDENTIFIERS = new Set(['localStorage', 'sessionStorage', 'indexedDB', 'caches']);
const DYNAMIC_CODE_IDENTIFIERS = new Set(['eval', 'Function', 'WebAssembly']);
const RESOURCE_IDENTIFIERS = new Set(['Image', 'Audio']);
const NAVIGATION_IDENTIFIERS = new Set([
  'window',
  'globalThis',
  'parent',
  'top',
  'opener',
  'location',
  'history',
  'self',
  'frames',
]);
const DOCUMENT_MEMBERS = new Set(['querySelector', 'querySelectorAll', 'getElementById']);
const NAVIGATION_MEMBERS = new Set(['location', 'history', 'pushState', 'replaceState', 'assign']);
const RESOURCE_MEMBERS = new Set(['src', 'href', 'action', 'formAction']);
const RUNTIME_ESCAPE_MEMBERS = new Set([
  '__proto__',
  'contentDocument',
  'contentWindow',
  'currentTarget',
  'defaultView',
  'ownerDocument',
  'opener',
  'parent',
  'postMessage',
  'prototype',
  'top',
  'view',
]);
const HTML_INSERTION_MEMBERS = new Set(['innerHTML', 'outerHTML', 'insertAdjacentHTML']);
const ALLOWED_NODE_TYPES = new Set([
  'Program',
  'ExpressionStatement',
  'BlockStatement',
  'EmptyStatement',
  'DebuggerStatement',
  'WithStatement',
  'ReturnStatement',
  'LabeledStatement',
  'BreakStatement',
  'ContinueStatement',
  'IfStatement',
  'SwitchStatement',
  'SwitchCase',
  'ThrowStatement',
  'TryStatement',
  'CatchClause',
  'WhileStatement',
  'DoWhileStatement',
  'ForStatement',
  'ForInStatement',
  'ForOfStatement',
  'FunctionDeclaration',
  'VariableDeclaration',
  'VariableDeclarator',
  'ThisExpression',
  'ArrayExpression',
  'ObjectExpression',
  'FunctionExpression',
  'ArrowFunctionExpression',
  'SequenceExpression',
  'UnaryExpression',
  'UpdateExpression',
  'BinaryExpression',
  'AssignmentExpression',
  'LogicalExpression',
  'ConditionalExpression',
  'CallExpression',
  'MemberExpression',
  'ChainExpression',
  'Identifier',
  'Literal',
  'TemplateLiteral',
  'TemplateElement',
  'TaggedTemplateExpression',
  'ObjectPattern',
  'ArrayPattern',
  'RestElement',
  'AssignmentPattern',
  'Property',
  'AwaitExpression',
  'YieldExpression',
  'SpreadElement',
]);

/** Source位置と診断種別を失わずAnalyzer内で伝播するError。 */
export class JavaScriptAnalysisIssue extends Error {
  constructor(
    readonly kind: AnalysisIssueKind,
    message: string,
    readonly file: string,
    readonly line?: number,
    readonly column?: number,
  ) {
    super(message);
    this.name = 'JavaScriptAnalysisIssue';
  }
}

/** Acorn Nodeを追加propertyへ安全にアクセスできるRecordとして扱う。 */
function ast(node: Node): AstNode {
  return node as AstNode;
}

/** unknown値がAcorn Nodeかを最小propertyで確認する。 */
function isNode(value: unknown): value is Node {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Readonly<Record<string, unknown>>;
  return typeof candidate.type === 'string';
}

/** AST propertyがIdentifierなら名前を返す。 */
function identifierName(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const candidate = value as Readonly<Record<string, unknown>>;
  return candidate.type === 'Identifier' && typeof candidate.name === 'string'
    ? candidate.name
    : undefined;
}

/** Nodeの1-based位置でsecurity issueを投げる。 */
function reject(node: Node, file: string, message: string): never {
  const position = node.loc?.start;
  throw new JavaScriptAnalysisIssue(
    'security',
    message,
    file,
    position?.line,
    position === undefined ? undefined : position.column + 1,
  );
}

/** IdentifierがMemberExpressionの非computed property位置か確認する。 */
function isStaticMemberProperty(node: Node, parent: Node | undefined): boolean {
  if (parent === undefined || parent.type !== 'MemberExpression') return false;
  const member = ast(parent);
  return member.computed === false && member.property === node;
}

/** document／navigatorの直接参照か、許可済みMember objectかを区別する。 */
function isMemberObject(node: Node, parent: Node | undefined): boolean {
  return parent?.type === 'MemberExpression' && ast(parent).object === node;
}

/** 文字列timerの第一引数かを検出する。 */
function isStaticString(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const node = value as Readonly<Record<string, unknown>>;
  if (node.type === 'Literal') return typeof node.value === 'string';
  return (
    node.type === 'TemplateLiteral' &&
    Array.isArray(node.expressions) &&
    node.expressions.length === 0
  );
}

/** Literalまたは非computed IdentifierからMember名を得る。 */
function memberName(node: AstNode): string | undefined {
  if (node.type !== 'MemberExpression') return undefined;
  if (node.computed === false) return identifierName(node.property);
  if (typeof node.property !== 'object' || node.property === null) return undefined;
  const property = node.property as Readonly<Record<string, unknown>>;
  return property.type === 'Literal' && typeof property.value === 'string'
    ? property.value
    : undefined;
}

/** Call引数のLiteral文字列を返す。 */
function literalString(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const node = value as Readonly<Record<string, unknown>>;
  return node.type === 'Literal' && typeof node.value === 'string' ? node.value : undefined;
}

/** JavaScript ASTがChapter 00の明示Capabilityだけを使うことをfail-closedで確認する。 */
export function assertJavaScriptCapabilityPolicy(program: Node, file: string): void {
  fullAncestor(program, (node: Node, _state: unknown, ancestors: Node[]) => {
    const current = ast(node);
    const parent = ancestors.at(-2);

    if (node.type === 'ImportExpression') reject(node, file, '動的importはこの演習では使えません');
    if (!ALLOWED_NODE_TYPES.has(node.type)) {
      reject(node, file, `この構文（${node.type}）はまだこの演習では使えません`);
    }
    if (node.type === 'DebuggerStatement' || node.type === 'WithStatement') {
      reject(node, file, `この構文（${node.type}）は安全なPreviewでは使えません`);
    }
    if (node.type === 'Literal' && typeof current.regex === 'object' && current.regex !== null) {
      reject(node, file, '正規表現はこの演習では使えません');
    }

    if (node.type === 'Identifier') {
      const name = identifierName(node);
      if (name === undefined || isStaticMemberProperty(node, parent)) return;
      if (NETWORK_IDENTIFIERS.has(name)) reject(node, file, '外部通信を行う機能は使えません');
      if (WORKER_IDENTIFIERS.has(name)) reject(node, file, 'Workerを作る機能は使えません');
      if (STORAGE_IDENTIFIERS.has(name)) reject(node, file, 'Storageへ触れる機能は使えません');
      if (DYNAMIC_CODE_IDENTIFIERS.has(name)) reject(node, file, '許可されていない動的実行です');
      if (RESOURCE_IDENTIFIERS.has(name)) reject(node, file, '外部resourceを作る機能は使えません');
      if (NAVIGATION_IDENTIFIERS.has(name))
        reject(node, file, '画面遷移や親画面へ触れる機能は使えません');
      if (name === 'open') reject(node, file, 'popupを開く機能は使えません');
      if ((name === 'document' || name === 'navigator') && !isMemberObject(node, parent)) {
        reject(node, file, `${name}は許可されたmemberからだけ使えます`);
      }
    }

    if (node.type === 'MemberExpression') {
      const root = identifierName(current.object);
      const property = memberName(current);
      if ((root === 'document' || root === 'navigator') && current.computed === true) {
        reject(node, file, `${root}のcomputed property accessは使えません`);
      }
      if (root === 'document') {
        if (property === 'cookie')
          reject(node, file, 'document.cookieは許可されていないmemberです');
        if (property === undefined || !DOCUMENT_MEMBERS.has(property)) {
          reject(node, file, `document.${property ?? 'unknown'}は許可されていないmemberです`);
        }
      }
      if (root === 'navigator') {
        if (property === 'sendBeacon') reject(node, file, '外部通信を行う機能は使えません');
        if (property === 'serviceWorker') reject(node, file, 'Service Workerは使えません');
        reject(node, file, `navigator.${property ?? 'unknown'}は許可されていません`);
      }
      if (property !== undefined && NETWORK_IDENTIFIERS.has(property)) {
        reject(node, file, '外部通信を行う機能は使えません');
      }
      if (property === 'constructor') {
        reject(node, file, 'constructorを使った動的実行は使えません');
      }
      if (property !== undefined && RUNTIME_ESCAPE_MEMBERS.has(property)) {
        reject(node, file, '実行環境へ戻るmemberは使えません');
      }
      if (property !== undefined && HTML_INSERTION_MEMBERS.has(property)) {
        reject(node, file, '文字列によるHTML挿入は使えません');
      }
      if (property === 'serviceWorker') reject(node, file, 'Service Workerは使えません');
      if (property !== undefined && NAVIGATION_MEMBERS.has(property)) {
        reject(node, file, '画面遷移を行うmemberは使えません');
      }
      if (property !== undefined && RESOURCE_MEMBERS.has(property)) {
        reject(node, file, '外部resourceへつながるURL memberは使えません');
      }
      if (property === 'submit' || property === 'requestSubmit') {
        reject(node, file, 'form送信は使えません');
      }
      if (property === 'download') reject(node, file, 'downloadは使えません');
    }

    if (node.type === 'CallExpression') {
      const calleeName = identifierName(current.callee);
      const args = Array.isArray(current.arguments) ? current.arguments : [];
      if (
        (calleeName === 'setTimeout' || calleeName === 'setInterval') &&
        isStaticString(args[0])
      ) {
        reject(node, file, '文字列timerは使えません。Functionを渡してください');
      }
      if (isNode(current.callee)) {
        const callee = ast(current.callee);
        const property = memberName(callee);
        const attribute = literalString(args[0]);
        if (
          (property === 'setAttribute' || property === 'setAttributeNS') &&
          attribute !== undefined &&
          RESOURCE_MEMBERS.has(attribute)
        ) {
          reject(node, file, '外部resourceへつながる属性の変更は使えません');
        }
        if (property === 'setAttribute' || property === 'setAttributeNS') {
          reject(node, file, '動的な属性変更はこの演習では使えません');
        }
      }
    }
  });
}
