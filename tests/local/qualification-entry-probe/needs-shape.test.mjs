// Synthetic input only. GitHub needs compatibility and source authentication are unverified.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inspectSyntheticNeeds } from './needs-shape.mjs';

const keys = ['unit', 'boundary', 'python_fixtures', 'browser', 'public_boundary', 'performance'];
const success = () => Object.fromEntries(keys.map((key) => [key, { result: 'success' }]));
const reject = (raw) =>
  assert.throws(
    () => inspectSyntheticNeeds(raw),
    (error) => {
      assert.equal(error.message, 'Synthetic needs shape rejected');
      assert.equal(error.cause, undefined);
      assert.equal(String(error.stack).includes('synthetic-private-marker'), false);
      return true;
    },
  );

test('six successful jobs accept shuffled keys without exposing values or granting authority', () => {
  const rows = Object.fromEntries(
    keys.toReversed().map((key) => [key, { result: 'success', outputs: {} }]),
  );
  const result = inspectSyntheticNeeds(JSON.stringify(rows));
  assert.deepEqual(result, { authorizationGranted: false });
  assert.ok(Object.isFrozen(result));
  assert.deepEqual(inspectSyntheticNeeds(JSON.stringify(success())), {
    authorizationGranted: false,
  });
});
for (const key of keys)
  test(`missing ${key} rejects`, () => {
    const value = success();
    delete value[key];
    reject(JSON.stringify(value));
  });
for (const result of ['failure', 'cancelled', 'skipped'])
  test(`${result} rejects`, () => {
    const value = success();
    value.python_fixtures.result = result;
    reject(JSON.stringify(value));
  });
test('unknown job, unknown field and nonempty output reject without exposing marker', () => {
  reject(JSON.stringify({ ...success(), 'synthetic-private-marker': { result: 'success' } }));
  const field = success();
  field.unit['synthetic-private-marker'] = 'synthetic-private-marker';
  reject(JSON.stringify(field));
  const output = success();
  output.unit.outputs = { 'synthetic-private-marker': 'synthetic-private-marker' };
  reject(JSON.stringify(output));
});
test('duplicate literal and escaped job keys reject rather than using the last value', () => {
  const tail = JSON.stringify(success()).slice(1);
  reject('{"unit":{"result":"failure"},' + tail);
  reject('{"u\\u006eit":{"result":"failure"},' + tail);
});
test('duplicate nested field rejects', () => {
  const raw = JSON.stringify(success()).replace(
    '"result":"success"',
    '"result":"failure","result":"success"',
  );
  reject(raw);
});
test('malformed, incorrect types and oversize data reject', () => {
  reject('{bad');
  reject('null');
  reject('[]');
  reject(' '.repeat(64 * 1024 + 1));
  const value = success();
  value.unit.outputs = null;
  reject(JSON.stringify(value));
});
