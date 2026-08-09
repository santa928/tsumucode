import { parse, type Node } from 'acorn';
import { full } from 'acorn-walk';
import {
  isJavaScriptWorkspacePath,
  type JavaScriptInstrumentedModule,
} from '../analyzer/contracts';
import { resolveJavaScriptModuleSpecifier } from '../analyzer/modulePath';

type AstNode = Node & Readonly<Record<string, unknown>>;

const SAFE_IDENTIFIER = /^[$A-Z_a-z][$\w]*$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const MAX_MODULE_FILES = 64;
const MAX_MODULE_EDGES = 256;

export interface PreparedJavaScriptModule {
  readonly file: string;
  readonly sourceSegments: readonly string[];
  readonly dependencyFiles: readonly string[];
}

export interface PreparedJavaScriptModuleGraph {
  readonly entryFile: string;
  readonly graphSha256: string;
  readonly modules: readonly PreparedJavaScriptModule[];
}

export interface PrepareModuleGraphInput {
  readonly entryFile: string;
  readonly graphSha256: string;
  readonly modules: readonly JavaScriptInstrumentedModule[];
  readonly guardIdentifier: string;
  readonly runtimeKey: string;
}

interface StaticSpecifierRange {
  readonly specifier: string;
  readonly start: number;
  readonly end: number;
}

/** Acorn nodeのstatic module sourceを読み取る。 */
function specifierRange(node: Node): StaticSpecifierRange | undefined {
  if (
    node.type !== 'ImportDeclaration' &&
    node.type !== 'ExportNamedDeclaration' &&
    node.type !== 'ExportAllDeclaration'
  ) {
    return undefined;
  }
  const source = (node as AstNode).source;
  if (source === null || typeof source !== 'object') return undefined;
  const literal = source as Readonly<Record<string, unknown>>;
  if (
    literal.type !== 'Literal' ||
    typeof literal.value !== 'string' ||
    typeof literal.start !== 'number' ||
    typeof literal.end !== 'number'
  ) {
    throw new Error('instrument済みModuleのspecifierが不正です');
  }
  return { specifier: literal.value, start: literal.start, end: literal.end };
}

/** instrument後Sourceを再parseし、specifierの現在offsetを決定順で返す。 */
function currentSpecifierRanges(source: string): readonly StaticSpecifierRange[] {
  const program = parse(source, { ecmaVersion: 'latest', sourceType: 'module' });
  const ranges: StaticSpecifierRange[] = [];
  full(program, (node: Node) => {
    if (node.type === 'ImportExpression') {
      throw new Error('instrument済みModuleにdynamic importが含まれています');
    }
    const range = specifierRange(node);
    if (range !== undefined) ranges.push(range);
  });
  return ranges.sort((left, right) => left.start - right.start);
}

/** 依存specifierをURL差し込み位置へ分割し、学習Sourceとtrusted値を混ぜないPlanを作る。 */
function prepareModule(
  module: JavaScriptInstrumentedModule,
  preparedFiles: ReadonlySet<string>,
  guardIdentifier: string,
  runtimeKey: string,
): PreparedJavaScriptModule {
  const ranges = currentSpecifierRanges(module.instrumentedCode);
  if (ranges.length !== module.dependencies.length) {
    throw new Error(`Module dependency数が解析結果と一致しません: ${module.file}`);
  }
  const sourceSegments: string[] = [];
  const dependencyFiles: string[] = [];
  let cursor = 0;
  for (const [index, dependency] of module.dependencies.entries()) {
    const range = ranges[index];
    if (range === undefined || range.specifier !== dependency.specifier) {
      throw new Error(`Module specifierが解析結果と一致しません: ${module.file}`);
    }
    if (!preparedFiles.has(dependency.resolvedFile)) {
      throw new Error(`依存Moduleが先に準備されていません: ${dependency.resolvedFile}`);
    }
    if (
      resolveJavaScriptModuleSpecifier(module.file, dependency.specifier) !==
      dependency.resolvedFile
    ) {
      throw new Error(`Module specifierの解決結果が一致しません: ${module.file}`);
    }
    sourceSegments.push(module.instrumentedCode.slice(cursor, range.start));
    dependencyFiles.push(dependency.resolvedFile);
    cursor = range.end;
  }
  sourceSegments.push(module.instrumentedCode.slice(cursor));
  sourceSegments[0] =
    `const ${guardIdentifier}=globalThis[${JSON.stringify(runtimeKey)}];` +
    `if(!${guardIdentifier})throw new Error("JavaScript runtime is unavailable");\n` +
    (sourceSegments[0] ?? '');
  const lastIndex = sourceSegments.length - 1;
  const encodedSourcePath = module.file.split('/').map(encodeURIComponent).join('/');
  sourceSegments[lastIndex] =
    (sourceSegments[lastIndex] ?? '') + `\n//# sourceURL=tsumucode-module/${encodedSourcePath}`;
  return Object.freeze({
    file: module.file,
    sourceSegments: Object.freeze(sourceSegments),
    dependencyFiles: Object.freeze(dependencyFiles),
  });
}

/** instrument済みgraphをopaque iframe内でBlob化できる閉じた実行Planへ変換する。 */
export function prepareModuleGraph(input: PrepareModuleGraphInput): PreparedJavaScriptModuleGraph {
  if (!SAFE_IDENTIFIER.test(input.guardIdentifier) || !SAFE_IDENTIFIER.test(input.runtimeKey)) {
    throw new Error('Module runtime identifierが不正です');
  }
  if (!SHA256.test(input.graphSha256)) throw new Error('Module graph hashが不正です');
  if (!isJavaScriptWorkspacePath(input.entryFile)) throw new Error('Entry module pathが不正です');
  if (input.modules.length === 0 || input.modules.length > MAX_MODULE_FILES) {
    throw new Error('Module graphは1〜64 Fileで指定してください');
  }
  const preparedFiles = new Set<string>();
  const modules: PreparedJavaScriptModule[] = [];
  let edgeCount = 0;
  for (const module of input.modules) {
    if (!isJavaScriptWorkspacePath(module.file))
      throw new Error(`Module pathが不正です: ${module.file}`);
    if (preparedFiles.has(module.file))
      throw new Error(`Module Fileが重複しています: ${module.file}`);
    edgeCount += module.dependencies.length;
    if (edgeCount > MAX_MODULE_EDGES) throw new Error('Module importはgraph全体で256件までです');
    modules.push(prepareModule(module, preparedFiles, input.guardIdentifier, input.runtimeKey));
    preparedFiles.add(module.file);
  }
  if (!preparedFiles.has(input.entryFile) || modules.at(-1)?.file !== input.entryFile) {
    throw new Error('Entry moduleがgraph末尾にありません');
  }
  return Object.freeze({
    entryFile: input.entryFile,
    graphSha256: input.graphSha256,
    modules: Object.freeze(modules),
  });
}
