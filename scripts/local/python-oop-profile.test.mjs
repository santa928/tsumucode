import assert from 'node:assert/strict';
import { test } from 'vitest';
import { parsePythonAnalysis } from './python-profile.mjs';
import { validateRun, PYTHON_PROFILE_ID, PYTHON_VERSION } from './protocol.mjs';

for (const profile of ['class-instance-lookup-v1', 'method-binding-comparison-v1']) {
  test(`${profile}の解析packetは固定版とbooleanの完全集合を要求する`, () => {
    const packet = {
      version: PYTHON_VERSION,
      supported: true,
      numericVariablePrinted: false,
      sameVariableAdditionPrinted: false,
      classInstanceCompared: true,
      methodsCompared: true,
    };
    assert.deepEqual(parsePythonAnalysis(JSON.stringify(packet), '', 0, profile), packet);
    for (const changed of [
      { ...packet, methodsCompared: 'true' },
      { ...packet, classInstanceCompared: undefined },
      { ...packet, version: '3.14.8' },
      { ...packet, extraFact: true },
    ]) {
      assert.throws(() => parsePythonAnalysis(JSON.stringify(changed), '', 0, profile));
    }
    assert.throws(() => parsePythonAnalysis(JSON.stringify(packet), 'warning', 0, profile));
    assert.throws(() => parsePythonAnalysis(JSON.stringify(packet), '', 1, profile));
  });
}

test('OOP教材は他Courseのrevisionを流用せず、固定main.pyだけを受け付ける', () => {
  const request = {
    apiVersion: 1,
    exerciseId: 'python-oop-ch01-l02-e01',
    contentRevision: 'oop-r1',
    runtimeProfileId: PYTHON_PROFILE_ID,
    runId: 'oop-run',
    exerciseSessionId: 'oop-session',
    executionRevision: 1,
    files: { 'main.py': 'print(3)\n' },
  };
  const validate = (changed) => validateRun(changed, 'js-r1', 'basics-r1', 'practice-r1', 'oop-r1');
  assert.equal(validate(request), request);
  assert.throws(() => validate({ ...request, contentRevision: 'practice-r1' }), { status: 409 });
  assert.throws(
    () => validate({ ...request, files: { ...request.files, 'extra.py': 'print(5)' } }),
    {
      status: 400,
    },
  );
  assert.throws(() => validateRun(request, 'js-r1', 'basics-r1', 'practice-r1'), { status: 409 });
});
