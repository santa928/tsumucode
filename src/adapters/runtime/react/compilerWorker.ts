/// <reference lib="webworker" />
import { compileReactTypeScript } from '../typescript/compileTypeScript';
import { analyzeInteractiveState } from './checkInteractiveStateSource';
import { isInteractiveStateScaffold } from './interactiveStateScaffold';
import { analyzeControlledForm } from './checkControlledFormSource';
import { isControlledFormScaffold } from './controlledFormScaffold';
import { analyzeReducer } from './checkReducerSource';
import { analyzeContext } from './checkContextSource';
import { isReducerContextScaffold } from './reducerContextScaffold';
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
  const profile = value.input.profile;
  const analysis =
    profile === 'reducer-form-v1'
      ? analyzeReducer(input.files['reducer.ts'] ?? '')
      : profile === 'context-sharing-v1'
        ? analyzeContext(input.files['components.tsx'] ?? '')
        : profile === 'controlled-form-v1'
          ? analyzeControlledForm(input.files['components.tsx'] ?? '')
          : profile === 'static-components-v1'
            ? analyzeStaticComponents(input.files['components.tsx'] ?? '')
            : profile === 'interactive-state-v1'
              ? analyzeInteractiveState(input.files['components.tsx'] ?? '')
              : undefined;
  const diagnostics = analysis
    ? Object.keys(input.files).sort().join(',') ===
        (profile === 'reducer-form-v1'
          ? 'components.tsx,main.tsx,reducer.ts,types.ts'
          : profile === 'context-sharing-v1'
            ? 'components.tsx,main.tsx,nameContext.ts,types.ts'
            : 'components.tsx,main.tsx,types.ts') &&
      (['reducer-form-v1', 'context-sharing-v1'].includes(profile)
        ? isReducerContextScaffold(input.files, profile)
        : profile === 'controlled-form-v1'
          ? isControlledFormScaffold(input.files)
          : profile === 'interactive-state-v1'
            ? isInteractiveStateScaffold(input.files)
            : isStaticComponentsScaffold(input.files))
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
