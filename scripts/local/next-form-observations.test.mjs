// @vitest-environment node
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'vitest';
import { observeNextForm } from './next-form-observations.mjs';

/** HTTP/保存履歴の流れを保ち、role名が変わる時点だけを制御する合成page。 */
function formPage(mode = 'stable') {
  let submission = 0;
  let value = '';
  let pending = false;
  let responseReady;
  let state = 'idle';
  let disposed = 0;
  let duplicateProbes = 0;
  const input = {
    fill: async (next) => {
      value = next;
      state = 'idle';
    },
    isDisabled: async () => pending,
    inputValue: async () => value,
    count: async () => 1,
  };
  const button = {
    count: async () => 1,
    click: async () => {
      submission += 1;
      pending = submission > 1;
      responseReady({
        status: () => [400, 503, 200][submission - 1],
        finished: async () => {
          pending = false;
          state = ['invalid', 'failed', 'saved'][submission - 1];
          return null;
        },
      });
    },
  };
  const sendingHandle = {
    isDisabled: async () => {
      if (mode === 'detached')
        throw new Error('elementHandle.isDisabled: Element is not attached to the DOM');
      if (mode === 'transport-error') throw new Error('browser transport unavailable');
      return mode === 'stable';
    },
    evaluate: async () => {
      duplicateProbes += 1;
    },
    dispose: async () => {
      disposed += 1;
    },
  };
  const sending = {
    // 旧実装はcount後に名前で再検索し、nodeが改名済みなら待ち続ける。
    count: async () => (mode === 'missing' ? 0 : mode === 'multiple' ? 2 : 1),
    isDisabled: () => (mode === 'renamed' ? new Promise(() => {}) : Promise.resolve(true)),
    evaluate: async () => {
      duplicateProbes += 1;
    },
    elementHandles: async () =>
      mode === 'missing'
        ? []
        : mode === 'multiple'
          ? [sendingHandle, sendingHandle]
          : [sendingHandle],
  };
  const result = {
    locator: () => ({ waitFor: async () => {} }),
    getAttribute: async () => state,
  };
  const count = {
    count: async () => (value === 'memo' && submission === 3 ? 1 : 0),
    textContent: async () => 'このメモの保存回数: 1',
  };
  return {
    page: {
      getByLabel: () => input,
      getByRole: (_role, { name }) => (name === '保存する' ? button : sending),
      locator: (selector) => (selector === '#note-result' ? result : count),
      waitForResponse: () =>
        new Promise((resolve) => {
          responseReady = resolve;
        }),
      waitForTimeout: async () => {},
    },
    control: async () => ({
      invalidCalls: 0,
      attempts: submission - 1,
      saved: submission === 3 ? 1 : 0,
    }),
    counts: () => ({ disposed, duplicateProbes }),
  };
}

/** 合成HTTP flowを既存の観測入口へ渡す。実Browser/Nextの成功とは数えない。 */
async function observe(fixture) {
  return observeNextForm(
    fixture.page,
    'http://local.invalid',
    '/workspace/',
    'form-validation',
    'memo',
    fixture.control,
    () => {},
    async () => true,
  );
}

test('同じ送信中nodeでdisabledと重複送信防止を確認し、handleを解放する', async () => {
  const fixture = formPage();
  assert.deepEqual(await observe(fixture), {
    passed: true,
    actual: '400:invalid / 503:failed / 200:saved',
  });
  assert.deepEqual(fixture.counts(), { disposed: 2, duplicateProbes: 2 });
});

test('role名の変更後に再検索して待ち続けず、期限内に未達を返す', async () => {
  const fixture = formPage('renamed');
  const deadline = new globalThis.AbortController();
  try {
    const result = await Promise.race([
      observe(fixture),
      delay(200, { passed: false, actual: 'stale-locator-deadline' }, { signal: deadline.signal }),
    ]);
    assert.notEqual(result.actual, 'stale-locator-deadline');
    assert.equal(result.passed, false);
    assert.equal(fixture.counts().disposed, 2);
  } finally {
    deadline.abort();
  }
});

for (const mode of ['missing', 'multiple']) {
  test(`送信中nodeの${mode}を合格へ変換せずhandleを回収する`, async () => {
    const fixture = formPage(mode);
    assert.equal((await observe(fixture)).passed, false);
    assert.deepEqual(fixture.counts(), {
      disposed: mode === 'multiple' ? 4 : 0,
      duplicateProbes: 0,
    });
  });
}

test('観測中にnodeが切断された場合も待たずに未達としhandleを解放する', async () => {
  const fixture = formPage('detached');
  assert.equal((await observe(fixture)).passed, false);
  assert.deepEqual(fixture.counts(), { disposed: 1, duplicateProbes: 0 });
});

test('Browser接続障害を未達へ変換せずhandleを解放する', async () => {
  const fixture = formPage('transport-error');
  await assert.rejects(observe(fixture), /browser transport unavailable/u);
  assert.deepEqual(fixture.counts(), { disposed: 1, duplicateProbes: 0 });
});
