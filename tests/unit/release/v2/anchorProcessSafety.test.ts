// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  assertSafeAnchorEnvironment,
  assertVisibleAnchorIndex,
  isolatedAnchorGitEnvironment,
} from '../../../../scripts/release/v2/anchorProcessSafety';

const safe = {
  PATH: '/usr/bin:/bin',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_NO_REPLACE_OBJECTS: '1',
  GIT_OPTIONAL_LOCKS: '0',
};

describe('anchor launcher environment defense in depth', () => {
  it('accepts only the specified path and Git configuration', () => {
    expect(() => {
      assertSafeAnchorEnvironment(safe);
    }).not.toThrow();
    expect(isolatedAnchorGitEnvironment()).toEqual({
      ...safe,
      LC_ALL: 'C',
      GIT_TERMINAL_PROMPT: '0',
    });
  });

  it.each([
    ['PATH', '/tmp/attacker:/usr/bin:/bin'],
    ['GIT_CONFIG_GLOBAL', '/tmp/gitconfig'],
    ['GIT_CONFIG_COUNT', '1'],
    ['GIT_CONFIG_PARAMETERS', 'injected'],
    ['GIT_DIR', '/tmp/other-repo'],
    ['NODE_OPTIONS', '--require=/tmp/injected.js'],
    ['NODE_PATH', '/tmp/modules'],
    ['npm_config_userconfig', '/tmp/npmrc'],
    ['LD_PRELOAD', '/tmp/injected.so'],
    ['DYLD_INSERT_LIBRARIES', '/tmp/injected.dylib'],
    ['TAR_OPTIONS', '--checkpoint-action=exec=bad'],
    ['HTTPS_PROXY', 'https://invalid.example'],
    ['SSL_CERT_FILE', '/tmp/injected.pem'],
    ['GH_TOKEN', 'not-a-real-token'],
    ['TMPDIR', '/tmp/other'],
  ])('rejects a conflicting %s value', (name, value) => {
    expect(() => {
      assertSafeAnchorEnvironment({ ...safe, [name]: value });
    }).toThrow(/Unsafe anchor/);
  });
});

describe('anchor Git index visibility', () => {
  it('accepts ordinary visible index entries', () => {
    expect(() => {
      assertVisibleAnchorIndex('H one.ts\0H folder/two.ts\0');
    }).not.toThrow();
    expect(() => {
      assertVisibleAnchorIndex('');
    }).not.toThrow();
  });
  it.each(['h hidden.ts\0', 'S skipped.ts\0', 'H good.ts\0S skipped.ts\0', 'H bad.ts'])(
    'rejects hidden or malformed entries: %s',
    (value) => {
      expect(() => {
        assertVisibleAnchorIndex(value);
      }).toThrow('Unsafe anchor Git index flags');
    },
  );
});
