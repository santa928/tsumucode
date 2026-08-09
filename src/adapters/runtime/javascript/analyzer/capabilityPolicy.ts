import type { Node } from 'acorn';
import { fullAncestor } from 'acorn-walk';
import type { RunnerDiagnosticKind } from '../../../../core/runtime/contracts';
import type { JavaScriptCapabilityProfileId } from './contracts';

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
const ASYNC_IDENTIFIERS = new Set([
  'Promise',
  'clearInterval',
  'clearTimeout',
  'setInterval',
  'setTimeout',
]);
const TIMER_IDENTIFIERS = new Set(['setInterval', 'setTimeout']);
const UNSUPPORTED_ASYNC_IDENTIFIERS = new Set([
  'BroadcastChannel',
  'IntersectionObserver',
  'MessageChannel',
  'MutationObserver',
  'PerformanceObserver',
  'ResizeObserver',
  'cancelAnimationFrame',
  'cancelIdleCallback',
  'queueMicrotask',
  'requestAnimationFrame',
  'requestIdleCallback',
  'scheduler',
]);
const UNSUPPORTED_ASYNC_MEMBERS = new Set(['postTask']);
const GLOBAL_EVENT_IDENTIFIERS = new Set([
  'addEventListener',
  'dispatchEvent',
  'postMessage',
  'removeEventListener',
]);
const DYNAMIC_CODE_IDENTIFIERS = new Set([
  'Blob',
  'eval',
  'Function',
  'Reflect',
  'URL',
  'WebAssembly',
]);
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
const CORE_DOCUMENT_MEMBERS = new Set(['querySelector']);
const DOM_DOCUMENT_MEMBERS = new Set([
  'createElement',
  'createTextNode',
  'getElementById',
  'querySelector',
  'querySelectorAll',
]);
const DOM_ONLY_MEMBERS = new Set([
  'addEventListener',
  'append',
  'appendChild',
  'classList',
  'prepend',
  'remove',
  'removeAttribute',
  'removeChild',
  'removeEventListener',
  'replaceChildren',
  'setAttribute',
  'setAttributeNS',
  'toggleAttribute',
]);
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
  'parentWindow',
  'postMessage',
  'prototype',
  'top',
  'view',
]);
const HTML_INSERTION_MEMBERS = new Set(['innerHTML', 'outerHTML', 'insertAdjacentHTML']);
const SAFE_DOM_ATTRIBUTE =
  /^(?:aria-[a-z0-9-]+|class|data-[a-z0-9-]+|disabled|hidden|id|role|tabindex|title)$/u;
const SAFE_DOM_ELEMENT_TAGS = new Set([
  'a',
  'article',
  'aside',
  'b',
  'blockquote',
  'br',
  'button',
  'code',
  'dd',
  'details',
  'div',
  'dl',
  'dt',
  'em',
  'fieldset',
  'figcaption',
  'figure',
  'footer',
  'form',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'hr',
  'i',
  'input',
  'label',
  'legend',
  'li',
  'main',
  'nav',
  'ol',
  'option',
  'p',
  'pre',
  'section',
  'select',
  'small',
  'span',
  'strong',
  'summary',
  'table',
  'tbody',
  'td',
  'textarea',
  'tfoot',
  'th',
  'thead',
  'tr',
  'ul',
]);
const BOOTSTRAP_SECRET_MEMBERS = new Set(['nonce']);
const EVENT_HANDLER_MEMBERS = new Set([
  'onanimationcancel',
  'onanimationend',
  'onanimationiteration',
  'onanimationstart',
  'onbeforeinput',
  'onblur',
  'onchange',
  'onclick',
  'oncompositionend',
  'oncompositionstart',
  'oncompositionupdate',
  'oncontextmenu',
  'ondblclick',
  'ondrag',
  'ondragend',
  'ondragenter',
  'ondragleave',
  'ondragover',
  'ondragstart',
  'ondrop',
  'onerror',
  'onfocus',
  'oninput',
  'oninvalid',
  'onkeydown',
  'onkeypress',
  'onkeyup',
  'onload',
  'onmousedown',
  'onmouseenter',
  'onmouseleave',
  'onmousemove',
  'onmouseout',
  'onmouseover',
  'onmouseup',
  'onpointercancel',
  'onpointerdown',
  'onpointerenter',
  'onpointerleave',
  'onpointermove',
  'onpointerout',
  'onpointerover',
  'onpointerup',
  'onreset',
  'onscroll',
  'onsubmit',
  'ontouchcancel',
  'ontouchend',
  'ontouchmove',
  'ontouchstart',
  'ontransitioncancel',
  'ontransitionend',
  'ontransitionrun',
  'ontransitionstart',
  'onwheel',
]);
const SAFE_OBJECT_STATIC_MEMBERS = new Set(['entries', 'fromEntries', 'is', 'keys', 'values']);
const REFLECTION_MEMBERS = new Set([
  '__defineGetter__',
  '__defineSetter__',
  '__lookupGetter__',
  '__lookupSetter__',
  'assign',
  'create',
  'defineProperties',
  'defineProperty',
  'getOwnPropertyDescriptor',
  'getOwnPropertyDescriptors',
  'getOwnPropertyNames',
  'getOwnPropertySymbols',
  'getPrototypeOf',
  'preventExtensions',
  'setPrototypeOf',
]);
const DYNAMIC_CODE_MEMBERS = new Set([
  'Blob',
  'Function',
  'Reflect',
  'URL',
  'WebAssembly',
  'construct',
  'createObjectURL',
  'eval',
]);
const MODULE_NODE_TYPES = new Set([
  'ExportAllDeclaration',
  'ExportDefaultDeclaration',
  'ExportNamedDeclaration',
  'ImportDeclaration',
  'ImportDefaultSpecifier',
  'ImportNamespaceSpecifier',
  'ImportSpecifier',
]);
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
  'NewExpression',
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
  ...MODULE_NODE_TYPES,
]);

export interface JavaScriptCapabilityPolicy {
  readonly id: JavaScriptCapabilityProfileId;
  readonly allowModules: boolean;
  readonly allowDom: boolean;
  readonly allowAsync: boolean;
}

/** 教材が任意Capabilityを注入できない固定Profile集合。 */
export const JAVASCRIPT_CAPABILITY_PROFILES: Readonly<
  Record<JavaScriptCapabilityProfileId, JavaScriptCapabilityPolicy>
> = Object.freeze({
  core: Object.freeze({ id: 'core', allowModules: false, allowDom: false, allowAsync: false }),
  modules: Object.freeze({
    id: 'modules',
    allowModules: true,
    allowDom: false,
    allowAsync: false,
  }),
  dom: Object.freeze({ id: 'dom', allowModules: true, allowDom: true, allowAsync: false }),
  async: Object.freeze({ id: 'async', allowModules: true, allowDom: true, allowAsync: true }),
  project: Object.freeze({
    id: 'project',
    allowModules: true,
    allowDom: true,
    allowAsync: true,
  }),
});

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

/** computed memberは静的文字列または非負の整数Literalだけを許可する。 */
function hasSafeComputedProperty(node: AstNode): boolean {
  if (node.type !== 'MemberExpression' || node.computed !== true) return true;
  if (typeof node.property !== 'object' || node.property === null) return false;
  const property = node.property as Readonly<Record<string, unknown>>;
  if (property.type !== 'Literal') return false;
  return (
    typeof property.value === 'string' ||
    (typeof property.value === 'number' &&
      Number.isSafeInteger(property.value) &&
      property.value >= 0)
  );
}

/** Call引数のLiteral文字列を返す。 */
function literalString(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const node = value as Readonly<Record<string, unknown>>;
  return node.type === 'Literal' && typeof node.value === 'string' ? node.value : undefined;
}

/** JavaScript ASTがChapter 00の明示Capabilityだけを使うことをfail-closedで確認する。 */
export function assertJavaScriptCapabilityPolicy(
  program: Node,
  file: string,
  profileId: JavaScriptCapabilityProfileId = 'core',
): void {
  const profile = JAVASCRIPT_CAPABILITY_PROFILES[profileId];
  fullAncestor(program, (node: Node, _state: unknown, ancestors: Node[]) => {
    const current = ast(node);
    const parent = ancestors.at(-2);

    if (node.type === 'ImportExpression') reject(node, file, '動的importはこの演習では使えません');
    if (MODULE_NODE_TYPES.has(node.type) && !profile.allowModules) {
      reject(node, file, 'module構文はこの演習では使えません');
    }
    if (!ALLOWED_NODE_TYPES.has(node.type)) {
      reject(node, file, `この構文（${node.type}）はまだこの演習では使えません`);
    }
    if (node.type === 'DebuggerStatement' || node.type === 'WithStatement') {
      reject(node, file, `この構文（${node.type}）は安全なPreviewでは使えません`);
    }
    if (
      (node.type === 'AwaitExpression' ||
        ((node.type === 'FunctionDeclaration' ||
          node.type === 'FunctionExpression' ||
          node.type === 'ArrowFunctionExpression') &&
          current.async === true)) &&
      !profile.allowAsync
    ) {
      reject(node, file, 'async／awaitはこの演習では使えません');
    }
    if (node.type === 'Literal' && typeof current.regex === 'object' && current.regex !== null) {
      reject(node, file, '正規表現はこの演習では使えません');
    }
    if (node.type === 'NewExpression' && identifierName(current.callee) !== 'Error') {
      reject(node, file, 'このconstructorは安全なPreviewでは使えません');
    }

    if (node.type === 'Identifier') {
      const name = identifierName(node);
      if (name === undefined || isStaticMemberProperty(node, parent)) return;
      const directTimerCall =
        TIMER_IDENTIFIERS.has(name) &&
        parent?.type === 'CallExpression' &&
        ast(parent).callee === node;
      if (!profile.allowAsync && ASYNC_IDENTIFIERS.has(name) && !directTimerCall) {
        reject(node, file, `${name}はasync演習でだけ使えます`);
      }
      if (UNSUPPORTED_ASYNC_IDENTIFIERS.has(name)) {
        reject(node, file, `${name}は回収できない非同期処理のため使えません`);
      }
      if (GLOBAL_EVENT_IDENTIFIERS.has(name)) {
        reject(node, file, `${name}はwindow経由のEvent処理になるため使えません`);
      }
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
      if (!hasSafeComputedProperty(current)) {
        reject(node, file, '変数や式によるcomputed property accessは安全なPreviewでは使えません');
      }
      if (
        root === 'Object' &&
        (property === undefined || !SAFE_OBJECT_STATIC_MEMBERS.has(property))
      ) {
        reject(node, file, `Object.${property ?? 'unknown'}はreflection防止のため使えません`);
      }
      if (property !== undefined && REFLECTION_MEMBERS.has(property)) {
        reject(node, file, `${property}を使ったObject reflectionは使えません`);
      }
      if (property !== undefined && DYNAMIC_CODE_MEMBERS.has(property)) {
        reject(node, file, `${property}を使った動的実行は使えません`);
      }
      if (property !== undefined && BOOTSTRAP_SECRET_MEMBERS.has(property)) {
        reject(node, file, `${property}はPreviewのbootstrap情報へ触れるため使えません`);
      }
      if (property !== undefined && EVENT_HANDLER_MEMBERS.has(property)) {
        reject(node, file, `${property}は未管理のEvent handlerになるため使えません`);
      }
      if (property !== undefined && ASYNC_IDENTIFIERS.has(property) && !profile.allowAsync) {
        reject(node, file, `${property}はasync演習でだけ使えます`);
      }
      if (property !== undefined && UNSUPPORTED_ASYNC_MEMBERS.has(property)) {
        reject(node, file, `${property}は回収できない非同期処理のため使えません`);
      }
      if ((root === 'document' || root === 'navigator') && current.computed === true) {
        reject(node, file, `${root}のcomputed property accessは使えません`);
      }
      if (root === 'document') {
        if (property === 'cookie')
          reject(node, file, 'document.cookieは許可されていないmemberです');
        const allowedDocumentMembers = profile.allowDom
          ? DOM_DOCUMENT_MEMBERS
          : CORE_DOCUMENT_MEMBERS;
        if (property === undefined || !allowedDocumentMembers.has(property)) {
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
      const directAttributeCall =
        (property === 'setAttribute' || property === 'setAttributeNS') &&
        parent?.type === 'CallExpression' &&
        ast(parent).callee === node;
      if (
        property !== undefined &&
        DOM_ONLY_MEMBERS.has(property) &&
        !profile.allowDom &&
        !directAttributeCall
      ) {
        reject(node, file, `${property}はDOM演習でだけ使えます`);
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
      if (calleeName !== undefined && TIMER_IDENTIFIERS.has(calleeName) && !profile.allowAsync) {
        reject(node, file, `${calleeName}はasync演習でだけ使えます`);
      }
      if (isNode(current.callee)) {
        const callee = ast(current.callee);
        const property = memberName(callee);
        const attribute = literalString(args[0]);
        const elementTag = literalString(args[0]);
        if (property === 'createElement' && elementTag === undefined) {
          reject(node, file, 'createElementの要素名は静的な文字列で指定してください');
        }
        if (
          property === 'createElement' &&
          !SAFE_DOM_ELEMENT_TAGS.has(elementTag?.toLowerCase() ?? '')
        ) {
          reject(node, file, `${elementTag ?? 'unknown'}要素は安全なPreviewで生成できません`);
        }
        if (property === 'setAttributeNS') {
          reject(node, file, 'setAttributeNSは安全なPreviewでは使えません');
        }
        if (
          property === 'setAttribute' &&
          attribute !== undefined &&
          RESOURCE_MEMBERS.has(attribute)
        ) {
          reject(node, file, '外部resourceへつながる属性の変更は使えません');
        }
        if (property === 'setAttribute' && !profile.allowDom) {
          reject(node, file, '動的な属性変更はこの演習では使えません');
        }
        if (property === 'setAttribute' && attribute === undefined) {
          reject(node, file, 'setAttributeの属性名は静的な文字列で指定してください');
        }
        if (property === 'setAttribute' && !SAFE_DOM_ATTRIBUTE.test(attribute ?? '')) {
          reject(node, file, 'setAttributeでは安全な属性名だけを指定できます');
        }
      }
    }
  });
}
