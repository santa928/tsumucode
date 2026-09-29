/// <reference lib="webworker" />

import { compileTypeScript } from './compileTypeScript';
import { isTypeScriptCompileInput, type CompilerWorkerRequest } from './workerContract';

// 標準libとcompilerはこのWorkerだけが読む。学習者指定URLや外部CDNは使わない。
const librarySources = import.meta.glob<string>('/node_modules/typescript/lib/lib.*.d.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
});
const libraries = Object.fromEntries(
  Object.entries(librarySources).map(([name, source]) => [
    name.slice(name.lastIndexOf('/') + 1),
    source,
  ]),
);

/** 入力契約を検証し、元のsession/revision/request IDと型検査結果を返す。 */
self.onmessage = (event: MessageEvent<unknown>): void => {
  const value = event.data as Partial<CompilerWorkerRequest> | null;
  if (
    !value ||
    typeof value.requestId !== 'string' ||
    value.requestId.length > 128 ||
    !isTypeScriptCompileInput(value.input)
  )
    return;
  self.postMessage({
    requestId: value.requestId,
    sessionId: value.input.sessionId,
    revision: value.input.revision,
    result: compileTypeScript(value.input.files, libraries),
  });
};
