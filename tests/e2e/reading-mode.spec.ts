import { readStoredProgress, seedCompletedProgress } from './helpers/progress';
import { expect, test } from '@playwright/test';

const PILOT = './#/library/pilot';
const CLOSURE = `${PILOT}/javascript/lessons/javascript-ch03-l05/read`;
const KEY = 'tsumucode-reading-v1';

test('3Lessonを通読し、同じ端末の読書位置とあとで試すを復元する', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const lessons: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/lessons/')) lessons.push(request.url());
  });
  await page.addInitScript(() => {
    Reflect.set(window, '__readingIdbOpens', 0);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- callで元のIDBFactory receiverを維持する。
    const original = IDBFactory.prototype.open;
    IDBFactory.prototype.open = function (name, version) {
      Reflect.set(
        window,
        '__readingIdbOpens',
        Number(Reflect.get(window, '__readingIdbOpens')) + 1,
      );
      return version === undefined ? original.call(this, name) : original.call(this, name, version);
    };
  });
  await page.goto(PILOT);
  await expect(page.getByRole('heading', { name: '試用レッスンの目次' })).toBeVisible();
  await expect(page.getByRole('link', { name: /^一続きに読む/u })).toHaveCount(11);
  await page.getByRole('link', { name: '一続きに読む：Closureが覚える値を観測する' }).click();
  await expect(page.locator('[data-reading-section]')).toHaveCount(4);
  const section = page.locator('[data-reading-section="javascript-ch03-l05-s03"]');
  await section.scrollIntoViewIfNeeded();
  await page.evaluate(() => {
    document.querySelector('[data-reading-section="javascript-ch03-l05-s03"]')?.scrollIntoView();
  });
  await expect
    .poll(() =>
      page.evaluate(
        (key) =>
          JSON.parse(localStorage.getItem(key) ?? '{}') as { positions?: { slideId: string }[] },
        KEY,
      ),
    )
    .toMatchObject({ positions: [{ slideId: 'javascript-ch03-l05-s03' }] });
  await page.goto(PILOT);
  await page.getByRole('link', { name: /JavaScript.*読書の続きから/u }).click();
  await expect(page).toHaveURL(/slide=javascript-ch03-l05-s03/u);
  await expect(section).toBeInViewport();
  await page.screenshot({ path: '/evidence/issue22-closure-resume-mobile.png' });
  expect(await page.evaluate(() => Number(Reflect.get(window, '__readingIdbOpens')))).toBe(0);
  await page.getByRole('button', { name: 'あとで試す印をつける' }).first().click();
  await expect(page.getByRole('button', { name: 'あとで試す印を外す' })).toHaveCount(1);
  await expect(
    page.getByText('コードや進捗は端末間で自動同期されません。', { exact: false }),
  ).toBeVisible();
  const editorRequests = lessons.filter((url) => /javascript-ch(?!00-l01|03-l05)/u.test(url));
  expect(editorRequests).toEqual([]);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
  await page.screenshot({ path: '/evidence/issue22-closure-sharing-mobile.png' });
});

test('明示URLを保存値より優先し、消えたSlideはLesson目次へ安全に戻る', async ({ page }) => {
  await page.goto(`${CLOSURE}?slide=javascript-ch03-l05-s03`);
  await expect(page.locator('[data-reading-section="javascript-ch03-l05-s03"]')).toBeInViewport();
  await page.goto(`${CLOSURE}?slide=javascript-ch03-l05-s01`);
  await expect(page.locator('[data-reading-section="javascript-ch03-l05-s01"]')).toBeInViewport();
  await page.goto(`${CLOSURE}?slide=javascript-ch00-l01-s01`);
  await expect(
    page.getByText('前のスライドが見つからないため、このレッスンの目次へ戻りました。'),
  ).toBeVisible();
  await page.goto(`${PILOT}/javascript/lessons/javascript-ch09-l01/read`);
  await expect(page).toHaveURL(/#\/library\/pilot$/u);
});

test('短い末尾sectionへ直接再開しても、復元中に前のsectionを保存しない', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 844 });
  const target = 'html-css-ch00-l01-s04';
  await page.goto(`${PILOT}/html-css/lessons/html-css-ch00-l01/read?slide=${target}`);
  await expect(page.getByRole('textbox', { name: '読書位置のURL', exact: true })).toHaveValue(
    new RegExp(`slide=${target}$`, 'u'),
  );
  // 復元から派生したscroll/rAFと、通常の現在位置判定が完了した後も末尾を保持する。
  await page.evaluate(async () => {
    window.dispatchEvent(new Event('scroll'));
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          resolve();
        }),
      ),
    );
  });
  await expect
    .poll(() =>
      page.evaluate((key) => {
        const value = JSON.parse(localStorage.getItem(key) ?? '{}') as {
          positions?: { slideId: string }[];
        };
        return value.positions?.[0]?.slideId;
      }, KEY),
    )
    .toBe(target);
  const top = await page
    .locator(`[data-reading-section="${target}"]`)
    .evaluate((node) => node.getBoundingClientRect().top);
  expect(top).toBeLessThanOrEqual(844 * 0.2);
  await page.goto(PILOT);
  await page.getByRole('link', { name: /HTML.*読書の続きから/u }).click();
  await expect(page).toHaveURL(new RegExp(`slide=${target}$`, 'u'));
  await expect(page.getByRole('textbox', { name: '読書位置のURL', exact: true })).toHaveValue(
    new RegExp(`slide=${target}$`, 'u'),
  );
});

test('保存不可とClipboard拒否でも本文を読め、演習URLを選択して渡せる', async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new Error('quota');
    };
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: () => Promise.reject(new Error('denied')) },
    });
  });
  await page.goto(`${CLOSURE}?slide=javascript-ch03-l05-s03`);
  await expect(page.locator('[data-reading-section]')).toHaveCount(4);
  await expect(page.getByText('続き位置を保存できません。本文はそのまま読めます。')).toBeVisible();
  await page.getByRole('button', { name: '読書位置のURLをコピー', exact: true }).click();
  await expect(page.getByText('URLを選択してコピーしてください')).toBeVisible();
  await expect(
    page.getByRole('textbox', { name: 'Closureで得点を10ずつ増やすの演習URL', exact: true }),
  ).toHaveValue(
    /#\/courses\/javascript\/lessons\/javascript-ch03-l05\/exercises\/javascript-ch03-l05-e01$/u,
  );
});

test('試用1枚表示は対象外Lessonを先読みせず、通読との往復を保つ', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  await page.goto(`${PILOT}/javascript/lessons/javascript-ch00-l01/slides/javascript-ch00-l01-s04`);
  await expect(page.getByTestId('slide-stage')).toBeVisible();
  await page.getByRole('button', { name: 'スライド目次を開く' }).click();
  await expect(page.getByRole('dialog').getByRole('link')).toHaveCount(40);
  await page.getByRole('button', { name: '閉じる', exact: true }).click();
  await page.getByRole('link', { name: 'この位置から一続きに読む' }).click();
  await expect(page).toHaveURL(/read\?slide=javascript-ch00-l01-s04$/u);
  await expect(page.locator('[data-reading-section="javascript-ch00-l01-s04"]')).toBeInViewport();
  expect(
    requests.some((url) =>
      /javascript-ch00-l02|CodeWorkspace|learningRuntime\.ts|pyodide/u.test(url),
    ),
  ).toBe(false);
});

test('3Lessonの狭幅・文字拡大でも目次と末尾へ到達し、既存学習保存を変えない', async ({ page }) => {
  await seedCompletedProgress(page);
  const before = await readStoredProgress(page);
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [course, lesson] of [
    ['html-css', 'html-css-ch00-l01'],
    ['javascript', 'javascript-ch00-l01'],
    ['javascript', 'javascript-ch03-l05'],
  ] as const) {
    await page.goto(`${PILOT}/${course}/lessons/${lesson}/read`);
    await expect(page.locator(`[data-reading-section="${lesson}-s01"]`)).toBeVisible();
    await expect(page.locator('[data-reading-section]')).toHaveCount(4);
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '200%';
    });
    const sections = page.locator('[data-reading-section]');
    await sections.last().scrollIntoViewIfNeeded();
    await expect(sections.last()).toBeInViewport();
    await expect(
      page.getByRole('navigation', { name: 'このレッスンの目次' }).getByRole('link'),
    ).toHaveCount(4);
    await page
      .getByRole('textbox', { name: '読書位置のURL', exact: true })
      .scrollIntoViewIfNeeded();
    await page.screenshot({ path: `/evidence/issue22-${lesson}-text200.png` });
    const overflow = await page.locator('body *').evaluateAll((nodes) =>
      nodes
        .filter((node) => {
          const rect = node.getBoundingClientRect();
          return rect.width > 0 && rect.right > window.innerWidth + 1;
        })
        .map(
          (node) =>
            `${node.tagName}.${node.getAttribute('class') ?? ''}: ${String(node.getBoundingClientRect().right)}`,
        ),
    );
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      JSON.stringify(overflow),
    ).toBe(true);
    const ids = await page.locator('[id]').evaluateAll((nodes) => nodes.map((node) => node.id));
    expect(new Set(ids).size).toBe(ids.length);
    await page.evaluate(() => {
      window.scrollTo(0, 0);
    });
    await page.screenshot({ path: `/evidence/issue22-${lesson}-header200.png` });
    const code = page.locator('[data-reading-section] pre').first();
    await code.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `/evidence/issue22-${lesson}-code200.png` });
    const codeScroll = await code.evaluate((node) => {
      node.scrollLeft = node.scrollWidth;
      return { right: node.scrollLeft + node.clientWidth, width: node.scrollWidth };
    });
    expect(codeScroll.right).toBeGreaterThanOrEqual(codeScroll.width - 1);
    await page.evaluate(() => {
      document.documentElement.style.fontSize = '';
    });
  }
  expect(await readStoredProgress(page)).toEqual(before);
});

test('取得済みLessonは通信断でも読め、次Lessonの取得失敗は再試行できる', async ({
  page,
  context,
}) => {
  await page.goto(CLOSURE);
  await expect(page.locator('[data-reading-section="javascript-ch03-l05-s01"]')).toBeVisible();
  await context.setOffline(true);
  await page
    .getByRole('navigation', { name: 'このレッスンの目次' })
    .getByRole('link')
    .nth(2)
    .click();
  await expect(page.locator('[data-reading-section="javascript-ch03-l05-s03"]')).toBeInViewport();
  await page.getByRole('link', { name: /^前のレッスン：/u }).click();
  await expect(page.getByRole('heading', { name: '教材を読み込めませんでした' })).toBeVisible();
  await context.setOffline(false);
  await page.getByRole('button', { name: 'もう一度読み込む' }).click();
  await expect(page.locator('[data-reading-section="javascript-ch00-l01-s01"]')).toBeVisible();
});
