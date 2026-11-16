// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  nativeGradeIdentity,
  isNativeGradeStarted,
  isNativeUnsupportedCompletion,
} from '../../e2e/helpers/pythonFixtureCoverage';

const files = { 'main.py': 'print(1)\n' };
const request = {
  apiVersion: 1,
  exerciseId: 'python-oop-ch03-l01-e01',
  runtimeProfileId: 'cpython-values-v1',
  runId: 'new-run',
  exerciseSessionId: 'session',
  executionRevision: 2,
  files,
};

describe('native Python fixture observation freshness', () => {
  it('requires the actual requested exercise, source and run identity', () => {
    expect(nativeGradeIdentity(request, request.exerciseId, files)).toEqual({
      runId: 'new-run',
      exerciseSessionId: 'session',
      executionRevision: 2,
    });
    expect(() => nativeGradeIdentity(request, 'other-exercise', files)).toThrow();
    expect(() => nativeGradeIdentity(request, request.exerciseId, { 'main.py': 'old' })).toThrow();
    expect(() =>
      nativeGradeIdentity({ ...request, runId: '' }, request.exerciseId, files),
    ).toThrow();
    expect(() =>
      nativeGradeIdentity(
        { ...request, files: { ...files, 'extra.py': '' } },
        request.exerciseId,
        files,
      ),
    ).toThrow();
    expect(() =>
      nativeGradeIdentity({ ...request, executionRevision: -1 }, request.exerciseId, files),
    ).toThrow();
  });

  it('accepts only this completed unsupported result, even when two messages are identical', () => {
    const identity = nativeGradeIdentity(request, request.exerciseId, files);
    const result = {
      state: 'completed',
      result: {
        ...identity,
        backend: 'local',
        engine: 'cpython',
        engineVersion: '3.14.2',
        status: 'unsupported',
      },
    };
    expect(isNativeUnsupportedCompletion(result, identity)).toBe(true);
    for (const changed of [
      { ...result, state: 'running' },
      { ...result, result: { ...result.result, runId: 'old-run' } },
      { ...result, result: { ...result.result, exerciseSessionId: 'old-session' } },
      { ...result, result: { ...result.result, executionRevision: 1 } },
      { ...result, result: { ...result.result, status: 'succeeded' } },
      { ...result, result: { ...result.result, engineVersion: '3.13.0' } },
      { ...result, result: { ...result.result, backend: 'browser' } },
      { ...result, result: { ...result.result, engine: 'node' } },
      { ...result, result: null },
    ])
      expect(isNativeUnsupportedCompletion(changed, identity)).toBe(false);
  });

  it('requires the created response to identify this running native grade', () => {
    const identity = nativeGradeIdentity(request, request.exerciseId, files);
    const started = { ...identity, state: 'running', backend: 'local', engine: 'cpython' };
    expect(isNativeGradeStarted(started, identity)).toBe(true);
    for (const changed of [
      { ...started, runId: 'old-run' },
      { ...started, exerciseSessionId: 'old-session' },
      { ...started, executionRevision: 1 },
      { ...started, state: 'completed' },
      { ...started, backend: 'browser' },
      { ...started, engine: 'node' },
      null,
    ])
      expect(isNativeGradeStarted(changed, identity)).toBe(false);
  });
});
