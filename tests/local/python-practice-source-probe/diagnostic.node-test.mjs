import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { spawnSync } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { countTechnicalRechecks, formatFailure } from './diagnostic.ts';

test('only fixed stages and error categories are emitted', () => {
  assert.equal(
    formatFailure('reader', Object.assign(new Error('private-marker'), { code: 'ENOENT' })),
    'practice-public-reader=failed; stage=reader; kind=ENOENT; child=other; reason=other\n',
  );
  assert.equal(
    formatFailure('compile', Object.assign(new Error('private-marker'), { code: 128 })),
    'practice-public-reader=failed; stage=compile; kind=child-nonzero; child=other; reason=other\n',
  );
  assert.equal(
    formatFailure(
      'private-marker',
      Object.assign(new Error('private-marker'), { code: 'untrusted' }),
    ),
    'practice-public-reader=failed; stage=unknown; kind=other; child=other; reason=other\n',
  );
  assert.equal(
    formatFailure('receipt', null),
    'practice-public-reader=failed; stage=receipt; kind=other; child=other; reason=other\n',
  );
  const throwingCode = new Error('private-marker');
  Object.defineProperty(throwingCode, 'code', {
    get() {
      throw new Error('private-marker');
    },
  });
  const throwingPrototype = new Proxy(
    {},
    {
      getPrototypeOf() {
        throw new Error('private-marker');
      },
    },
  );
  for (const error of [throwingCode, throwingPrototype]) {
    assert.equal(
      formatFailure('reader', error),
      'practice-public-reader=failed; stage=reader; kind=other; child=other; reason=other\n',
    );
  }
  const childFailure = (cmd, stderr) =>
    Object.assign(new Error('private-marker'), { code: 128, cmd, stderr });
  assert.equal(
    formatFailure(
      'reader',
      childFailure(
        'git rev-parse private-marker',
        Buffer.from('fatal: detected dubious ownership'),
      ),
    ),
    'practice-public-reader=failed; stage=reader; kind=child-nonzero; child=git-rev-parse; reason=dubious-owner\n',
  );
  assert.equal(
    formatFailure('reader', childFailure('git show private-marker', 'fatal: bad object')),
    'practice-public-reader=failed; stage=reader; kind=child-nonzero; child=git-show; reason=missing-object\n',
  );
  assert.equal(
    formatFailure('reader', childFailure('private-marker', 'private-marker')),
    'practice-public-reader=failed; stage=reader; kind=child-nonzero; child=other; reason=other\n',
  );
  assert.equal(
    formatFailure(
      'reader',
      childFailure('git archive private-marker', 'x'.repeat(8193) + 'permission denied'),
    ),
    'practice-public-reader=failed; stage=reader; kind=child-nonzero; child=git-archive; reason=other\n',
  );
});

test('technical rechecks report only five bounded counts and reject invalid rows', () => {
  const first = 'python-practice/python-practice-ch01-l01';
  const last = 'python-practice/python-practice-ch03-l01';
  assert.deepEqual(countTechnicalRechecks([]), [0, 0, 0, 0, 0]);
  assert.deepEqual(
    countTechnicalRechecks([
      { lesson: first, scopes: ['exercise', 'persistence'] },
      { lesson: last, scopes: ['navigation'] },
    ]),
    [2, 0, 0, 0, 1],
  );
  for (const rows of [
    [{ lesson: 'private-marker', scopes: ['exercise'] }],
    [{ lesson: first, scopes: ['private-marker'] }],
    [{ lesson: first, scopes: [] }],
    [{ lesson: first, scopes: ['exercise', 'exercise'] }],
    [
      { lesson: first, scopes: ['exercise'] },
      { lesson: first, scopes: ['navigation'] },
    ],
  ])
    assert.throws(() => countTechnicalRechecks(rows));
});

test('only the fixed workspace passes the isolated git trust check', () => {
  let directory = realpathSync('/tmp');
  for (;;) {
    assert.equal(existsSync(path.join(directory, '.git')), false);
    const parent = path.dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  function accepted(value) {
    const env = {
      PATH: '/usr/bin:/bin',
      HOME: '/tmp',
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_COUNT: '1',
      GIT_CONFIG_KEY_0: 'safe.directory',
      GIT_CONFIG_VALUE_0: value,
    };
    const result = spawnSync('/usr/bin/git', ['config', '--get-all', 'safe.directory'], {
      cwd: '/tmp',
      env,
      encoding: 'utf8',
    });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0);
    return result.stdout === '/workspace\n';
  }
  assert.equal(accepted('/workspace'), true);
  assert.equal(accepted('/another-directory'), false);
  assert.equal(accepted('*'), false);
});
