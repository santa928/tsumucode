import { parse, type Node } from 'acorn';
import { fullAncestor } from 'acorn-walk';

type Ast = Node & Readonly<Record<string, unknown>>;
interface Scope {
  readonly parent: Scope | undefined;
  readonly varBoundary: boolean;
  readonly bindings: Set<string>;
}
export type ConsoleSourceCheck =
  | { readonly status: 'supported' }
  | {
      readonly status: 'unsupported' | 'syntax' | 'system';
      readonly name: string;
      readonly line: number;
      readonly column: number;
    };

/** 後続taskや外部能力を提供しない有限Console profile。runtime側でも実propertyを除去する。 */
const NONPROVIDED_GLOBALS = new Set([
  'globalThis',
  'self',
  'window',
  'document',
  'parent',
  'top',
  'opener',
  'frames',
  'location',
  'history',
  'navigator',
  'performance',
  'crypto',
  'caches',
  'indexedDB',
  'localStorage',
  'sessionStorage',
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'EventSource',
  'Worker',
  'SharedWorker',
  'ServiceWorker',
  'MessageChannel',
  'MessagePort',
  'BroadcastChannel',
  'postMessage',
  'close',
  'importScripts',
  'setTimeout',
  'clearTimeout',
  'setInterval',
  'clearInterval',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'requestIdleCallback',
  'cancelIdleCallback',
  'scheduler',
  'Event',
  'ErrorEvent',
  'MessageEvent',
  'PromiseRejectionEvent',
  'EventTarget',
  'addEventListener',
  'removeEventListener',
  'dispatchEvent',
  'onmessage',
  'onmessageerror',
  'onerror',
  'onunhandledrejection',
  'onrejectionhandled',
  'Blob',
  'File',
  'FileReader',
  'FileReaderSync',
  'URL',
  'URLSearchParams',
  'ReadableStream',
  'WritableStream',
  'TransformStream',
  'CompressionStream',
  'DecompressionStream',
  'FinalizationRegistry',
  'WeakRef',
  'Atomics',
  'SharedArrayBuffer',
  'ArrayBuffer',
  'DataView',
  'Int8Array',
  'Uint8Array',
  'Uint8ClampedArray',
  'Int16Array',
  'Uint16Array',
  'Int32Array',
  'Uint32Array',
  'Float32Array',
  'Float64Array',
  'BigInt64Array',
  'BigUint64Array',
  'eval',
  'Function',
  'WebAssembly',
  'Intl',
  'TextEncoder',
  'TextDecoder',
  'structuredClone',
  'AbortController',
  'AbortSignal',
  'Request',
  'Response',
  'Headers',
  'WebTransport',
]);
const FUNCTIONS = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);
const BLOCK_SCOPES = new Set([
  'BlockStatement',
  'ForStatement',
  'ForOfStatement',
  'ForInStatement',
  'CatchClause',
]);

/** Acornの動的propertyをNodeとして狭める。 */
function node(value: unknown): Ast | undefined {
  return typeof value === 'object' && value !== null && 'type' in value
    ? (value as Ast)
    : undefined;
}

/** binding位置だけを列挙し、default/computed式をbindingに含めない。 */
function bindings(value: unknown): readonly Ast[] {
  const current = node(value);
  if (current === undefined) return [];
  switch (current.type) {
    case 'Identifier':
      return [current];
    case 'RestElement':
      return bindings(current.argument);
    case 'AssignmentPattern':
      return bindings(current.left);
    case 'ArrayPattern':
      return Array.isArray(current.elements) ? current.elements.flatMap(bindings) : [];
    case 'ObjectPattern':
      return Array.isArray(current.properties)
        ? current.properties.flatMap((item: unknown) => {
            const property = node(item);
            return bindings(property?.type === 'Property' ? property.value : property?.argument);
          })
        : [];
    default:
      return [];
  }
}

/** strictな単一scriptを検査する。安全境界はWorkerの能力除去/CSP/外部停止が担う。 */
export function checkConsoleSource(source: string): ConsoleSourceCheck {
  if (new TextEncoder().encode(source).byteLength > 100 * 1024) {
    return { status: 'system', name: 'source-size', line: 1, column: 1 };
  }
  let program: Node;
  try {
    program = parse(`"use strict";\n${source}`, {
      ecmaVersion: 'latest',
      sourceType: 'script',
      locations: true,
    });
  } catch (error: unknown) {
    // Acorn 8.18は自身のstack限界を位置付きSyntaxErrorへ変換する。
    if (
      !(error instanceof SyntaxError) ||
      error.message.startsWith('Not enough stack space to parse input')
    ) {
      return { status: 'system', name: 'analysis-limit', line: 1, column: 1 };
    }
    const loc = 'loc' in error ? (error.loc as { line?: number; column?: number }) : undefined;
    return {
      status: 'syntax',
      name: 'script',
      line: Math.max(1, (loc?.line ?? 2) - 1),
      column: (loc?.column ?? 0) + 1,
    };
  }
  const scopes = new Map<Node, Scope>();
  const activeScopes = new Map<Node, Scope>();
  const parents = new Map<Node, Node | undefined>();
  const declarationIds = new Set<Node>();
  const nodes: Ast[] = [];
  /** 二巡目の参照判定の前に、同じscopeの宣言を全て登録する。 */
  const declare = (value: unknown, scope: Scope | undefined): void => {
    for (const id of bindings(value)) {
      declarationIds.add(id);
      if (typeof id.name === 'string') scope?.bindings.add(id.name);
    }
  };
  try {
    fullAncestor(program, (value: Node, _state: unknown, ancestors: Node[]) => {
      if (nodes.length >= 20_000) throw new Error('node-limit');
      const current = value as Ast;
      nodes.push(current);
      const parent = ancestors.at(-2) as Ast | undefined;
      parents.set(current, parent);
      let active: Scope | undefined;
      for (let index = 0; index < ancestors.length; index += 1) {
        const ancestor = ancestors[index] as Ast;
        const ancestorParent = ancestors[index - 1] as Ast | undefined;
        const functionBody =
          ancestor.type === 'BlockStatement' &&
          ancestorParent !== undefined &&
          FUNCTIONS.has(ancestorParent.type) &&
          ancestorParent.body === ancestor;
        const switchBody =
          ancestor.type === 'SwitchStatement' && ancestor.discriminant !== ancestors[index + 1];
        if (
          ancestor.type !== 'Program' &&
          !FUNCTIONS.has(ancestor.type) &&
          !BLOCK_SCOPES.has(ancestor.type) &&
          !switchBody
        )
          continue;
        let scope = scopes.get(ancestor);
        if (scope === undefined) {
          scope = {
            parent: active,
            varBoundary: ancestor.type === 'Program' || functionBody,
            bindings: new Set(),
          };
          scopes.set(ancestor, scope);
        }
        active = scope;
      }
      if (active !== undefined) activeScopes.set(current, active);
      if (current.type === 'VariableDeclarator') {
        let target = active;
        if (parent?.kind === 'var') {
          while (target !== undefined && !target.varBoundary) target = target.parent;
        }
        declare(current.id, target);
      }
      if (FUNCTIONS.has(current.type)) {
        if (Array.isArray(current.params))
          for (const param of current.params) declare(param, active);
        declare(current.id, current.type === 'FunctionDeclaration' ? active?.parent : active);
      }
      if (current.type === 'CatchClause') declare(current.param, active);
    });
  } catch {
    return { status: 'system', name: 'analysis-limit', line: 1, column: 1 };
  }
  for (const current of nodes.sort((left, right) => left.start - right.start)) {
    const unsupportedSyntax = [
      'ThisExpression',
      'ImportExpression',
      'ClassDeclaration',
      'ClassExpression',
      'MetaProperty',
    ].includes(current.type);
    let unsupportedGlobal = false;
    if (
      current.type === 'Identifier' &&
      typeof current.name === 'string' &&
      NONPROVIDED_GLOBALS.has(current.name) &&
      !declarationIds.has(current)
    ) {
      const parent = parents.get(current) as Ast | undefined;
      const staticProperty =
        parent?.type === 'MemberExpression' &&
        parent.computed === false &&
        parent.property === current;
      const propertyKey =
        parent?.type === 'Property' &&
        parent.computed === false &&
        parent.key === current &&
        parent.value !== current;
      const label =
        parent !== undefined &&
        ['LabeledStatement', 'BreakStatement', 'ContinueStatement'].includes(parent.type) &&
        parent.label === current;
      let bound = false;
      for (let scope = activeScopes.get(current); scope !== undefined; scope = scope.parent) {
        if (scope.bindings.has(current.name)) {
          bound = true;
          break;
        }
      }
      unsupportedGlobal = !bound && !staticProperty && !propertyKey && !label;
    }
    if (unsupportedSyntax || unsupportedGlobal) {
      return {
        status: 'unsupported',
        name: unsupportedSyntax ? current.type : String(current.name),
        line: Math.max(1, (current.loc?.start.line ?? 2) - 1),
        column: (current.loc?.start.column ?? 0) + 1,
      };
    }
  }
  return { status: 'supported' };
}
