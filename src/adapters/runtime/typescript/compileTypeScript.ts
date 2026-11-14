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

export interface ReactTypeCheckSeed {
  readonly format: 1;
  readonly compilerVersion: string;
  readonly libraryVersions: Readonly<Record<string, string>>;
  readonly buildInfo: string;
}

const SOURCE_ROOT = '/project/';
const LIB_ROOT = '/lib/';
const DEFAULT_LIB = 'lib.es2023.full.d.ts';
const BUILD_INFO = SOURCE_ROOT + '__compiler_seed.tsbuildinfo';
const SEED_FILE = '__seed.ts';
const SEED_SOURCE =
  "import type {} from 'react'; import type {} from 'react/jsx-runtime'; " +
  "import type {} from 'react-dom'; import type {} from 'react-dom/client'; " +
  "import type {} from 'csstype'; export {};";
const REQUIRED_REACT_LIBRARIES = [
  'react/index.d.ts',
  'react/global.d.ts',
  'react/jsx-runtime.d.ts',
  'react-dom/index.d.ts',
  'react-dom/client.d.ts',
  'csstype/index.d.ts',
];
const MAX_FILES = 16;
const MAX_SOURCE_UNITS = 128 * 1024;

interface ReactIncrementalContext {
  readonly libraryVersions: Readonly<Record<string, string>>;
  readonly buildInfo?: string;
  readonly writeBuildInfo?: (text: string) => void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** 固定版producerが作る検査済みseedだけを復元し、診断や別の入力状態を持ち込まない。 */
function isReactTypeCheckBuildInfo(
  value: unknown,
  libraryVersions: Readonly<Record<string, string>>,
): boolean {
  const keys = [
    'fileNames',
    'fileIdsList',
    'fileInfos',
    'root',
    'options',
    'referencedMap',
    'version',
  ];
  if (
    !isRecord(value) ||
    Object.keys(value).length !== keys.length ||
    keys.some((key) => !Object.hasOwn(value, key)) ||
    value.version !== ts.version ||
    !Array.isArray(value.fileNames) ||
    !Array.isArray(value.fileInfos) ||
    !Array.isArray(value.root) ||
    !Array.isArray(value.fileIdsList) ||
    !Array.isArray(value.referencedMap) ||
    !isRecord(value.options)
  )
    return false;

  const fileNames: readonly unknown[] = value.fileNames;
  const fileInfos: readonly unknown[] = value.fileInfos;
  const fileIdsList: readonly unknown[] = value.fileIdsList;
  const referencedMap: readonly unknown[] = value.referencedMap;
  const versions = new Map(
    Object.entries(libraryVersions).map(([name, version]) => ['..' + name, version]),
  );
  versions.set('./' + SEED_FILE, SEED_SOURCE);
  if (
    fileNames.length !== fileInfos.length ||
    new Set(fileNames).size !== fileNames.length ||
    fileNames.some((name, index) => {
      if (typeof name !== 'string' || !versions.has(name)) return true;
      const info = fileInfos[index];
      const version = versions.get(name);
      if (typeof info === 'string') return info !== version;
      return (
        name === './' + SEED_FILE ||
        !isRecord(info) ||
        Object.keys(info).length !== 2 ||
        info.version !== version ||
        info.affectsGlobalScope !== true
      );
    }) ||
    value.root.length !== 1 ||
    value.root[0] !== fileNames.indexOf('./' + SEED_FILE) + 1 ||
    value.root[0] === 0
  )
    return false;

  const options: Readonly<Record<string, string | number | boolean>> = {
    exactOptionalPropertyTypes: true,
    jsx: ts.JsxEmit.ReactJSX,
    module: ts.ModuleKind.ESNext,
    newLine: ts.NewLineKind.LineFeed,
    noEmitOnError: true,
    noUncheckedIndexedAccess: true,
    skipLibCheck: false,
    sourceMap: true,
    strict: true,
    target: ts.ScriptTarget.ES2023,
    tsBuildInfoFile: './__compiler_seed.tsbuildinfo',
  };
  const serializedOptions = value.options;
  if (
    Object.keys(serializedOptions).length !== Object.keys(options).length ||
    Object.entries(options).some(([name, option]) => serializedOptions[name] !== option)
  )
    return false;

  const isIndex = (index: unknown, length: number) =>
    typeof index === 'number' && Number.isInteger(index) && index >= 1 && index <= length;
  return (
    fileIdsList.every(
      (list) =>
        Array.isArray(list) && list.every((index: unknown) => isIndex(index, fileNames.length)),
    ) &&
    referencedMap.every(
      (pair) =>
        Array.isArray(pair) &&
        pair.length === 2 &&
        isIndex(pair[0], fileNames.length) &&
        isIndex(pair[1], fileIdsList.length),
    )
  );
}

/** 固定宣言の本文をbuild infoへ重複保存せず、完全一致するversionを作る。 */
async function reactLibraryVersions(
  standardLibraries: Readonly<Record<string, string>>,
  reactLibraries: Readonly<Record<string, string>>,
): Promise<Readonly<Record<string, string>>> {
  const entries = [
    ...Object.entries(standardLibraries)
      .filter(([name]) => /^lib\.[a-z0-9.]+\.d\.ts$/u.test(name))
      .map(([name, text]) => [LIB_ROOT + name, text] as const),
    ...Object.entries(reactLibraries).map(([name, text]) => ['/types/' + name, text] as const),
  ];
  const versions = await Promise.all(
    entries.map(async ([name, text]) => {
      const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
      return [
        name,
        Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join(''),
      ] as const;
    }),
  );
  return Object.freeze(Object.fromEntries(versions));
}

/** ビルド時だけ実行し、固定宣言も省略せず検査した標準incremental情報を作る。 */
export async function createReactTypeCheckSeed(
  standardLibraries: Readonly<Record<string, string>>,
  reactLibraries: Readonly<Record<string, string>>,
): Promise<ReactTypeCheckSeed> {
  const standard = Object.freeze({ ...standardLibraries });
  const react = Object.freeze({ ...reactLibraries });
  if (REQUIRED_REACT_LIBRARIES.some((name) => !react[name]))
    throw new Error('固定したReactの型定義を読み込めませんでした。');
  const libraryVersions = await reactLibraryVersions(standard, react);
  let buildInfo: string | undefined;
  const result = processTypeScript({ [SEED_FILE]: SEED_SOURCE }, standard, true, undefined, react, {
    libraryVersions,
    writeBuildInfo: (text) => {
      buildInfo = text;
    },
  });
  if (result.status !== 'ready' || !buildInfo)
    throw new Error('固定宣言の型検査seedを生成できませんでした。');
  return Object.freeze({ format: 1, compilerVersion: ts.version, libraryVersions, buildInfo });
}

/** 不一致や復元失敗時も、同じ固定宣言を使う既存の完全検査へ戻す。 */
export async function createSeededReactCompiler(
  standardLibraries: Readonly<Record<string, string>>,
  reactLibraries: Readonly<Record<string, string>>,
  seed: unknown,
): Promise<(files: Readonly<Record<string, string>>) => TypeScriptCompileResult> {
  const standard = Object.freeze({ ...standardLibraries });
  const react = Object.freeze({ ...reactLibraries });
  const cold = (files: Readonly<Record<string, string>>) =>
    compileReactTypeScript(files, standard, react);
  try {
    if (!seed || typeof seed !== 'object') return cold;
    const candidate = seed as Partial<ReactTypeCheckSeed>;
    if (
      candidate.format !== 1 ||
      candidate.compilerVersion !== ts.version ||
      !candidate.libraryVersions ||
      typeof candidate.libraryVersions !== 'object' ||
      typeof candidate.buildInfo !== 'string' ||
      REQUIRED_REACT_LIBRARIES.some((name) => !react[name])
    )
      return cold;
    const libraryVersions = await reactLibraryVersions(standard, react);
    if (
      Object.keys(candidate.libraryVersions).length !== Object.keys(libraryVersions).length ||
      Object.entries(libraryVersions).some(
        ([name, version]) => candidate.libraryVersions?.[name] !== version,
      )
    )
      return cold;
    const buildInfo: unknown = JSON.parse(candidate.buildInfo);
    if (!isReactTypeCheckBuildInfo(buildInfo, libraryVersions)) return cold;
    const context: ReactIncrementalContext = { libraryVersions, buildInfo: candidate.buildInfo };
    // 学習者の検査結果を保存せず、各呼出しで固定seedだけから新規builderを作る。
    return (files) => processTypeScript(files, standard, true, undefined, react, context);
  } catch {
    return cold;
  }
}

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
  if (REQUIRED_REACT_LIBRARIES.some((name) => !reactLibraries[name]))
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
  incremental?: ReactIncrementalContext,
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
    ...(incremental ? { incremental: true, tsBuildInfoFile: BUILD_INFO } : {}),
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
      if (reusableRequest || incremental)
        Reflect.set(parsed, 'version', incremental?.libraryVersions[name] ?? source);
      return parsed;
    },
    getDefaultLibFileName: () => LIB_ROOT + DEFAULT_LIB,
    getCurrentDirectory: () => SOURCE_ROOT.slice(0, -1),
    getCanonicalFileName: (name) => name,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => '\n',
    fileExists: (name) => virtualFiles.has(name),
    readFile: (name) => (name === BUILD_INFO ? incremental?.buildInfo : virtualFiles.get(name)),
    directoryExists: (directory) =>
      [...virtualFiles.keys()].some((name) => name.startsWith(directory.replace(/\/$/u, '') + '/')),
    getDirectories: () => [],
    writeFile: (name, text) => {
      if (name === BUILD_INFO) {
        incremental?.writeBuildInfo?.(text);
        return;
      }
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
    if (incremental) {
      // seedと同名の入力も、以前のemit済み状態を引き継がず通常どおり変換する。
      if (incremental.buildInfo && sources.has(SOURCE_ROOT + SEED_FILE))
        return compileReactTypeScript(files, standardLibraries, reactLibraries ?? {});
      // global型や参照先を変える言語機能は拒否せず、従来の完全検査で扱う。
      projectSources = new Map(
        [...sources].map(([name, text]) => {
          const parsed = ts.createSourceFile(name, text, ts.ScriptTarget.ES2023);
          Reflect.set(parsed, 'version', text);
          return [name, parsed];
        }),
      );
      if (
        [...projectSources.values()].some(
          (source) =>
            !ts.isExternalModule(source) ||
            // TS6のフラグは常にfalseなので、実際の先頭コメントから検出する。
            ts
              .getLeadingCommentRanges(source.text, 0)
              ?.some((range) =>
                /^\/\/\/\s*<reference\b[^>]*\bno-default-lib\s*=/u.test(
                  source.text.slice(range.pos, range.end),
                ),
              ) ||
            source.referencedFiles.length > 0 ||
            source.typeReferenceDirectives.length > 0 ||
            source.libReferenceDirectives.length > 0 ||
            source.statements.some(
              (statement) =>
                ts.isModuleDeclaration(statement) || ts.isNamespaceExportDeclaration(statement),
            ),
        )
      )
        return compileReactTypeScript(files, standardLibraries, reactLibraries ?? {});
    }
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
    const incrementalBuilder = incremental
      ? ts.createIncrementalProgram({ rootNames: [...sources.keys()], options, host })
      : undefined;
    const activeBuilder = incrementalBuilder ?? builder;
    const program =
      activeBuilder?.getProgram() ?? ts.createProgram([...sources.keys()], options, host);
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
    const semantic = activeBuilder
      ? ts.sortAndDeduplicateDiagnostics(activeBuilder.getSemanticDiagnostics())
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
    const emit = incrementalBuilder ? incrementalBuilder.emit() : program.emit();
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
    if (incremental?.buildInfo)
      return compileReactTypeScript(files, standardLibraries, reactLibraries ?? {});
    return {
      status: 'environment-error',
      diagnostics: [
        { code: 0, message: '型検査を完了できませんでした。コードを保持して再試行してください。' },
      ],
    };
  }
}
