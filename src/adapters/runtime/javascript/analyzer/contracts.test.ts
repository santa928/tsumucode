import { describe, expect, it } from 'vitest';
import { isAnalyzerWorkerResponse } from './contracts';

/** 単一Factを持つstrictなAnalyzer成功responseを作る。 */
function analyzerResponse(fact: Readonly<Record<string, unknown>>): unknown {
  return {
    type: 'result',
    result: {
      status: 'success',
      requestId: 'data-fact-request',
      exerciseSessionId: 'javascript:data-fact-exercise',
      executionRevision: 1,
      file: 'script.js',
      instrumentedCode: 'const questions = [];',
      sourceSha256: 'a'.repeat(64),
      facts: [{ ...fact, file: 'script.js', line: 1, column: 1 }],
      diagnostics: [],
    },
  };
}

describe('JavaScript Data Source Fact worker contract', () => {
  it.each([
    { kind: 'collection', collectionKind: 'array', entryCount: 3 },
    { kind: 'collection-access', accessKind: 'index' },
    { kind: 'destructuring', patternKind: 'object', bindingCount: 2 },
    {
      kind: 'collection-transform',
      method: 'map',
      callbackParameterCount: 1,
    },
    { kind: 'immutable-update', updateKind: 'object-spread' },
    { kind: 'module-boundary', boundaryKind: 'export', name: 'questions' },
    { kind: 'error-flow', flowKind: 'catch' },
  ])('$kindをstrictなWorker responseとして受理する', (fact) => {
    expect(isAnalyzerWorkerResponse(analyzerResponse(fact))).toBe(true);
  });

  it.each([
    { kind: 'collection', collectionKind: 'array', entryCount: 65 },
    { kind: 'destructuring', patternKind: 'object', bindingCount: -1 },
    {
      kind: 'collection-transform',
      method: 'sort',
      callbackParameterCount: 1,
    },
    { kind: 'module-boundary', boundaryKind: 'import', name: '' },
    { kind: 'error-flow', flowKind: 'finally', unexpected: true },
  ])('bounded union外のData Factを拒否する: $kind', (fact) => {
    expect(isAnalyzerWorkerResponse(analyzerResponse(fact))).toBe(false);
  });
});
