import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { classifyIdentityResponse } from './identity-http-diagnostic.mjs';
const response = (status, entries) => ({ status, headers: { get: key => entries[key] ?? null } });

test('classifies zero remaining and retry-after without exposing values', () => {
  assert.equal(classifyIdentityResponse(response(403, { 'x-ratelimit-remaining': '0', 'retry-after': '123' })),
    'identity-http status=403 remaining=zero retry-after=present');
  assert.equal(classifyIdentityResponse(response(429, { 'x-ratelimit-remaining': '47' })),
    'identity-http status=429 remaining=nonzero retry-after=absent');
});
test('omits arbitrary header values, status text, response body and credentials', () => {
  const marker = 'PRIVATE_MARKER_nonpublic_url_code';
  const out = classifyIdentityResponse(response(403, { 'x-ratelimit-remaining': marker, 'retry-after': marker, authorization: marker }));
  assert.equal(out, 'identity-http status=403 remaining=unknown retry-after=present');
  assert.doesNotMatch(out, /PRIVATE_MARKER|nonpublic|url_code/);
});
test('invalid or missing data cannot be classified as rate-limit exhaustion', () => {
  for (const x of [response(403, {}), response(500, { 'x-ratelimit-remaining': '-1' }), { status: 403 }, null]) {
    assert.doesNotMatch(classifyIdentityResponse(x), /remaining=zero/);
  }
});
