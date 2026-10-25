// @vitest-environment node
// OFF対照がBrowser観測を初期化しない契約をNode環境で検証する。
import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  cookieNetworkErrorClass,
  installChromiumObserver,
} from './next-cookie-transport-observations.mjs';

test('CDP OFFではContextやFrameのAPIを一度も読まず、観測を初期化しない', async () => {
  const inaccessible = new Proxy(
    {},
    {
      get() {
        throw new Error('Browser observation must remain disabled');
      },
    },
  );
  const observer = await installChromiumObserver(inaccessible, { enabled: false });
  observer.begin(inaccessible, 1, [], 'read');
  observer.end(inaccessible, 1);
});

test('Request失敗は既知の固定分類だけを返し、任意の例外本文を残さない', () => {
  for (const error of [
    'net::ERR_ABORTED',
    'net::ERR_INSUFFICIENT_RESOURCES',
    'net::ERR_NETWORK_CHANGED',
  ])
    assert.equal(cookieNetworkErrorClass(error), error);
  for (const error of [
    undefined,
    null,
    'https://private.invalid/?token=private',
    'unexpected input',
  ])
    assert.equal(cookieNetworkErrorClass(error), 'other');
});
