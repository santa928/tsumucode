import { URL } from 'node:url';

/** 実POST・可視状態・readonly保存履歴を照合する。固定文字列だけでは合格にしない。 */
export async function observeNextForm(page, origin, base, goal, memo, control) {
  const action = goal === 'server-action-validation';
  const path = action ? base.slice(0, -1) : `${base}api/note`;
  const input = page.getByLabel('メモ', { exact: true });
  const button = page.getByRole('button', { name: '保存する', exact: true });
  const result = page.locator('#note-result');
  const observations = [];
  let passed = true;
  const submit = async (value, expected, status, checkPending) => {
    await input.fill(value, { timeout: 1000 });
    const received = page
      .waitForResponse(
        (response) =>
          response.request().method() === 'POST' &&
          new URL(response.url()).origin === origin &&
          [path, ...(action ? [`${path}/`] : [])].includes(new URL(response.url()).pathname),
        { timeout: 2000 },
      )
      .catch(() => undefined);
    await button.click({ timeout: 1000 });
    if (checkPending) {
      // 初回保存は固定350ms待つ。入力と送信の双方が同じ入力を保護する。
      await page.waitForTimeout(75);
      const sending = page.getByRole('button', { name: '送信中…', exact: true });
      passed =
        (await sending.count()) === 1 &&
        (await sending.isDisabled()) &&
        (await input.isDisabled()) &&
        passed;
      if ((await sending.count()) === 1) await sending.evaluate((element) => element.click());
    }
    const response = await received;
    if (!response) return false;
    if ((await response.finished()) !== null) return false;
    passed = response.status() === status && passed;
    await result
      .locator(`xpath=self::*[@data-state="${expected}"]`)
      .waitFor({ state: 'visible', timeout: 1000 });
    passed = (await input.inputValue()) === value && !(await input.isDisabled()) && passed;
    observations.push(`${response.status()}:${await result.getAttribute('data-state')}`);
    return true;
  };
  try {
    if ((await input.count()) !== 1 || (await button.count()) !== 1) return incomplete();
    if (!(await submit('   ', 'invalid', action ? 200 : 400, false))) return incomplete();
    let state = await control('inspect');
    passed = state.invalidCalls === 0 && state.attempts === 0 && state.saved === 0 && passed;
    if (!(await submit(memo, 'failed', action ? 200 : 503, true))) return incomplete();
    state = await control('inspect');
    passed = state.invalidCalls === 0 && state.attempts === 1 && state.saved === 0 && passed;
    if (!(await submit(memo, 'saved', 200, true))) return incomplete();
    state = await control('inspect');
    const count = page.locator('#saved-count');
    passed =
      state.invalidCalls === 0 &&
      state.attempts === 2 &&
      state.saved === 1 &&
      (await count.count()) === 1 &&
      (await count.textContent())?.trim() === 'このメモの保存回数: 1' &&
      passed;
    await input.fill('別のメモ', { timeout: 1000 });
    passed =
      (await count.count()) === 0 && (await result.getAttribute('data-state')) === 'idle' && passed;
    return { passed, actual: observations.join(' / ') };
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') return incomplete();
    throw error;
  }
  function incomplete() {
    return { passed: false, actual: observations.join(' / ').slice(0, 512) };
  }
}
