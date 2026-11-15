import type { TestInfo } from '@playwright/test';
import { loadAuthoringCourse } from '../../../scripts/content/compileCourse';
import {
  createPythonFixtureObservations,
  type PythonFixtureExecution,
} from '../../../scripts/release/v2/pythonCoverage';
let source: ReturnType<typeof loadAuthoringCourse> | undefined;

type NativeGradeIdentity = {
  readonly runId: string;
  readonly exerciseSessionId: string;
  readonly executionRevision: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Bind the actual grade request to the fixture whose result will be recorded. */
export function nativeGradeIdentity(
  value: unknown,
  exerciseId: string,
  expectedFiles: Readonly<Record<string, string>>,
): NativeGradeIdentity {
  if (!isRecord(value) || !isRecord(value['files'])) throw Error('Invalid native grade request');
  const files = value['files'];
  if (
    value['apiVersion'] !== 1 ||
    value['runtimeProfileId'] !== 'cpython-values-v1' ||
    value['exerciseId'] !== exerciseId ||
    Object.keys(files).length !== Object.keys(expectedFiles).length ||
    Object.entries(expectedFiles).some(
      ([key, content]) => !Object.hasOwn(files, key) || files[key] !== content,
    ) ||
    typeof value['runId'] !== 'string' ||
    value['runId'].length === 0 ||
    typeof value['exerciseSessionId'] !== 'string' ||
    value['exerciseSessionId'].length === 0 ||
    typeof value['executionRevision'] !== 'number' ||
    !Number.isSafeInteger(value['executionRevision']) ||
    value['executionRevision'] < 0
  )
    throw Error('Native grade request differs from fixture');
  return {
    runId: value['runId'],
    exerciseSessionId: value['exerciseSessionId'],
    executionRevision: value['executionRevision'],
  };
}

/** Reject another run, session, revision or engine even if its displayed alert matches. */
export function isNativeGradeStarted(value: unknown, identity: NativeGradeIdentity): boolean {
  return (
    isRecord(value) &&
    value['state'] === 'running' &&
    value['runId'] === identity.runId &&
    value['exerciseSessionId'] === identity.exerciseSessionId &&
    value['executionRevision'] === identity.executionRevision &&
    value['backend'] === 'local' &&
    value['engine'] === 'cpython'
  );
}

export function isNativeUnsupportedCompletion(
  value: unknown,
  identity: NativeGradeIdentity,
): boolean {
  if (!isRecord(value) || value['state'] !== 'completed' || !isRecord(value['result']))
    return false;
  const result = value['result'];
  return (
    result['runId'] === identity.runId &&
    result['exerciseSessionId'] === identity.exerciseSessionId &&
    result['executionRevision'] === identity.executionRevision &&
    result['backend'] === 'local' &&
    result['engine'] === 'cpython' &&
    result['engineVersion'] === '3.14.2' &&
    result['status'] === 'unsupported'
  );
}

/** Runtime evidence only, never a learner-review receipt. No submitted Source appears in the attachment. */
export async function attachPythonFixtureCoverage(info: TestInfo, actual: PythonFixtureExecution) {
  if (info.project.name === 'firefox' || info.project.name === 'webkit') return;
  const authoring = await (source ??= loadAuthoringCourse('content/python-basics'));
  await info.attach('release-fixtures-v1', {
    body: JSON.stringify(createPythonFixtureObservations(authoring, actual)),
    contentType: 'application/json',
  });
}
