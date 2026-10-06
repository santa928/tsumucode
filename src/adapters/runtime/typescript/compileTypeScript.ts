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
  | {
      readonly status: 'ready';
      readonly files: Readonly<Record<string, string>>;
      readonly sourceMaps: Readonly<Record<string, string>>;
    }
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
  return processTypeScript(files, standardLibraries, true);
}

/** React専用Workerから、固定した型定義だけでTSXを検査・変換する。 */
export function compileReactTypeScript(
  files: Readonly<Record<string, string>>,
  standardLibraries: Readonly<Record<string, string>>,
  reactLibraries: Readonly<Record<string, string>>,
): TypeScriptCompileResult {
  const required = [
    'react/index.d.ts',
    'react/global.d.ts',
    'react/jsx-runtime.d.ts',
    'react-dom/index.d.ts',
    'react-dom/client.d.ts',
    'csstype/index.d.ts',
  ];
  if (required.some((name) => !reactLibraries[name]))
    return {
      status: 'environment-error',
      diagnostics: [
        {
          code: 0,
          message:
            '固定したReactの型定義を読み込めませんでした。コードを保持して再試行してください。',
        },
      ],
    };
  return processTypeScript(files, standardLibraries, true, undefined, reactLibraries);
}

/** 信頼側の型関係検査専用。成功時もJS・source mapを生成せず、Runnerへ渡せる結果を返さない。 */
export function checkTypeScript(
  files: Readonly<Record<string, string>>,
  standardLibraries: Readonly<Record<string, string>>,
): { readonly status: 'valid' } | Exclude<TypeScriptCompileResult, { status: 'ready' }> {
  const result = processTypeScript(files, standardLibraries, false);
  return result.status === 'ready' ? { status: 'valid' } : result;
}

interface ProbeRequest {
  builder?: ts.SemanticDiagnosticsBuilderProgram;
}

/** 正負probeの1回の検査内だけで再利用する。通常変換・別requestへ状態を共有しない。 */
export function createTypeScriptProbeChecker(): typeof checkTypeScript {
  const request: ProbeRequest = {};
  return (files, libraries) => {
    const result = processTypeScript(files, libraries, false, request);
    if (result.status === 'environment-error') delete request.builder;
    return result.status === 'ready' ? { status: 'valid' } : result;
  };
}

/** 通常変換と型検査専用経路で、仮想Fileと診断の安全境界を共有する。 */
function processTypeScript(
  files: Readonly<Record<string, string>>,
  standardLibraries: Readonly<Record<string, string>>,
  emitJavaScript: boolean,
  request?: ProbeRequest,
  reactLibraries?: Readonly<Record<string, string>>,
): TypeScriptCompileResult {
  const entries = Object.entries(files);
  if (
    entries.length === 0 ||
    entries.length > MAX_FILES ||
    entries.some(
      ([name, source]) =>
        name.length > 256 ||
        !(
          reactLibraries
            ? /^(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\.tsx?$/u
            : /^(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\.ts$/u
        ).test(name) ||
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
  const reactPackages: Readonly<Record<string, string>> = {
    react: '/types/react/index.d.ts',
    'react/jsx-runtime': '/types/react/jsx-runtime.d.ts',
    'react-dom': '/types/react-dom/index.d.ts',
    'react-dom/client': '/types/react-dom/client.d.ts',
    csstype: '/types/csstype/index.d.ts',
  };
  const typeLibraries = new Map(
    Object.entries(reactLibraries ?? {}).map(([name, source]) => ['/types/' + name, source]),
  );
  const virtualFiles = new Map([...libraries, ...typeLibraries, ...sources]);
  const options: ts.CompilerOptions = {
    ...(reactLibraries ? { jsx: ts.JsxEmit.ReactJSX } : {}),
    target: ts.ScriptTarget.ES2023,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true,
    noEmitOnError: true,
    sourceMap: true,
    noUncheckedIndexedAccess: true,
    exactOptionalPropertyTypes: true,
    types: [],
    skipLibCheck: false,
    newLine: ts.NewLineKind.LineFeed,
  };
  const output: Record<string, string> = {};
  const sourceMaps: Record<string, string> = {};
  let projectSources: Map<string, ts.SourceFile> | undefined;
  let reusableRequest: ProbeRequest | undefined;
  const host: ts.CompilerHost = {
    getSourceFile: (name, languageVersion, _onError, shouldCreateNewSourceFile) => {
      const source = virtualFiles.get(name);
      if (source === undefined) return undefined;
      const project = projectSources?.get(name);
      if (project && !shouldCreateNewSourceFile) return project;
      const cached = reusableRequest?.builder?.getProgram().getSourceFile(name);
      if (!shouldCreateNewSourceFile && cached?.text === source) return cached;
      const parsed = ts.createSourceFile(name, source, languageVersion);
      if (reusableRequest) Reflect.set(parsed, 'version', source);
      return parsed;
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
      if (!name.startsWith(SOURCE_ROOT)) return;
      if (name.endsWith('.js.map')) sourceMaps[name.slice(SOURCE_ROOT.length, -4)] = text;
      else if (name.endsWith('.js'))
        output[name.slice(SOURCE_ROOT.length)] = text.replace(
          /\n\/\/# sourceMappingURL=[^\n]*\n?$/u,
          '\n',
        );
    },
    resolveModuleNames: (names, containingFile) =>
      names.map((name) => {
        const fixed =
          reactLibraries && Object.hasOwn(reactPackages, name) ? reactPackages[name] : undefined;
        if (fixed)
          return {
            resolvedFileName: fixed,
            extension: ts.Extension.Dts,
            isExternalLibraryImport: true,
          };
        return /^\.\.?\//u.test(name)
          ? ts.resolveModuleName(name, containingFile, options, host).resolvedModule
          : undefined;
      }),
  };

  try {
    if (request) {
      // projectのASTは毎回新規解析する。global型が変わる入力は独立検査へ戻す。
      projectSources = new Map(
        [...sources].map(([name, text]) => {
          const parsed = ts.createSourceFile(name, text, ts.ScriptTarget.ES2023);
          Reflect.set(parsed, 'version', text);
          return [name, parsed];
        }),
      );
      const moduleOnly = [...projectSources.values()].every(
        (source) =>
          ts.isExternalModule(source) &&
          !source.statements.some(
            (statement) =>
              ts.isModuleDeclaration(statement) || ts.isNamespaceExportDeclaration(statement),
          ),
      );
      const libraryChanged = request.builder
        ?.getProgram()
        .getSourceFiles()
        .some(
          (source) =>
            source.fileName.startsWith(LIB_ROOT) && libraries.get(source.fileName) !== source.text,
        );
      if (!moduleOnly || libraryChanged) delete request.builder;
      if (moduleOnly) reusableRequest = request;
    }
    const builder = reusableRequest
      ? ts.createSemanticDiagnosticsBuilderProgram(
          [...sources.keys()],
          options,
          host,
          reusableRequest.builder,
        )
      : undefined;
    const program = builder?.getProgram() ?? ts.createProgram([...sources.keys()], options, host);
    if (reusableRequest && builder) reusableRequest.builder = builder;
    const environment = [...program.getOptionsDiagnostics(), ...program.getGlobalDiagnostics()];
    if (environment.length) {
      return { status: 'environment-error', diagnostics: diagnosticsForLearner(environment) };
    }
    const syntax = program.getSyntacticDiagnostics();
    const librarySyntax = syntax.filter(
      (item) => item.file.fileName.startsWith(LIB_ROOT) || item.file.fileName.startsWith('/types/'),
    );
    if (librarySyntax.length) {
      return { status: 'environment-error', diagnostics: diagnosticsForLearner(librarySyntax) };
    }
    if (syntax.length) {
      return { status: 'syntax-error', diagnostics: diagnosticsForLearner(syntax) };
    }
    const semantic = builder
      ? ts.sortAndDeduplicateDiagnostics(builder.getSemanticDiagnostics())
      : program.getSemanticDiagnostics();
    const libraryErrors = semantic.filter(
      (item) =>
        item.file?.fileName.startsWith(LIB_ROOT) || item.file?.fileName.startsWith('/types/'),
    );
    if (libraryErrors.length) {
      return { status: 'environment-error', diagnostics: diagnosticsForLearner(libraryErrors) };
    }
    if (semantic.length) {
      return { status: 'type-error', diagnostics: diagnosticsForLearner(semantic) };
    }
    if (!emitJavaScript) return { status: 'ready', files: {}, sourceMaps: {} };
    const emit = program.emit();
    if (
      emit.emitSkipped ||
      emit.diagnostics.length ||
      Object.keys(output).length !== sources.size ||
      Object.keys(sourceMaps).length !== sources.size
    ) {
      return {
        status: 'environment-error',
        diagnostics: diagnosticsForLearner(emit.diagnostics).concat({
          code: 0,
          message: 'JavaScriptへの変換を完了できませんでした。',
        }),
      };
    }
    return { status: 'ready', files: output, sourceMaps };
  } catch {
    return {
      status: 'environment-error',
      diagnostics: [
        { code: 0, message: '型検査を完了できませんでした。コードを保持して再試行してください。' },
      ],
    };
  }
}
