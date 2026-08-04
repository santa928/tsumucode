import type { RunnerDiagnostic } from '../../../../core/runtime/contracts';

export type JavaScriptSourceType = 'script' | 'module';
export type JavaScriptCapabilityProfileId = 'core' | 'modules' | 'dom' | 'async' | 'project';

export interface JavaScriptAnalysisInput {
  readonly exerciseSessionId: string;
  readonly executionRevision: number;
  readonly file: string;
  readonly source: string;
  readonly sourceType: JavaScriptSourceType;
  readonly capabilityProfile: JavaScriptCapabilityProfileId;
  readonly guardIdentifier: string;
}

export interface JavaScriptAnalysisRequest extends JavaScriptAnalysisInput {
  readonly requestId: string;
}

export interface QuerySelectorTextContentAssignmentFact {
  readonly kind: 'query-selector-text-content-assignment';
  readonly selector: string;
  readonly value: string;
  readonly file: string;
  readonly line: number;
  readonly column: number;
}

export interface JavaScriptFactLocation {
  readonly file: string;
  readonly line: number;
  readonly column: number;
}

export type JavaScriptSourceFact =
  | (JavaScriptFactLocation & {
      readonly kind: 'binding';
      readonly name: string;
      readonly declarationKind: 'const' | 'let' | 'var';
    })
  | (JavaScriptFactLocation & { readonly kind: 'branch'; readonly branchKind: 'if' | 'switch' })
  | (JavaScriptFactLocation & {
      readonly kind: 'loop';
      readonly loopKind: 'for' | 'for-of' | 'for-in' | 'while' | 'do-while';
    })
  | (JavaScriptFactLocation & {
      readonly kind: 'function';
      readonly functionKind: 'declaration' | 'expression' | 'arrow';
      readonly parameterCount: number;
    })
  | (JavaScriptFactLocation & { readonly kind: 'call'; readonly callee: string })
  | (JavaScriptFactLocation & {
      readonly kind: 'scope';
      readonly scopeKind: 'program' | 'function' | 'block';
      readonly depth: number;
    })
  | (JavaScriptFactLocation & { readonly kind: 'closure'; readonly capturedName: string })
  | QuerySelectorTextContentAssignmentFact;

interface JavaScriptAnalysisIdentity {
  readonly requestId: string;
  readonly exerciseSessionId: string;
  readonly executionRevision: number;
  readonly file: string;
}

export interface JavaScriptAnalysisSuccess extends JavaScriptAnalysisIdentity {
  readonly status: 'success';
  readonly instrumentedCode: string;
  readonly sourceSha256: string;
  readonly facts: readonly JavaScriptSourceFact[];
  readonly diagnostics: readonly [];
}

export interface JavaScriptAnalysisFailure extends JavaScriptAnalysisIdentity {
  readonly status: 'failure';
  readonly diagnostics: readonly RunnerDiagnostic[];
}

export type JavaScriptAnalysisResult = JavaScriptAnalysisSuccess | JavaScriptAnalysisFailure;

export interface AnalyzerWorkerRequest {
  readonly type: 'analyze';
  readonly request: JavaScriptAnalysisRequest;
}

export interface AnalyzerWorkerResponse {
  readonly type: 'result';
  readonly result: JavaScriptAnalysisResult;
}

/** Browser WorkerとTest doubleに共通する最小port。 */
export interface AnalyzerWorkerPort {
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(message: unknown): void;
  terminate(): void;
}

/** unknown値をprototype非依存のRecordへ絞り込む。 */
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Workerへ渡せるboundedな解析要求かを検証する。 */
export function isJavaScriptAnalysisRequest(value: unknown): value is JavaScriptAnalysisRequest {
  if (!isRecord(value)) return false;
  if (
    JSON.stringify(Object.keys(value).sort()) !==
    JSON.stringify([
      'capabilityProfile',
      'executionRevision',
      'exerciseSessionId',
      'file',
      'guardIdentifier',
      'requestId',
      'source',
      'sourceType',
    ])
  ) {
    return false;
  }
  return (
    typeof value.requestId === 'string' &&
    value.requestId.length > 0 &&
    value.requestId.length <= 128 &&
    typeof value.exerciseSessionId === 'string' &&
    value.exerciseSessionId.length > 0 &&
    value.exerciseSessionId.length <= 256 &&
    Number.isSafeInteger(value.executionRevision) &&
    Number(value.executionRevision) >= 0 &&
    typeof value.file === 'string' &&
    value.file.length > 0 &&
    value.file.length <= 256 &&
    typeof value.source === 'string' &&
    (value.sourceType === 'script' || value.sourceType === 'module') &&
    ['core', 'modules', 'dom', 'async', 'project'].includes(String(value.capabilityProfile)) &&
    typeof value.guardIdentifier === 'string' &&
    /^[$A-Z_a-z][$\w]*$/u.test(value.guardIdentifier)
  );
}

/** RunnerDiagnosticのWorker境界で必要なscalarだけを検証する。 */
function isRunnerDiagnostic(value: unknown): value is RunnerDiagnostic {
  if (!isRecord(value)) return false;
  return (
    typeof value.code === 'string' &&
    ['syntax', 'reference', 'security', 'system'].includes(String(value.kind)) &&
    ['warning', 'error'].includes(String(value.severity)) &&
    typeof value.message === 'string' &&
    typeof value.learnerMessage === 'string' &&
    (value.file === undefined || typeof value.file === 'string') &&
    (value.line === undefined || Number.isSafeInteger(value.line)) &&
    (value.column === undefined || Number.isSafeInteger(value.column))
  );
}

/** Validatorへ渡すsource factのstrictな形を検証する。 */
function isJavaScriptSourceFact(value: unknown): value is JavaScriptSourceFact {
  if (!isRecord(value)) return false;
  const locationIsValid =
    typeof value.file === 'string' &&
    value.file.length > 0 &&
    value.file.length <= 256 &&
    Number.isSafeInteger(value.line) &&
    Number(value.line) >= 1 &&
    Number.isSafeInteger(value.column) &&
    Number(value.column) >= 1;
  if (!locationIsValid) return false;
  const hasKeys = (keys: readonly string[]): boolean =>
    JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
  const bounded = (candidate: unknown): candidate is string =>
    typeof candidate === 'string' && candidate.length <= 128;
  switch (value.kind) {
    case 'binding':
      return (
        hasKeys(['column', 'declarationKind', 'file', 'kind', 'line', 'name']) &&
        bounded(value.name) &&
        ['const', 'let', 'var'].includes(String(value.declarationKind))
      );
    case 'branch':
      return (
        hasKeys(['branchKind', 'column', 'file', 'kind', 'line']) &&
        (value.branchKind === 'if' || value.branchKind === 'switch')
      );
    case 'loop':
      return (
        hasKeys(['column', 'file', 'kind', 'line', 'loopKind']) &&
        ['for', 'for-of', 'for-in', 'while', 'do-while'].includes(String(value.loopKind))
      );
    case 'function':
      return (
        hasKeys(['column', 'file', 'functionKind', 'kind', 'line', 'parameterCount']) &&
        ['declaration', 'expression', 'arrow'].includes(String(value.functionKind)) &&
        Number.isSafeInteger(value.parameterCount) &&
        Number(value.parameterCount) >= 0 &&
        Number(value.parameterCount) <= 32
      );
    case 'call':
      return hasKeys(['callee', 'column', 'file', 'kind', 'line']) && bounded(value.callee);
    case 'scope':
      return (
        hasKeys(['column', 'depth', 'file', 'kind', 'line', 'scopeKind']) &&
        ['program', 'function', 'block'].includes(String(value.scopeKind)) &&
        Number.isSafeInteger(value.depth) &&
        Number(value.depth) >= 0 &&
        Number(value.depth) <= 256
      );
    case 'closure':
      return (
        hasKeys(['capturedName', 'column', 'file', 'kind', 'line']) && bounded(value.capturedName)
      );
    case 'query-selector-text-content-assignment':
      return (
        hasKeys(['column', 'file', 'kind', 'line', 'selector', 'value']) &&
        bounded(value.selector) &&
        bounded(value.value)
      );
    default:
      return false;
  }
}

/** Worker responseがstrictな成功／失敗契約かを検証する。 */
export function isAnalyzerWorkerResponse(value: unknown): value is AnalyzerWorkerResponse {
  if (!isRecord(value) || value.type !== 'result' || !isRecord(value.result)) return false;
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify(['result', 'type']))
    return false;
  const result = value.result;
  const diagnostics = result.diagnostics;
  if (
    !Array.isArray(diagnostics) ||
    diagnostics.length > 32 ||
    !diagnostics.every(isRunnerDiagnostic)
  ) {
    return false;
  }
  const commonIdentity =
    typeof result.requestId === 'string' &&
    typeof result.exerciseSessionId === 'string' &&
    Number.isSafeInteger(result.executionRevision) &&
    Number(result.executionRevision) >= 0 &&
    typeof result.file === 'string';
  if (!commonIdentity) return false;
  if (result.status === 'failure') {
    return (
      JSON.stringify(Object.keys(result).sort()) ===
        JSON.stringify([
          'diagnostics',
          'executionRevision',
          'exerciseSessionId',
          'file',
          'requestId',
          'status',
        ]) && diagnostics.length > 0
    );
  }
  return (
    result.status === 'success' &&
    JSON.stringify(Object.keys(result).sort()) ===
      JSON.stringify([
        'diagnostics',
        'executionRevision',
        'exerciseSessionId',
        'facts',
        'file',
        'instrumentedCode',
        'requestId',
        'sourceSha256',
        'status',
      ]) &&
    diagnostics.length === 0 &&
    typeof result.instrumentedCode === 'string' &&
    typeof result.sourceSha256 === 'string' &&
    /^[a-f0-9]{64}$/u.test(result.sourceSha256) &&
    Array.isArray(result.facts) &&
    result.facts.length <= 256 &&
    result.facts.every(isJavaScriptSourceFact)
  );
}
