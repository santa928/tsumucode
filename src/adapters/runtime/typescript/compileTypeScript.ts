/** Worker内から使う型検査境界。渡された仮想ファイル以外を読まず、コードは実行しない。 */
import ts from 'typescript';

export interface TypeScriptDiagnostic {
  readonly code: number;
  readonly message: string;
  readonly file?: string;
  readonly line?: number;
  readonly column?: number;
}

export type TypeScriptCompileResult =
  | { readonly status: 'ready'; readonly files: Readonly<Record<string, string>> }
  | {
      readonly status: 'invalid-input' | 'environment-error' | 'syntax-error' | 'type-error';
      readonly diagnostics: readonly TypeScriptDiagnostic[];
    };

const SOURCE_ROOT = '/project/';
const LIB_ROOT = '/lib/';
const DEFAULT_LIB = 'lib.es2023.full.d.ts';
const MAX_FILES = 16;
const MAX_SOURCE_UNITS = 128 * 1024;

/** 診断はplain textと元のTS位置だけに限定し、出力件数と文量を抑える。 */
function diagnosticsForLearner(items: readonly ts.Diagnostic[]): TypeScriptDiagnostic[] {
  return items.slice(0, 50).map((item) => {
    const basic = {
      code: item.code,
      message: ts.flattenDiagnosticMessageText(item.messageText, '\n').slice(0, 2_000),
    };
    if (!item.file || item.start === undefined) return basic;
    const location = item.file.getLineAndCharacterOfPosition(item.start);
    return {
      ...basic,
      file: item.file.fileName.startsWith(SOURCE_ROOT)
        ? item.file.fileName.slice(SOURCE_ROOT.length)
        : item.file.fileName,
      line: location.line + 1,
      column: location.character + 1,
    };
  });
}

/** 固定compilerの標準libを信頼側から渡す。型エラー時はJSを一切返さない。 */
export function compileTypeScript(
  files: Readonly<Record<string, string>>,
  standardLibraries: Readonly<Record<string, string>>,
): TypeScriptCompileResult {
  const entries = Object.entries(files);
  if (
    entries.length === 0 ||
    entries.length > MAX_FILES ||
    entries.some(
      ([name, source]) =>
        name.length > 256 ||
        !/^(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\.ts$/u.test(name) ||
        typeof source !== 'string',
    ) ||
    entries.reduce((size, [, source]) => size + source.length, 0) > MAX_SOURCE_UNITS
  ) {
    return {
      status: 'invalid-input',
      diagnostics: [
        {
          code: 0,
          message: '相対パスの.tsを1〜16ファイル、合計131072文字以内で指定してください。',
        },
      ],
    };
  }
  if (!Object.hasOwn(standardLibraries, DEFAULT_LIB)) {
    return {
      status: 'environment-error',
      diagnostics: [{ code: 0, message: 'TypeScriptの標準型定義を読み込めませんでした。' }],
    };
  }

  const sources = new Map(entries.map(([name, source]) => [SOURCE_ROOT + name, source]));
  const libraries = new Map(
    Object.entries(standardLibraries)
      .filter(([name]) => /^lib\.[a-z0-9.]+\.d\.ts$/u.test(name))
      .map(([name, source]) => [LIB_ROOT + name, source]),
  );
  const virtualFiles = new Map([...libraries, ...sources]);
  const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2023,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true,
    noEmitOnError: true,
    noUncheckedIndexedAccess: true,
    exactOptionalPropertyTypes: true,
    types: [],
    skipLibCheck: false,
    newLine: ts.NewLineKind.LineFeed,
  };
  const output: Record<string, string> = {};
  const host: ts.CompilerHost = {
    getSourceFile: (name, languageVersion) => {
      const source = virtualFiles.get(name);
      return source === undefined ? undefined : ts.createSourceFile(name, source, languageVersion);
    },
    getDefaultLibFileName: () => LIB_ROOT + DEFAULT_LIB,
    getCurrentDirectory: () => SOURCE_ROOT.slice(0, -1),
    getCanonicalFileName: (name) => name,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => '\n',
    fileExists: (name) => virtualFiles.has(name),
    readFile: (name) => virtualFiles.get(name),
    directoryExists: (directory) =>
      [...virtualFiles.keys()].some((name) => name.startsWith(directory.replace(/\/$/u, '') + '/')),
    getDirectories: () => [],
    writeFile: (name, text) => {
      if (name.startsWith(SOURCE_ROOT) && name.endsWith('.js')) {
        output[name.slice(SOURCE_ROOT.length)] = text;
      }
    },
    resolveModuleNames: (names, containingFile) =>
      names.map((name) =>
        /^\.\.?\//u.test(name)
          ? ts.resolveModuleName(name, containingFile, options, host).resolvedModule
          : undefined,
      ),
  };

  try {
    const program = ts.createProgram([...sources.keys()], options, host);
    const environment = [...program.getOptionsDiagnostics(), ...program.getGlobalDiagnostics()];
    if (environment.length) {
      return { status: 'environment-error', diagnostics: diagnosticsForLearner(environment) };
    }
    const syntax = program.getSyntacticDiagnostics();
    const librarySyntax = syntax.filter((item) => item.file.fileName.startsWith(LIB_ROOT));
    if (librarySyntax.length) {
      return { status: 'environment-error', diagnostics: diagnosticsForLearner(librarySyntax) };
    }
    if (syntax.length) {
      return { status: 'syntax-error', diagnostics: diagnosticsForLearner(syntax) };
    }
    const semantic = program.getSemanticDiagnostics();
    const libraryErrors = semantic.filter((item) => item.file?.fileName.startsWith(LIB_ROOT));
    if (libraryErrors.length) {
      return { status: 'environment-error', diagnostics: diagnosticsForLearner(libraryErrors) };
    }
    if (semantic.length) {
      return { status: 'type-error', diagnostics: diagnosticsForLearner(semantic) };
    }
    const emit = program.emit();
    if (
      emit.emitSkipped ||
      emit.diagnostics.length ||
      Object.keys(output).length !== sources.size
    ) {
      return {
        status: 'environment-error',
        diagnostics: diagnosticsForLearner(emit.diagnostics).concat({
          code: 0,
          message: 'JavaScriptへの変換を完了できませんでした。',
        }),
      };
    }
    return { status: 'ready', files: output };
  } catch {
    return {
      status: 'environment-error',
      diagnostics: [
        { code: 0, message: '型検査を完了できませんでした。コードを保持して再試行してください。' },
      ],
    };
  }
}
