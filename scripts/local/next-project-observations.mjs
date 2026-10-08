import { URL } from 'node:url';

/** 教材のHTTP/表示/操作失敗を、採点基盤の障害と区別する。 */
export class NextLessonObservationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'NextLessonObservationError';
  }
}

/** #133の固定URLと操作をtrusted Browserで読む。教材の自己申告は採用しない。 */
export async function observeNextLesson(page, origin, base, goal) {
  let navigations = 0;
  let documentRequests = 0;
  let lastUrl = page.url();
  const navigated = (frame) => {
    if (frame !== page.mainFrame() || frame.url() === lastUrl) return;
    lastUrl = frame.url();
    navigations++;
  };
  const requested = (request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documentRequests++;
  };
  // Nextの同じURLへのreplaceStateは無害。文書再読込はrequestで別途検出する。
  page.on('framenavigated', navigated);
  page.on('request', requested);
  let phase = { navigations, documentRequests };
  const changed = () =>
    navigations !== phase.navigations || documentRequests !== phase.documentRequests;
  const assertPhase = () => {
    if (changed())
      throw new NextLessonObservationError('観測中に文書が切り替わりました。再判定してください。');
  };
  const beginPhase = () => {
    phase = { navigations, documentRequests };
  };
  // DOMやイベント観測中の予定外遷移は、同じSource版でも合格へ採用しない。
  const stable = async (operation) => {
    assertPhase();
    try {
      return await operation();
    } finally {
      // context破棄による例外終了でも、文書切替を教材側の失敗として返す。
      assertPhase();
    }
  };
  const visibleText = (selector) =>
    stable(async () => {
      const locator = page.locator(selector);
      if ((await locator.count()) !== 1 || !(await locator.isVisible())) return '';
      return ((await locator.textContent()) ?? '').trim().slice(0, 128);
    });
  const documentResponse = (response, path) =>
    response &&
    response.status() === 200 &&
    response.url() === origin + base + path &&
    response.frame() === page.mainFrame() &&
    response.request().isNavigationRequest() &&
    page.url() === origin + base + path;
  const navigate = async (path, reload = false) => {
    assertPhase();
    const before = navigations;
    const beforeRequests = documentRequests;
    const changes = page.url() === origin + base + path ? 0 : 1;
    const response = reload
      ? await page.reload({ waitUntil: 'load', timeout: 3000 })
      : await page.goto(origin + base + path, { waitUntil: 'load', timeout: 3000 });
    if (!documentResponse(response, path))
      throw new NextLessonObservationError(
        `固定pageのHTTP応答が失敗しました（${response?.status() ?? '応答なし'}）。`,
      );
    await page.waitForLoadState('networkidle', { timeout: 2000 });
    if (navigations !== before + changes || documentRequests !== beforeRequests + 1)
      throw new NextLessonObservationError('予定した文書遷移以外が発生しました。');
    beginPhase();
  };
  const follow = async (name, path) => {
    const link = page.getByRole('link', { name, exact: true });
    const matching = await stable(async () => {
      if ((await link.count()) !== 1 || !(await link.isVisible())) return false;
      const href = await link.getAttribute('href');
      try {
        return Boolean(href) && new URL(href, page.url()).href === origin + base + path;
      } catch {
        return false;
      }
    });
    if (!matching) return false;
    const before = navigations;
    const beforeRequests = documentRequests;
    const changes = page.url() === origin + base + path ? 0 : 1;
    const [response] = await Promise.all([
      page.waitForNavigation({ waitUntil: 'load', timeout: 3000 }),
      link.click({ timeout: 2000 }),
    ]);
    // historyだけの同一文書変更はresponseがないため、文書遷移の合格にしない。
    if (!documentResponse(response, path)) {
      if (
        response === null &&
        page.url() === origin + base + path &&
        navigations === before + changes &&
        documentRequests === beforeRequests
      ) {
        // 指定URLのhistory変更は合格にせず、直接アクセスの観測で続ける。
        beginPhase();
        return false;
      }
      throw new NextLessonObservationError(
        `リンク先のHTTP応答が失敗しました（${response?.status() ?? '応答なし'}）。`,
      );
    }
    await page.waitForLoadState('networkidle', { timeout: 2000 });
    if (navigations !== before + changes || documentRequests !== beforeRequests + 1)
      throw new NextLessonObservationError('リンク操作中に予定外の文書遷移が発生しました。');
    beginPhase();
    return true;
  };
  const observations = [];
  try {
    if (goal === 'nested-dynamic-navigation') {
      let passed = (await visibleText('h1#message')) === '旅行の入口';
      passed = (await stable(() => page.locator('#trip-layout').count())) === 0 && passed;
      const entrance = await follow('旅行一覧へ', 'trips');
      passed = entrance && passed;
      if (!entrance) await navigate('trips');
      const layout = await visibleText('#trip-layout');
      passed =
        layout === '旅行ノート' && (await visibleText('h1#message')) === '旅行一覧' && passed;
      observations.push(layout);
      for (const [slug, name] of [
        ['forest', '森の旅へ'],
        ['sea', '海の旅へ'],
      ]) {
        if (!page.url().endsWith('/trips')) await navigate('trips');
        const linked = await follow(name, `trips/${slug}`);
        passed = linked && passed;
        if (!linked) await navigate(`trips/${slug}`);
        const actual = await visibleText('#trip-slug');
        passed = actual === slug && (await visibleText('#trip-layout')) === '旅行ノート' && passed;
        observations.push(actual);
        await navigate(`trips/${slug}`);
        await navigate(`trips/${slug}`, true);
        passed =
          (await visibleText('#trip-slug')) === slug &&
          (await visibleText('#trip-layout')) === '旅行ノート' &&
          passed;
        passed = (await follow('旅行一覧へ', 'trips')) && passed;
      }
      return { passed, actual: observations.join(' / ') };
    }
    if (goal === 'server-client-counter') {
      const note = await visibleText('#server-note');
      const initial = await visibleText('#count');
      const button = page.getByRole('button', { name: '数を増やす', exact: true });
      let passed =
        (await visibleText('h1#message')) === 'ServerとClientの役割' &&
        note === 'server-note.txt' &&
        initial === '2';
      observations.push(note, initial);
      const usable = await stable(
        async () => (await button.count()) === 1 && (await button.isVisible()),
      );
      if (!usable) return { passed: false, actual: observations.join(' / ') };
      for (const expected of ['3', '4']) {
        await stable(async () => {
          await button.click({ timeout: 2000 });
          await page.evaluate(
            () =>
              new Promise((resolve) =>
                globalThis.requestAnimationFrame(() => globalThis.requestAnimationFrame(resolve)),
              ),
          );
        });
        const actual = await visibleText('#count');
        observations.push(actual);
        passed = actual === expected && passed;
      }
      await navigate('', true);
      passed = (await visibleText('#count')) === '2' && passed;
      return { passed, actual: observations.join(' / ') };
    }
    throw new Error('未対応のNext判定です。');
  } catch (error) {
    if (changed() && !(error instanceof NextLessonObservationError))
      throw new NextLessonObservationError('予定した文書遷移の観測を完了できません。');
    if (error instanceof Error && error.name === 'TimeoutError')
      throw new NextLessonObservationError('固定pageの表示・操作が期限内に完了しません。');
    throw error;
  } finally {
    page.off('framenavigated', navigated);
    page.off('request', requested);
  }
}
