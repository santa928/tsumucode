import { test } from 'vitest';
import assert from 'node:assert/strict';
import { observeNextData } from './next-data-observations.mjs';
import { NextLessonObservationError } from './next-observation-error.mjs';

// 教材の遅い応答を採点基盤障害にせず、既存runを保持できる分類へ返す。
for (const goal of ['data-cache-revalidation', 'loading-error-not-found']) {
  test(`${goal}の表示期限超過を教材エラーへ分類する`, async () => {
    const timeout = Object.assign(new Error('timed out'), { name: 'TimeoutError' });
    const page = {
      locator: () => ({ count: async () => 0 }),
      url: () => 'http://127.0.0.1:4175/w/',
      waitForLoadState: async () => {
        throw timeout;
      },
      goto: async () => {
        throw timeout;
      },
      on: () => {},
      off: () => {},
    };
    const readHttp = async () => ({
      status: 200,
      type: 'application/json',
      body: JSON.stringify({ reset: true, counts: {}, history: {} }),
    });
    await assert.rejects(
      observeNextData(page, 'http://127.0.0.1:4175', '/w/', goal, readHttp),
      (error) => error instanceof NextLessonObservationError,
    );
  });
}
