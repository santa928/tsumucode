const { URL, process } = globalThis;
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';

const target = new URL('./public-identity.mjs', import.meta.url).href;
function fake403(remaining, retryAfter) {
  const script = `
    globalThis.fetch = async (url, options) => {
      if (options.headers !== undefined) throw Error('PRIVATE_MARKER_unexpected_auth');
      return { ok: false, status: 403, headers: { get: key =>
        key === 'x-ratelimit-remaining' ? ${JSON.stringify(remaining)} :
        key === 'retry-after' ? ${JSON.stringify(retryAfter)} : null },
        json: async () => { throw Error('PRIVATE_MARKER_body_was_read'); } };
    };
    await import(${JSON.stringify(target)});
  `;
  return spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8', env: {} });
}
test('403 remains a failed identity check and reports only fixed rate-limit classes', () => {
  const result = fake403('0', 'PRIVATE_MARKER_header');
  assert.notEqual(result.status, 0);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /identity-http status=403 remaining=zero retry-after=present/);
  assert.match(result.stderr, /Identity read failed \(403\): \/repos\/santa928\/tsumucode\/deployments/);
  assert.doesNotMatch(result.stderr, /PRIVATE_MARKER/);
});
test('unusable rate-limit fields remain unknown and fail closed', () => {
  const result = fake403('PRIVATE_MARKER_bad_header', null);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /identity-http status=403 remaining=unknown retry-after=absent/);
  assert.doesNotMatch(result.stderr, /PRIVATE_MARKER/);
});
