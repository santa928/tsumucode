import { parse, type Node } from 'acorn';
import { full } from 'acorn-walk';
import { isJavaScriptWorkspacePath, resolveJavaScriptModuleSpecifier } from './modulePath';

type AstNode = Node & Readonly<Record<string, unknown>>;

const MAX_MODULE_FILES = 64;
const MAX_MODULE_EDGES = 256;

export interface JavaScriptModuleDependency {
  readonly specifier: string;
  readonly resolvedFile: string;
  readonly start: number;
  readonly end: number;
}

export interface JavaScriptModuleNode {
  readonly file: string;
  readonly source: string;
  readonly dependencies: readonly JavaScriptModuleDependency[];
}

export interface JavaScriptModuleGraph {
  readonly entryFile: string;
  readonly modules: readonly JavaScriptModuleNode[];
}

export interface BuildJavaScriptModuleGraphInput {
  readonly entryFile: string;
  readonly files: Readonly<Record<string, string>>;
}

/** Module解決失敗を起点FileとSource位置付きで伝える。 */
export class JavaScriptModuleGraphError extends Error {
  constructor(
    message: string,
    readonly file: string,
    readonly line?: number,
    readonly column?: number,
    readonly kind: 'syntax' | 'security' | 'system' = 'security',
  ) {
    super(message);
    this.name = 'JavaScriptModuleGraphError';
  }
}

/** Acorn Nodeを追加propertyへ安全にアクセスできるRecordとして扱う。 */
function ast(node: Node): AstNode {
  return node as AstNode;
}

/** static import／exportのLiteral sourceをboundedな文字列として読む。 */
function staticSpecifier(node: Node, file: string): { value: string; start: number; end: number } {
  const source = ast(node).source;
  if (typeof source !== 'object' || source === null) {
    throw new JavaScriptModuleGraphError('Module specifierを読み取れません', file);
  }
  const literal = source as Readonly<Record<string, unknown>>;
  if (
    literal.type !== 'Literal' ||
    typeof literal.value !== 'string' ||
    typeof literal.start !== 'number' ||
    typeof literal.end !== 'number' ||
    literal.value.length === 0 ||
    literal.value.length > 256
  ) {
    throw new JavaScriptModuleGraphError(
      'Module specifierはboundedな文字列で指定してください',
      file,
    );
  }
  return { value: literal.value, start: literal.start, end: literal.end };
}

/** import元から相対specifierをWorkspace root内のcanonical pathへ解決する。 */
export function resolveModuleSpecifier(fromFile: string, specifier: string): string {
  const resolved = resolveJavaScriptModuleSpecifier(fromFile, specifier);
  if (resolved === undefined) {
    throw new JavaScriptModuleGraphError(
      'Module importは制御文字を含まないWorkspace内の相対.js pathで指定してください',
      fromFile,
    );
  }
  return resolved;
}

/** 1 Fileをmoduleとしてparseしstatic dependencyだけを抽出する。 */
function parseDependencies(
  file: string,
  source: string,
  files: Readonly<Record<string, string>>,
): readonly JavaScriptModuleDependency[] {
  let program: Node;
  try {
    program = parse(source, { ecmaVersion: 'latest', sourceType: 'module', locations: true });
  } catch (error: unknown) {
    const position =
      typeof error === 'object' && error !== null
        ? (error as Readonly<Record<string, unknown>>).loc
        : undefined;
    const location =
      typeof position === 'object' && position !== null
        ? (position as Readonly<Record<string, unknown>>)
        : undefined;
    throw new JavaScriptModuleGraphError(
      error instanceof Error ? error.message : String(error),
      file,
      typeof location?.line === 'number' ? location.line : undefined,
      typeof location?.column === 'number' ? location.column + 1 : undefined,
      'syntax',
    );
  }
  const dependencies: JavaScriptModuleDependency[] = [];
  full(program, (node: Node) => {
    if (node.type === 'ImportExpression') {
      const position = node.loc?.start;
      throw new JavaScriptModuleGraphError(
        '学習コードではdynamic importを使用できません',
        file,
        position?.line,
        position === undefined ? undefined : position.column + 1,
      );
    }
    if (
      node.type !== 'ImportDeclaration' &&
      node.type !== 'ExportNamedDeclaration' &&
      node.type !== 'ExportAllDeclaration'
    ) {
      return;
    }
    if (node.type === 'ExportNamedDeclaration' && ast(node).source === null) return;
    const specifier = staticSpecifier(node, file);
    const resolvedFile = resolveModuleSpecifier(file, specifier.value);
    if (!Object.hasOwn(files, resolvedFile)) {
      const position = node.loc?.start;
      throw new JavaScriptModuleGraphError(
        `ModuleがWorkspace内に見つかりません: ${resolvedFile}`,
        file,
        position?.line,
        position === undefined ? undefined : position.column + 1,
      );
    }
    dependencies.push({
      specifier: specifier.value,
      resolvedFile,
      start: specifier.start,
      end: specifier.end,
    });
    if (dependencies.length > MAX_MODULE_EDGES) {
      throw new JavaScriptModuleGraphError('Module importは合計256件までです', file);
    }
  });
  return dependencies;
}

/** entryから到達可能なstatic module graphを依存先優先の決定順へ並べる。 */
export function buildModuleGraph(input: BuildJavaScriptModuleGraphInput): JavaScriptModuleGraph {
  if (!isJavaScriptWorkspacePath(input.entryFile)) {
    throw new JavaScriptModuleGraphError('Entry module pathが不正です', input.entryFile);
  }
  for (const file of Object.keys(input.files)) {
    if (!isJavaScriptWorkspacePath(file)) {
      throw new JavaScriptModuleGraphError('Module pathが不正です', file);
    }
  }
  if (!Object.hasOwn(input.files, input.entryFile)) {
    throw new JavaScriptModuleGraphError(
      `Entry moduleがWorkspace内に見つかりません: ${input.entryFile}`,
      input.entryFile,
    );
  }
  const ordered: JavaScriptModuleNode[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const stack: string[] = [];
  let edgeCount = 0;

  const visit = (file: string): void => {
    if (visited.has(file)) return;
    if (visiting.has(file)) {
      const cycleStart = stack.indexOf(file);
      const cycle = [...stack.slice(Math.max(0, cycleStart)), file];
      throw new JavaScriptModuleGraphError(
        `循環moduleは使用できません: ${cycle.join(' → ')}`,
        file,
      );
    }
    if (visited.size + visiting.size >= MAX_MODULE_FILES) {
      throw new JavaScriptModuleGraphError('到達可能なModuleは64 Fileまでです', file);
    }
    const source = input.files[file];
    if (source === undefined) {
      throw new JavaScriptModuleGraphError(`ModuleがWorkspace内に見つかりません: ${file}`, file);
    }
    visiting.add(file);
    stack.push(file);
    const dependencies = parseDependencies(file, source, input.files);
    edgeCount += dependencies.length;
    if (edgeCount > MAX_MODULE_EDGES) {
      throw new JavaScriptModuleGraphError('Module importはgraph全体で256件までです', file);
    }
    for (const dependency of dependencies) visit(dependency.resolvedFile);
    stack.pop();
    visiting.delete(file);
    visited.add(file);
    ordered.push({ file, source, dependencies });
  };

  visit(input.entryFile);
  return { entryFile: input.entryFile, modules: ordered };
}
