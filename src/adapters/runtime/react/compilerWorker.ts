/// <reference lib="webworker" />
import { compileReactTypeScript } from '../typescript/compileTypeScript';
import { checkPropsSource } from './checkPropsSource';
import { isReactCompileInput } from './compilerContract';
import { analyzeStaticComponents } from './checkStaticComponentsSource';
import { isStaticComponentsScaffold } from './staticComponentsScaffold';

// 固定lockのlibだけを読む。学習者のURLやnpm指定を受け付けない。
const sources = import.meta.glob<string>('/node_modules/typescript/lib/lib.*.d.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
});
const libraries = Object.fromEntries(
  Object.entries(sources).map(([name, source]) => [name.slice(name.lastIndexOf('/') + 1), source]),
);
const fixedTypes = import.meta.glob<string>(
  [
    '/node_modules/@types/react/index.d.ts',
    '/node_modules/@types/react/global.d.ts',
    '/node_modules/@types/react/jsx-runtime.d.ts',
    '/node_modules/@types/react-dom/index.d.ts',
    '/node_modules/@types/react-dom/client.d.ts',
    '/node_modules/csstype/index.d.ts',
  ],
  { query: '?raw', import: 'default', eager: true },
);
const reactLibraries = Object.fromEntries(
  Object.entries(fixedTypes).map(([name, source]) => [
    name.replace('/node_modules/@types/', '').replace('/node_modules/', ''),
    source,
  ]),
);

/** compileだけのstrict要求を同じ世代へ返す。学習者コードはWorkerで実行しない。 */
self.onmessage = (event: MessageEvent<unknown>): void => {
  if (!event.data || typeof event.data !== 'object') return;
  const value = event.data as Record<string, unknown>;
  if (
    Object.keys(value).sort().join(',') !== 'input,kind,requestId' ||
    value.kind !== 'compile' ||
    typeof value.requestId !== 'string' ||
    !value.requestId ||
    value.requestId.length > 128 ||
    !isReactCompileInput(value.input) ||
    !value.input.profile
  )
    return;
  const input = value.input;
  const analysis =
    input.profile === 'static-components-v1'
      ? analyzeStaticComponents(input.files['components.tsx'] ?? '')
      : undefined;
  const diagnostics = analysis
    ? Object.keys(input.files).sort().join(',') === 'components.tsx,main.tsx,types.ts' &&
      isStaticComponentsScaffold(input.files)
      ? analysis.diagnostics
      : [{ code: 0, message: '読み取り専用の起動処理と型定義を元に戻してください。' }]
    : checkPropsSource(input.files);
  const compiled = diagnostics.length
    ? { status: 'type-error', diagnostics }
    : compileReactTypeScript(input.files, libraries, reactLibraries);
  self.postMessage({
    kind: 'compile',
    requestId: value.requestId,
    sessionId: value.input.sessionId,
    revision: value.input.revision,
    result:
      compiled.status === 'ready' && analysis ? { ...compiled, facts: analysis.facts } : compiled,
  });
};
