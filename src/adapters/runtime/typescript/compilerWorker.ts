/// <reference lib="webworker" />

import { compileTypeScript } from './compileTypeScript';
import { isCompilerWorkerRequest } from './workerContract';
import { checkScoreNumberAnnotation } from './checkScoreNumberAnnotation';
import { checkScoreNumberInference } from './checkScoreNumberInference';
import { checkQuestionInterface } from './checkQuestionInterface';
import { checkConditionalLearning } from './checkConditionalLearning';
import { checkReusableLearning } from './checkReusableLearning';

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
  const value = event.data;
  if (!isCompilerWorkerRequest(value)) return;
  self.postMessage({
    kind: value.kind,
    requestId: value.requestId,
    sessionId: value.input.sessionId,
    revision: value.input.revision,
    result:
      value.kind === 'compile'
        ? compileTypeScript(value.input.files, libraries)
        : value.profile === 'number-callback-v1' ||
            value.profile === 'generic-identity-v1' ||
            value.profile === 'readonly-copy-v1'
          ? checkReusableLearning(value.input.files, libraries, value.profile)
          : value.profile === 'union-result-v1' || value.profile === 'optional-hint-v1'
            ? checkConditionalLearning(value.input.files, libraries, value.profile)
            : value.profile === 'question-interface-v1'
              ? checkQuestionInterface(value.input.files, libraries)
              : value.profile === 'score-number-inference-v1'
                ? checkScoreNumberInference(value.input.files, libraries)
                : checkScoreNumberAnnotation(value.input.files, libraries),
  });
};
