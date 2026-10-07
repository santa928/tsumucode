import { parse, type Node } from 'acorn';
import { full } from 'acorn-walk';
import MagicString from 'magic-string';
import { JavaScriptAnalyzerClient } from '../javascript/analyzer/JavaScriptAnalyzerClient';
import type {
  JavaScriptAnalysisInput,
  JavaScriptAnalysisResult,
} from '../javascript/analyzer/contracts';
import { resolveJavaScriptModuleSpecifier } from '../javascript/analyzer/modulePath';
import trustedSource from 'virtual:tsumucode-react-preview-source';
import type { ReactProfile } from './compilerContract';

export const REACT_MODULE_FILE = 'tsumucode-react-runtime.js';
const STUB = `
export const Fragment = null;
export function jsx() {}
export function jsxs() {}
export function createRoot() {}
export function useState() {}
`;
const PACKAGES: Readonly<Record<string, readonly string[]>> = {
  'react/jsx-runtime': ['jsx', 'jsxs', 'Fragment'],
  'react-dom/client': ['createRoot'],
};

/** bare importを固定exportへ閉じ、相対TSX参照をemit済みJSへ結ぶ。動的importは許可しない。 */
export function prepareReactModules(
  files: Readonly<Record<string, string>>,
  profile: ReactProfile = 'props-card-v1',
): Readonly<Record<string, string>> {
  if (Object.hasOwn(files, REACT_MODULE_FILE)) throw new Error('React予約Fileと衝突しています');
  const output: Record<string, string> = {};
  for (const [file, source] of Object.entries(files)) {
    const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module' });
    const edited = new MagicString(source);
    full(ast, (node: Node) => {
      if (node.type === 'ImportExpression') throw new Error('動的importはこの課題で使えません');
      if (
        !['ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration'].includes(node.type)
      )
        return;
      const value = node as Node & {
        source?: { value: unknown; start: number; end: number };
        specifiers?: readonly { type: string; imported?: { name?: string; value?: unknown } }[];
      };
      if (!value.source) return;
      const specifier = value.source.value;
      if (typeof specifier !== 'string') throw new Error('Module参照が不正です');
      const fixed =
        specifier === 'react' && ['interactive-state-v1', 'controlled-form-v1'].includes(profile)
          ? ['useState']
          : Object.hasOwn(PACKAGES, specifier)
            ? PACKAGES[specifier]
            : undefined;
      let resolved: string | undefined;
      if (fixed) {
        if (
          node.type !== 'ImportDeclaration' ||
          !value.specifiers?.length ||
          value.specifiers.some(
            (item) =>
              item.type !== 'ImportSpecifier' ||
              !fixed.includes(String(item.imported?.name ?? item.imported?.value)),
          )
        )
          throw new Error('この課題で指定した固定React exportだけをimportできます');
        resolved = REACT_MODULE_FILE;
      } else {
        const jsSpecifier = /\.tsx?$/u.test(specifier)
          ? specifier.replace(/\.tsx?$/u, '.js')
          : specifier.endsWith('.js')
            ? specifier
            : specifier + '.js';
        resolved = resolveJavaScriptModuleSpecifier(file, jsSpecifier);
        if (!resolved || resolved === REACT_MODULE_FILE || !Object.hasOwn(files, resolved))
          throw new Error('Workspace内のTSX/TSと固定React以外はimportできません');
      }
      const fromDirectory = file.split('/').slice(0, -1);
      const relative = '../'.repeat(fromDirectory.length) + resolved;
      edited.overwrite(
        value.source.start,
        value.source.end,
        JSON.stringify(fromDirectory.length ? relative : './' + relative),
      );
    });
    output[file] = edited.toString();
  }
  return { ...output, [REACT_MODULE_FILE]: STUB };
}

/** 全learner moduleを通常Analyzerで検査し、信頼側の予約stubだけ固定bundleへ差し替える。 */
export class ReactModuleAnalyzer {
  readonly #client = new JavaScriptAnalyzerClient();

  async analyze(input: JavaScriptAnalysisInput): Promise<JavaScriptAnalysisResult> {
    if (
      !('files' in input) ||
      input.sourceType !== 'module' ||
      input.files[REACT_MODULE_FILE] !== STUB
    )
      throw new Error('React Analyzer入力の予約moduleが一致しません');
    const result = await this.#client.analyze(input);
    if (result.status !== 'success' || !('modules' in result)) return result;
    const reserved = result.modules.filter((item) => item.file === REACT_MODULE_FILE);
    if (reserved.length !== 1 || reserved[0]?.dependencies.length)
      throw new Error('React固定moduleの解析境界が一致しません');
    // 固定module内のlexical通知だけを結ぶ。hashは実行ごとのguard名を除いた同一意味のtemplateを含む。
    // lockDownしたwindow APIや通知をLearner向けexportへ開放しない。
    const trustedNotification =
      'const __tsumucodeReportReactError = error => $GUARD.reportError(error);\n';
    const trustedCode =
      trustedNotification.replace('$GUARD', input.guardIdentifier) + trustedSource;
    const modules = result.modules.map((item) =>
      item.file === REACT_MODULE_FILE ? { ...item, instrumentedCode: trustedCode } : item,
    );
    const source = JSON.stringify([
      'tsumucode-react-module-graph-v1',
      result.graphSha256,
      trustedNotification,
      trustedSource,
    ]);
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source));
    const graphSha256 = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, '0'),
    ).join('');
    return { ...result, modules, graphSha256 };
  }

  /** 停止時にWorkerと保留解析をまとめて破棄する。 */
  dispose(): Promise<void> {
    return this.#client.dispose();
  }
}
