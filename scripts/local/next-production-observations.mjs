import { NextLessonObservationError } from './next-observation-error.mjs';

/** 制作の3工程を実文書・GET送信・画像応答で別々に観測する。 */
export async function observeNextProduction(page, origin, base, goal, step) {
  const capstone = goal === 'capstone-event-project';
  const section = capstone ? 'events' : 'trips';
  const title = capstone ? '読書会の案内' : '小さな旅の案内';
  const listing = capstone ? '読書会一覧' : '旅の一覧';
  const names = capstone ? ['朝の読書会', '夕方の読書会'] : ['森の散歩', '海の資料館'];
  const ids = capstone ? ['morning', 'evening'] : ['forest', 'sea'];
  const values = capstone ? ['open', 'full'] : ['outdoor', 'indoor'];
  const key = capstone ? 'availability' : 'area';
  const checks = [];
  let documents = 0;
  const requested = (request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documents++;
  };
  page.on('request', requested);
  const text = async (selector) => {
    const locator = page.locator(selector);
    return (await locator.count()) === 1 && (await locator.isVisible())
      ? ((await locator.textContent()) ?? '').trim().slice(0, 160)
      : '';
  };
  const stable = async (operation) => {
    const before = documents;
    const unchanged = () => {
      if (documents !== before)
        throw new NextLessonObservationError('工程の観測中に文書が切り替わりました。');
    };
    try {
      const value = await operation();
      unchanged();
      return value;
    } catch (error) {
      unchanged();
      throw error;
    }
  };
  const documentResponse = async (response, path) =>
    Boolean(
      response &&
      response.status() === 200 &&
      response.url() === origin + base + path &&
      response.request().isNavigationRequest() &&
      response.frame() === page.mainFrame() &&
      (await response.finished()) === null &&
      page.url() === origin + base + path,
    );
  const navigate = async (path) => {
    const reply = await page.goto(origin + base + path, { waitUntil: 'load', timeout: 2000 });
    if (!(await documentResponse(reply, path)))
      throw new NextLessonObservationError('制作の実URL応答を確認できません。');
  };
  const follow = async (name, path) => {
    const link = page.getByRole('link', { name, exact: true });
    if (
      (await link.count()) !== 1 ||
      !(await link.isVisible()) ||
      (await link.getAttribute('href')) !== base + path
    )
      return false;
    const response = page.waitForResponse(
      (reply) => reply.url() === origin + base + path && reply.request().isNavigationRequest(),
      { timeout: 2000 },
    );
    await link.focus();
    await page.keyboard.press('Enter');
    const valid = await documentResponse(await response, path);
    await page.waitForLoadState('load', { timeout: 2000 });
    return valid;
  };
  try {
    // metadata/画像は入口で読み、後工程の成否と独立して残す。
    step('project-presentation');
    const presentation = await stable(async () => {
      const image = page.locator('main img');
      const description = page.locator('meta[name="description"]');
      const metadata =
        (await description.count()) === 1 ? await description.getAttribute('content') : undefined;
      const expectedAlt = capstone
        ? '山と太陽のある読書会のイラスト'
        : '山と太陽のある旅のイラスト';
      return (
        (await page.title()) === title &&
        typeof metadata === 'string' &&
        metadata.includes(title) &&
        metadata !== '制作途中' &&
        (await image.count()) === 1 &&
        (await image.isVisible()) &&
        (await image.getAttribute('src')) === base + 'banner.svg' &&
        (await image.getAttribute('alt')) === expectedAlt &&
        (await image.getAttribute('width')) === '320' &&
        (await image.getAttribute('height')) === '160' &&
        (await image.evaluate((element) => element.complete && element.naturalWidth === 320)) &&
        (await page.locator('main').count()) === 1 &&
        (await page.locator('h1').count()) === 1 &&
        (await text('h1#message')) === title
      );
    });
    step('project-structure');
    let structure = await follow('一覧を開く', section);
    if (!structure) await navigate(section);
    structure = (await stable(() => text('h1#message'))) === listing && structure;
    for (let i = 0; i < ids.length; i++) {
      if (page.url() !== origin + base + section) await navigate(section);
      const linked = await follow(names[i], section + '/' + ids[i]);
      structure = linked && structure;
      if (!linked) await navigate(section + '/' + ids[i]);
      structure = await stable(
        async () =>
          (await text('h1#message')) === names[i] &&
          (await text(capstone ? '#booking-state' : '#area')) ===
            (capstone ? (i === 0 ? '受付中' : '受付終了') : i === 0 ? '屋外' : '室内') &&
          structure,
      );
      structure = (await follow('一覧へ戻る', section)) && structure;
    }
    checks.push({
      goal: 'project-structure',
      passed: structure,
      actual: structure
        ? '入口→一覧→別々の2詳細→一覧を実文書で確認'
        : '一覧・詳細・戻る経路を確認してください。',
    });

    step('project-filter');
    let filter = true;
    for (let i = 0; i < values.length; i++) {
      if (page.url() !== origin + base + section) await navigate(section);
      const select = page.getByLabel(capstone ? '受付状況' : '過ごす場所', { exact: true });
      const button = page.getByRole('button', { name: '絞り込む', exact: true });
      if ((await select.count()) !== 1 || (await button.count()) !== 1) {
        filter = false;
        continue;
      }
      await stable(() => select.selectOption(values[i]));
      const path = `${section}?${key}=${values[i]}`;
      const response = page.waitForResponse(
        (reply) =>
          reply.url() === origin + base + path &&
          reply.request().method() === 'GET' &&
          reply.request().isNavigationRequest(),
        { timeout: 2000 },
      );
      await button.focus();
      await page.keyboard.press('Enter');
      filter = (await documentResponse(await response, path)) && filter;
      await page.waitForLoadState('load', { timeout: 2000 });
      filter = await stable(
        async () =>
          (await text('h1#message')) === listing &&
          (await page.locator('main li').count()) === 1 &&
          (await page.getByRole('link', { name: names[i], exact: true }).count()) === 1 &&
          (await page.getByRole('link', { name: names[1 - i], exact: true }).count()) === 0 &&
          filter,
      );
    }
    await navigate(`${section}?${key}=unknown`);
    filter = await stable(
      async () =>
        (await text('main [role="alert"]')) === '選択を確認してください。' &&
        (await page.locator('main li').count()) === 0 &&
        filter,
    );
    filter = (await follow('一覧へ戻る', section)) && filter;
    checks.push({
      goal: 'project-filter',
      passed: filter,
      actual: filter
        ? '2種類のGET選択・不正値・一覧への回復を確認'
        : 'GETの選択結果と不正値からの回復を確認してください。',
    });
    checks.push({
      goal: 'project-presentation',
      passed: Boolean(presentation),
      actual: presentation
        ? 'title/description・固定画像の実表示・alt/寸法を確認'
        : '入口のmetadata・画像・読み順を確認してください。',
    });
    return {
      passed: checks.every((check) => check.passed),
      projectChecks: checks,
      actual: checks
        .map(
          (check, index) =>
            `${['構造', 'GET選択', '文書と画像'][index]}:${check.passed ? '達成' : '未達成'}`,
        )
        .join(' / '),
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError')
      throw new NextLessonObservationError('制作の実URL・操作が期限内に完了しません。');
    throw error;
  } finally {
    page.off('request', requested);
  }
}
