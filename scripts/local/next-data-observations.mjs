import { setTimeout as delay } from 'node:timers/promises';
import { URL } from 'node:url';
import { NextLessonObservationError } from './next-observation-error.mjs';

/** 固定制御APIの実履歴と、同じserverのHTTP/DOM/限定RSCを照合する。 */
export async function observeNextData(page, origin, base, goal, readHttp, completedResponse) {
  try {
    return await observe(page, origin, base, goal, readHttp, completedResponse);
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError')
      throw new NextLessonObservationError('固定pageの表示・操作が期限内に完了しません。');
    throw error;
  }
}

async function observe(page, origin, base, goal, readHttp, completedResponse) {
  const data = goal === 'data-cache-revalidation';
  const endpoint = data ? 'sample' : 'weather';
  const control = async (operation) => {
    const response = await readHttp(`${base}api/${endpoint}?control=${operation}`);
    if (response.status !== 200 || !response.type?.startsWith('application/json')) {
      throw new NextLessonObservationError('制御データの状態を取得できません。');
    }
    try {
      return JSON.parse(response.body.toString());
    } catch {
      throw new NextLessonObservationError('制御データのJSONを確認できません。');
    }
  };
  const text = async (selector) => {
    const locator = page.locator(selector);
    return (await locator.count()) === 1 && (await locator.isVisible())
      ? ((await locator.textContent()) ?? '').trim().slice(0, 128)
      : '';
  };
  const visible = async (selector) => {
    const locator = page.locator(selector);
    for (let index = 0; index < (await locator.count()); index++)
      if (await locator.nth(index).isVisible()) return true;
    return false;
  };
  const navigate = async (path) => {
    const response = await page
      .goto(origin + base + path, { waitUntil: 'load', timeout: 2500 })
      .catch(() => {
        throw new NextLessonObservationError('固定pageの実HTTP応答を取得できません。');
      });
    if (!response || response.status() !== 200 || page.url() !== origin + base + path) {
      throw new NextLessonObservationError('固定pageの実HTTP応答を確認できません。');
    }
  };
  if (data) {
    const observations = [];
    const read = async (mode) => {
      await navigate(`data/${mode}`);
      const value = { readId: Number(await text('#read-id')), label: await text('#data-label') };
      const state = await control('inspect');
      const entry = state.history?.[mode]?.find(
        (record) => record.readId === value.readId && record.label === value.label,
      );
      observations.push(`${mode}:${value.readId}`);
      return {
        ...value,
        valid: Number.isSafeInteger(value.readId) && value.readId > 0 && Boolean(entry),
        count: state.counts?.[mode] ?? 0,
      };
    };
    let passed = (await text('h1#message')) === '取得と保持を比べる';
    const before = await control('inspect');
    const first = await read('fresh');
    const second = await read('fresh');
    passed =
      first.valid &&
      second.valid &&
      first.readId !== second.readId &&
      first.count === (before.counts?.fresh ?? 0) + 1 &&
      second.count === first.count + 1 &&
      passed;
    const cached = await read('cached');
    const repeated = await read('cached');
    passed =
      cached.valid &&
      repeated.valid &&
      cached.readId === repeated.readId &&
      cached.label === repeated.label &&
      cached.count === repeated.count &&
      passed;
    // warmupのTTLが切れていた場合は、背景更新後の値を比較の基準にする。
    await read('revalidate');
    await delay(200);
    const baseline = await read('revalidate');
    const retained = await read('revalidate');
    passed = baseline.valid && retained.valid && baseline.readId === retained.readId && passed;
    await delay(1200);
    await read('revalidate');
    await delay(200);
    const updated = await read('revalidate');
    passed =
      updated.valid &&
      updated.readId !== baseline.readId &&
      updated.count > baseline.count &&
      passed;
    return { passed, actual: observations.join(' / ').slice(0, 512) };
  }
  const reset = await control('reset');
  if (reset.reset !== true)
    throw new NextLessonObservationError('初回失敗の条件を初期化できません。');
  let documents = 0;
  const document = (request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documents++;
  };
  page.on('request', document);
  const rsc = (response, state) => {
    const request = response.request();
    const url = new URL(response.url());
    return (
      url.pathname === base + `weather/${state}` &&
      url.searchParams.has('_rsc') &&
      request.method() === 'GET' &&
      request.headers().rsc === '1'
    );
  };
  const enter = async (state, name) => {
    if (page.url() !== origin + base) await navigate('');
    await page.waitForLoadState('networkidle', { timeout: 2000 });
    const before = documents;
    const link = page.getByRole('link', { name, exact: true });
    if ((await link.getAttribute('href')) !== base + `weather/${state}`) return undefined;
    const response = await Promise.all([
      page.waitForResponse((response) => rsc(response, state), { timeout: 2000 }),
      link.click({ timeout: 1000 }),
    ])
      .then(([response]) => response)
      .catch(() => undefined);
    if (documents !== before)
      throw new NextLessonObservationError('Nextの画面遷移が文書再読込へ変わりました。');
    return response &&
      (response.status() === 200 || (state === 'missing' && response.status() === 404))
      ? response
      : undefined;
  };
  // 完了前の部分応答や遷移先の差し替えを、画面の文字列だけで合格にしない。
  const completed = async (response, state) =>
    Boolean(response) &&
    (await completedResponse(response)) &&
    page.url() === origin + base + `weather/${state}`;
  const observations = [];
  let passed = (await text('h1#message')) === '待機・失敗・対象なし';
  try {
    const clear = await enter('clear', '正常な応答');
    if (clear)
      await page
        .locator('#weather')
        .waitFor({ timeout: 1000 })
        .catch(() => {});
    const normal = await text('#weather');
    passed = (await completed(clear, 'clear')) && normal === '晴れ' && passed;
    observations.push(normal);
    const initial = await control('inspect');
    passed =
      JSON.stringify(initial.history) === JSON.stringify([{ state: 'clear', status: 200 }]) &&
      passed;
    if (!passed) return { passed, actual: observations.join(' / ').slice(0, 512) };
    const slow = await enter('slow', '遅い応答');
    if (slow)
      await page
        .locator('[role="status"]')
        .waitFor({ timeout: 500 })
        .catch(() => {});
    const waiting = await text('[role="status"]');
    const unfinished = !(await visible('#weather'));
    if (slow)
      await page
        .locator('#weather')
        .waitFor({ timeout: 2500 })
        .catch(() => {});
    const result = await text('#weather');
    passed =
      (await completed(slow, 'slow')) &&
      waiting === '応答を待っています' &&
      result === '遅延後の晴れ' &&
      unfinished &&
      !(await visible('[role="status"]')) &&
      passed;
    observations.push(waiting, result);
    if (!passed) return { passed, actual: observations.join(' / ').slice(0, 512) };
    const flaky = await enter('flaky', '一度失敗');
    if (flaky)
      await page
        .getByRole('button', { name: '再試行', exact: true })
        .waitFor({ timeout: 1000 })
        .catch(() => {});
    const failed = await text('h1#message');
    const button = page.getByRole('button', { name: '再試行', exact: true });
    const usable = (await button.count()) === 1 && (await button.isVisible());
    let retried;
    if (usable) {
      await page.waitForLoadState('networkidle', { timeout: 2000 });
      const before = documents;
      retried = await Promise.all([
        page.waitForResponse((response) => rsc(response, 'flaky'), { timeout: 800 }),
        button.press('Enter', { timeout: 1000 }),
      ])
        .then(([response]) => response)
        .catch(() => undefined);
      if (documents !== before)
        throw new NextLessonObservationError('再試行中に文書が切り替わりました。');
      if (retried)
        await page
          .locator('#weather')
          .waitFor({ timeout: 1000 })
          .catch(() => {});
    }
    const recovered = await text('#weather');
    passed =
      (await completed(flaky, 'flaky')) &&
      (await completed(retried, 'flaky')) &&
      failed === '読み込み失敗' &&
      retried?.status() === 200 &&
      recovered === '再試行後の晴れ' &&
      passed;
    observations.push(failed, recovered);
    if (!passed) return { passed, actual: observations.join(' / ').slice(0, 512) };
    const missing = await enter('missing', '対象なし');
    if (missing)
      await page
        .getByRole('heading', { name: '対象が見つかりません', exact: true })
        .waitFor({ timeout: 500 })
        .catch(() => {});
    const absent = await text('h1#message');
    const noindex = await page
      .locator('meta[name="robots"]')
      .evaluateAll((elements) =>
        elements.some((element) => element.getAttribute('content')?.includes('noindex')),
      );
    passed =
      (await completed(missing, 'missing')) &&
      absent === '対象が見つかりません' &&
      noindex &&
      passed;
    observations.push(absent);
    const state = await control('inspect');
    const actual = state.history?.map((entry) => `${entry.state}:${entry.status}`);
    passed =
      JSON.stringify(actual) ===
        JSON.stringify(['clear:200', 'slow:200', 'flaky:503', 'flaky:200', 'missing:404']) &&
      passed;
    return { passed, actual: observations.join(' / ').slice(0, 512) };
  } finally {
    page.off('request', document);
  }
}
