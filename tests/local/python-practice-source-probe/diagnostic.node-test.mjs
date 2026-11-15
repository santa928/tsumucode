import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import test from 'node:test';
import { formatFailure } from './diagnostic.ts';

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
