import assert from 'node:assert/strict';
import { test } from 'vitest';
import { parsePythonAnalysis } from './python-profile.mjs';
import { validateRun, PYTHON_PROFILE_ID, PYTHON_VERSION } from './protocol.mjs';

const profile = 'dataclass-test-project-v1';
const packet = {
  version: PYTHON_VERSION,
  supported: true,
  numericVariablePrinted: false,
  sameVariableAdditionPrinted: false,
  dataProjectTested: true,
};

test('データProject教材の信頼packetは固定版とbooleanの完全集合を要求する', () => {
  assert.deepEqual(parsePythonAnalysis(JSON.stringify(packet), '', 0, profile), packet);
  for (const changed of [
    { ...packet, version: '3.14.8' },
    { ...packet, dataProjectTested: 'true' },
    { ...packet, closed: true },
    { ...packet, dataProjectTested: undefined },
  ]) {
    assert.throws(() => parsePythonAnalysis(JSON.stringify(changed), '', 0, profile));
  }
  assert.throws(() => parsePythonAnalysis(JSON.stringify(packet), 'warning', 0, profile));
  assert.throws(() => parsePythonAnalysis(JSON.stringify(packet), '', 1, profile));
});

test('データProject教材は草稿Courseの現revisionと単一main.pyだけを要求する', () => {
  const request = {
    apiVersion: 1,
    exerciseId: 'python-practice-ch03-l01-e01',
    contentRevision: 'practice-r2',
    runtimeProfileId: PYTHON_PROFILE_ID,
    runId: 'data-project-run',
    exerciseSessionId: 'data-project-session',
    executionRevision: 1,
    files: { 'main.py': 'from io import StringIO\n' },
  };
  assert.equal(validateRun(request, 'js-r1', 'basics-r1', 'practice-r2'), request);
  assert.throws(
    () =>
      validateRun(
        { ...request, contentRevision: 'practice-r1' },
        'js-r1',
        'basics-r1',
        'practice-r2',
      ),
    { status: 409 },
  );
  assert.throws(
    () =>
      validateRun(
        { ...request, files: { ...request.files, 'resource.txt': '外部データ' } },
        'js-r1',
        'basics-r1',
        'practice-r2',
      ),
    { status: 400 },
  );
});
