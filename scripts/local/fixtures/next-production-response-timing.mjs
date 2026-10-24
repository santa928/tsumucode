import assert from 'node:assert/strict';
import console from 'node:console';
import process from 'node:process';
import { setTimeout } from 'node:timers';
import { setTimeout as delay } from 'node:timers/promises';
import { observeNextProduction } from '../next-production-observations.mjs';

// 実観測関数の非同期境界だけを検査する。Next・HTTP・教材の合格を模擬しない。
const [surface, timing] = process.argv.slice(2);
const origin = 'http://127.0.0.1:4175';
const base = '/response-timing/';
const frame = {};
let currentUrl = origin + base;
let pendingPath;
let responses = 0;

/** 文書応答の最小契約を返す。実通信の成功証拠には使わない。 */
function response(url) {
  return {
    status: () => 200,
    url: () => url,
    request: () => ({ isNavigationRequest: () => true, method: () => 'GET' }),
    frame: () => frame,
    finished: async () => null,
  };
}

/** 存在確認と制御したfocus遅延だけを持つLocator境界。 */
function locator(count = 0, href = '', controlled = false) {
  return {
    count: async () => count,
    isVisible: async () => true,
    textContent: async () => '',
    getAttribute: async () => href,
    selectOption: async () => {},
    focus: async () => {
      if (!controlled) return;
      if (timing === 'focus-first') throw new Error('Controlled focus failure');
      if (timing === 'response-first') await delay(30);
    },
  };
}

const page = {
  on: () => {},
  off: () => {},
  mainFrame: () => frame,
  url: () => currentUrl,
  title: async () => '表示内容はこのタイミング検査の対象外',
  locator: () => locator(),
  getByLabel: () => locator(1),
  getByRole: (role, { name }) => {
    if (role === 'link' && name === '一覧を開く' && surface === 'link')
      return locator(1, base + 'trips', true);
    if (role === 'button') return locator(1, '', surface === 'filter');
    return locator();
  },
  goto: async (url) => {
    currentUrl = url;
    return response(url);
  },
  waitForLoadState: async () => {},
  keyboard: {
    press: async () => {
      currentUrl = origin + base + pendingPath;
    },
  },
  waitForResponse: (predicate, { timeout }) => {
    assert.equal(timeout, 2000, '実装のHTTP期限は延長しない');
    const index = responses++;
    const firstLink = surface === 'link' && index === 0;
    const filterIndex = index - (surface === 'link' ? 1 : 0);
    pendingPath = firstLink ? 'trips' : `trips?area=${filterIndex === 0 ? 'outdoor' : 'indoor'}`;
    const reply = response(origin + base + pendingPath);
    const controlled = firstLink || surface === 'filter';
    return new Promise((resolve, reject) => {
      setTimeout(
        () => {
          if (controlled && timing !== 'normal') {
            const error = new Error('Controlled response deadline');
            error.name = 'TimeoutError';
            reject(error);
          } else {
            assert.equal(predicate(reply), true);
            resolve(reply);
          }
        },
        timing === 'focus-first' || timing === 'response-after' ? 10 : 1,
      );
    });
  },
};

let result;
try {
  const observed = await observeNextProduction(page, origin, base, 'trip-project', () => {});
  result = { kind: 'returned', checks: observed.projectChecks.length };
} catch (error) {
  result = { kind: 'thrown', name: error.name };
}
// focusが先に失敗した場合も、後続response拒否が未処理にならないことを観測する。
await delay(50);
console.log(JSON.stringify(result));
