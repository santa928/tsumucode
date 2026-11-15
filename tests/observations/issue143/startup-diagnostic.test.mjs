import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyStartup, classifySources } from './startup-diagnostic.mjs';

test('reports only fixed pattern categories and never arbitrary log text', () => {
  for (const [sample, expected] of [
    ['ERR_REQUIRE_ASYNC_MODULE PRIVATE_MARKER', 'pattern-seen-async-require'],
    ['Error: require() cannot be used on an ESM graph with top-level await PRIVATE_MARKER', 'pattern-seen-async-require'],
    ['ERR_REQUIRE_ESM PRIVATE_MARKER', 'pattern-seen-esm-require'],
    ['MODULE_NOT_FOUND PRIVATE_MARKER', 'pattern-seen-module-not-found'],
    ['ERR_MODULE_NOT_FOUND PRIVATE_MARKER', 'pattern-seen-module-not-found'],
    ['No tests found PRIVATE_MARKER', 'pattern-seen-no-tests'],
    ['Cannot use import statement outside a module PRIVATE_MARKER', 'pattern-seen-module-syntax'],
    ["Unexpected token 'export' PRIVATE_MARKER", 'pattern-seen-module-syntax'],
    ['ERR_REQUIRE_ESM MODULE_NOT_FOUND PRIVATE_MARKER', 'pattern-seen-multiple'],
    ['arbitrary PRIVATE_MARKER', 'no-whitelisted-pattern'],
  ]) assert.equal(classifyStartup(sample), expected);
});

test('rejects changed source hashes without echoing them', () => {
  assert.equal(classifySources('482cd0e6ddcd50022b81fadf8b4df3d644e60454fb4b5f28673e37', 'PRIVATE_MARKER'), false);
  assert.equal(classifySources('482cd0e6ddcd50022b81fadf8b4df3d644e60454fb4b5f28673d86746be45e37', 'e77ef537f8be948853e472f6851e5e0e938694d3711705aed527c835e14170ea'), true);
});
