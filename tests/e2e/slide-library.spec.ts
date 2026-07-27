import { expect, test, type Page } from '@playwright/test';
import { readStoredProgress, seedCompletedProgress } from './helpers/progress';
import { expectStoredViewedSlide, STANDARD_LESSON_ID } from './helpers/releaseCourse';

type StorageProbeEvent =
  | { readonly kind: 'indexeddb-open'; readonly name: string }
  | { readonly kind: 'storage'; readonly operation: string; readonly key: string };

const FIRST_LIBRARY_ROUTE =
  './#/library/html-css/lessons/html-css-ch00-l01/slides/html-css-ch00-l01-s01';
const NORMAL_SLIDE_ROUTE =
  './#/courses/html-css/lessons/html-css-ch00-l01/slides/html-css-ch00-l01-s01';

/** ViewerのCourse全体Drawerから指定Slideへ移動する。 */
async function openSlideFromLibraryDrawer(page: Page, slideId: string): Promise<void> {
  await page.getByRole('button', { name: 'スライド目次を開く' }).click();
  const drawer = page.getByRole('dialog', { name: 'スライド目次' });
  await expect(drawer).toBeVisible();
  await drawer.locator(`a[href$="/slides/${slideId}"]`).click();
  await expect(page).toHaveURL(new RegExp(`/slides/${slideId}$`, 'u'));
}

test('Library Viewer直リンクはIndexedDBとTsumuCode Storageへ一度も触れない', async ({ page }) => {
  await page.addInitScript(() => {
    const events: StorageProbeEvent[] = [];
    Reflect.set(window, '__tsumucodeLibraryStorageProbe', events);

    // eslint-disable-next-line @typescript-eslint/unbound-method -- Wrapper内で元のIDBFactory receiverをcallへ明示する。
    const originalOpen = IDBFactory.prototype.open;
    IDBFactory.prototype.open = function open(name: string, version?: number) {
      events.push({ kind: 'indexeddb-open', name });
      return version === undefined
        ? originalOpen.call(this, name)
        : originalOpen.call(this, name, version);
    };

    // eslint-disable-next-line @typescript-eslint/unbound-method -- Wrapper内で呼出元Storageをcallへ明示する。
    const originalGetItem = Storage.prototype.getItem;
    Storage.prototype.getItem = function getItem(key: string): string | null {
      if (key.startsWith('tsumucode')) {
        events.push({ kind: 'storage', operation: 'getItem', key });
      }
      return originalGetItem.call(this, key);
    };
    // eslint-disable-next-line @typescript-eslint/unbound-method -- Wrapper内で呼出元Storageをcallへ明示する。
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function setItem(key: string, value: string): void {
      if (key.startsWith('tsumucode')) {
        events.push({ kind: 'storage', operation: 'setItem', key });
      }
      originalSetItem.call(this, key, value);
    };
    // eslint-disable-next-line @typescript-eslint/unbound-method -- Wrapper内で呼出元Storageをcallへ明示する。
    const originalRemoveItem = Storage.prototype.removeItem;
    Storage.prototype.removeItem = function removeItem(key: string): void {
      if (key.startsWith('tsumucode')) {
        events.push({ kind: 'storage', operation: 'removeItem', key });
      }
      originalRemoveItem.call(this, key);
    };
  });

  await page.goto(FIRST_LIBRARY_ROUTE);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Webページは3つの役割でできている' }),
  ).toBeVisible();
  await expect(page.getByText('閲覧モード')).toBeVisible();

  const events = await page.evaluate(
    () => Reflect.get(window, '__tsumucodeLibraryStorageProbe') as StorageProbeEvent[],
  );
  expect(events).toEqual([]);
});

test('Home経由で標準・Guided・Capstoneを巡回しても保存済みSnapshotを変えない', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await seedCompletedProgress(page);
  await page.goto('./#/');
  await expect(page.getByRole('heading', { level: 1, name: '学びたいピースを選ぶ' })).toBeVisible();
  const before = await readStoredProgress(page);

  await page.getByRole('link', { name: 'HTML/CSS はじめの一歩：スライドだけ見る' }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'HTML/CSS はじめの一歩 スライド目次' }),
  ).toBeVisible();
  await page
    .getByRole('link', { name: /先頭から見る/u })
    .first()
    .click();
  await expect(page).toHaveURL(/html-css-ch00-l01-s01$/u);

  await openSlideFromLibraryDrawer(page, 'html-css-ch00-l01-s04');
  await page.getByRole('link', { name: '次のスライドへ' }).click();
  await expect(page).toHaveURL(/html-css-ch00-l02\/slides\/html-css-ch00-l02-s01$/u);

  await openSlideFromLibraryDrawer(page, 'html-css-ch01-l01-s01');
  await expect(page.getByText('Lesson 3 / 51・Slide 1 / 4')).toBeVisible();
  await openSlideFromLibraryDrawer(page, 'html-css-ch12-l01-g01');
  await expect(page.getByText('Lesson 46 / 51・Slide 1 / 1')).toBeVisible();
  await openSlideFromLibraryDrawer(page, 'html-css-ch13-l01-g01');
  await expect(page.getByText('Lesson 51 / 51・Slide 1 / 1')).toBeVisible();
  await expect(page.getByRole('link', { name: 'スライド目次へ戻る' })).toHaveAttribute(
    'href',
    /#\/library\/html-css$/u,
  );

  await page.getByRole('button', { name: '用語を開く' }).click();
  await expect(page.getByRole('dialog', { name: 'このレッスンの用語' })).toBeVisible();
  await page.getByRole('button', { name: '閉じる' }).click();

  await page.goBack();
  await expect(page).toHaveURL(/html-css-ch12-l01-g01$/u);
  await page.goForward();
  await expect(page).toHaveURL(/html-css-ch13-l01-g01$/u);

  const after = await readStoredProgress(page);
  expect(after).toEqual(before);
});

test('通常Slide Routeは従来どおり閲覧進捗を保存する', async ({ page }) => {
  await page.goto(NORMAL_SLIDE_ROUTE);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Webページは3つの役割でできている' }),
  ).toBeVisible();
  await expectStoredViewedSlide(page, STANDARD_LESSON_ID, 'html-css-ch00-l01-s01');
});
