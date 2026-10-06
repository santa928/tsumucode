/// <reference lib="webworker" />
import { compileReactTypeScript } from '../typescript/compileTypeScript';
import { checkPropsSource } from './checkPropsSource';
import { isReactCompileInput } from './compilerContract';

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
    !isReactCompileInput(value.input)
  )
    return;
  const diagnostics = checkPropsSource(value.input.files);
  self.postMessage({
    kind: 'compile',
    requestId: value.requestId,
    sessionId: value.input.sessionId,
    revision: value.input.revision,
    result: diagnostics.length
      ? { status: 'type-error', diagnostics }
      : compileReactTypeScript(value.input.files, libraries, reactLibraries),
  });
};
