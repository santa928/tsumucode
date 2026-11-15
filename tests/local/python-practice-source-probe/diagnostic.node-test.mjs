import assert from 'node:assert/strict';
import test from 'node:test';
import { formatFailure } from './diagnostic.ts';

test('only fixed stages and error categories are emitted', () => {
  assert.equal(
    formatFailure('reader', Object.assign(new Error('private-marker'), { code: 'ENOENT' })),
    'practice-public-reader=failed; stage=reader; kind=ENOENT\n',
  );
  assert.equal(
    formatFailure('compile', Object.assign(new Error('private-marker'), { code: 128 })),
    'practice-public-reader=failed; stage=compile; kind=child-nonzero\n',
  );
  assert.equal(
    formatFailure(
      'private-marker',
      Object.assign(new Error('private-marker'), { code: 'untrusted' }),
    ),
    'practice-public-reader=failed; stage=unknown; kind=other\n',
  );
  assert.equal(
    formatFailure('receipt', null),
    'practice-public-reader=failed; stage=receipt; kind=other\n',
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
      'practice-public-reader=failed; stage=reader; kind=other\n',
    );
  }
});
