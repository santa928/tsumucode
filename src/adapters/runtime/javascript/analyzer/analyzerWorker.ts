/// <reference lib="webworker" />

import { analyzeJavaScriptSource } from './instrumentJavaScript';
import {
  isJavaScriptAnalysisRequest,
  type AnalyzerWorkerRequest,
  type AnalyzerWorkerResponse,
} from './contracts';

interface AnalyzerWorkerScope {
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  postMessage(message: AnalyzerWorkerResponse): void;
}

const workerScope = globalThis as unknown as AnalyzerWorkerScope;

/** 検証済みrequestだけを解析し、identity付きresultを親へ返す。 */
workerScope.onmessage = (event: MessageEvent<unknown>): void => {
  const message = event.data;
  if (typeof message !== 'object' || message === null) return;
  const candidate = message as Readonly<Record<string, unknown>>;
  if (candidate.type !== 'analyze' || !isJavaScriptAnalysisRequest(candidate.request)) return;
  const request: AnalyzerWorkerRequest = { type: 'analyze', request: candidate.request };
  void analyzeJavaScriptSource(request.request).then((result) => {
    workerScope.postMessage({ type: 'result', result });
  });
};
