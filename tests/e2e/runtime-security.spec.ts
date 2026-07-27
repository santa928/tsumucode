import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { securityPayloads } from '../fixtures/securityPayloads';
import {
  observeStableTopUrl,
  openRuntimeFixture,
  readRuntimeErrors,
  replaceEditorText,
  takeConsoleErrors,
} from './helpers/openRuntimeFixture';
import {
  captureStrictSnapshotResponse,
  installPreviewSourceProbe,
  observeValidationBusy,
  respondFromPreviewFrame,
  respondFromTopWindow,
} from './helpers/previewSourceProbe';

const previewFrame = (page: Page) => page.getByTestId('runtime-preview-frame').locator('iframe');
const EDITING_CAPABILITY_QUERY = '(min-width: 1024px) and (pointer: fine)';

interface PreviewGeometry {
  readonly iframeViewport: { readonly width: number; readonly height: number };
  readonly page: { readonly clientWidth: number; readonly scrollWidth: number };
  readonly wrapper: {
    readonly clientWidth: number;
    readonly scrollWidth: number;
    readonly scrollHeight: number;
    readonly left: number;
    readonly right: number;
    readonly overflowX: string;
  };
  readonly iframe: {
    readonly outerWidth: number;
    readonly outerHeight: number;
    readonly rightInScrollContent: number;
    readonly bottomInScrollContent: number;
  };
}

interface SkipLinkGeometry {
  readonly activeElementMatches: boolean;
  readonly transform: string;
  readonly visibility: string;
  readonly rect: {
    readonly top: number;
    readonly bottom: number;
    readonly left: number;
    readonly right: number;
  };
}

/** Narrow viewportでもlayoutだけを実Browser検証できるよう、編集capabilityをfixture内で固定する。 */
async function reloadRuntimeWithEditingCapability(
  page: Page,
  viewport: { readonly width: number; readonly height: number },
): Promise<void> {
  await page.addInitScript((query) => {
    const nativeMatchMedia = window.matchMedia.bind(window);
    window.matchMedia = (candidate): MediaQueryList => {
      const nativeResult = nativeMatchMedia(candidate);
      if (candidate !== query) return nativeResult;
      Object.defineProperty(nativeResult, 'matches', { configurable: true, value: true });
      return nativeResult;
    };
  }, EDITING_CAPABILITY_QUERY);
  await page.setViewportSize(viewport);
  await page.reload();
  await page.getByTestId('code-workspace').waitFor();
  await expect(page.getByRole('button', { name: '判定する' })).toBeEnabled();
  await expect(previewFrame(page)).toBeVisible();
}

/** Preview document寸法とtop page/wrapperの包含境界を同じ描画frameから読む。 */
async function readPreviewGeometry(page: Page): Promise<PreviewGeometry> {
  const iframeViewport = await previewFrame(page)
    .contentFrame()
    .locator('html')
    .evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));
  const outerGeometry = await page.getByTestId('runtime-preview-scroll').evaluate((wrapper) => {
    const iframe = wrapper.querySelector('iframe');
    if (!(iframe instanceof HTMLIFrameElement)) throw new Error('Preview iframe was not found');
    const root = document.documentElement;
    const wrapperRect = wrapper.getBoundingClientRect();
    const iframeRect = iframe.getBoundingClientRect();
    return {
      page: { clientWidth: root.clientWidth, scrollWidth: root.scrollWidth },
      wrapper: {
        clientWidth: wrapper.clientWidth,
        scrollWidth: wrapper.scrollWidth,
        scrollHeight: wrapper.scrollHeight,
        left: wrapperRect.left,
        right: wrapperRect.right,
        overflowX: getComputedStyle(wrapper).overflowX,
      },
      iframe: {
        outerWidth: iframe.offsetWidth,
        outerHeight: iframe.offsetHeight,
        rightInScrollContent: iframeRect.right - wrapperRect.left + wrapper.scrollLeft,
        bottomInScrollContent: iframeRect.bottom - wrapperRect.top + wrapper.scrollTop,
      },
    };
  });
  return { iframeViewport, ...outerGeometry };
}

/** Requested 1280x720 Previewをpageではなく専用wrapperだけへ収めていることを固定する。 */
async function expectContainedPreview(
  page: Page,
  browserViewport: { readonly width: number; readonly height: number },
): Promise<void> {
  const geometry = await readPreviewGeometry(page);
  expect(geometry.iframeViewport).toEqual({ width: 1280, height: 720 });
  expect(geometry.page.scrollWidth).toBeLessThanOrEqual(geometry.page.clientWidth);
  expect(geometry.wrapper.left).toBeGreaterThanOrEqual(0);
  expect(geometry.wrapper.right).toBeLessThanOrEqual(browserViewport.width);
  expect(geometry.wrapper.overflowX).toBe('auto');
  expect(geometry.wrapper.scrollWidth).toBeGreaterThanOrEqual(geometry.iframe.outerWidth);
  expect(geometry.iframe.rightInScrollContent).toBeLessThanOrEqual(geometry.wrapper.scrollWidth);
  expect(geometry.iframe.bottomInScrollContent).toBeLessThanOrEqual(geometry.wrapper.scrollHeight);
}

/** Screenshot直前に非focus Skip Linkがviewport外へ退避しているか数値で固定する。 */
async function expectHiddenSkipLink(page: Page): Promise<SkipLinkGeometry> {
  const geometry = await page.locator('.tc-skip-link').evaluate((element): SkipLinkGeometry => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return {
      activeElementMatches: document.activeElement === element,
      transform: style.transform,
      visibility: style.visibility,
      rect: { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right },
    };
  });
  expect(geometry.activeElementMatches).toBe(false);
  expect(
    geometry.rect.bottom,
    `Skip Link geometry: ${JSON.stringify(geometry)}`,
  ).toBeLessThanOrEqual(0);
  return geometry;
}

test.beforeEach(async ({ page }) => {
  await openRuntimeFixture(page);
});

test.afterEach(async ({ page }) => {
  if (page.isClosed()) return;
  const errors = await readRuntimeErrors(page);
  expect(errors.pageErrors, 'pageerrorを残さない').toEqual([]);
  expect(errors.unhandledRejections, 'unhandledrejectionを残さない').toEqual([]);
  expect(errors.consoleErrors, 'console errorを残さない').toEqual([]);
});

test('iframeはallow-scriptsだけでopaque originを維持する', async ({ page }, testInfo) => {
  const iframe = previewFrame(page);
  await expect(iframe).toHaveAttribute('sandbox', 'allow-scripts');
  const sandboxTokens = await iframe.evaluate((element) =>
    (element.getAttribute('sandbox') ?? '').split(/\s+/u).filter(Boolean),
  );
  expect(sandboxTokens).toEqual(['allow-scripts']);

  const frame = iframe.contentFrame();
  await expect(frame.locator('html')).toHaveCount(1);
  const isolation = await frame.locator('html').evaluate(() => {
    let parentDocumentBlocked = false;
    try {
      void window.parent.document.body;
    } catch {
      parentDocumentBlocked = true;
    }
    return { origin: window.location.origin, parentDocumentBlocked };
  });
  expect(isolation).toEqual({ origin: 'null', parentDocumentBlocked: true });

  const desktopViewport = { width: 1280, height: 720 } as const;
  await expectContainedPreview(page, desktopViewport);
  await page.getByTestId('runtime-preview-scroll').scrollIntoViewIfNeeded();
  const desktopSkipLink = await expectHiddenSkipLink(page);
  await testInfo.attach('skip-link-1280x720', {
    body: JSON.stringify(desktopSkipLink),
    contentType: 'application/json',
  });
  await page.screenshot({ path: testInfo.outputPath('preview-layout-1280x720.png') });

  const narrowViewport = { width: 390, height: 844 } as const;
  await reloadRuntimeWithEditingCapability(page, narrowViewport);
  await expectContainedPreview(page, narrowViewport);
  await page.getByTestId('runtime-preview-scroll').scrollIntoViewIfNeeded();
  const narrowSkipLink = await expectHiddenSkipLink(page);
  await testInfo.attach('skip-link-390x844', {
    body: JSON.stringify(narrowSkipLink),
    contentType: 'application/json',
  });
  await page.screenshot({ path: testInfo.outputPath('preview-layout-390x844.png') });
});

for (const [name, payload] of Object.entries(securityPayloads)) {
  test(`${name} payloadを無効化し、残存要素の操作後も能力を与えない`, async ({
    page,
    browserName,
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
      document.body.dataset.securityCanary = 'intact';
      localStorage.setItem('tsumucode-security-canary', 'intact');
    });

    try {
      await replaceEditorText(page, payload.html);
      const update = page.getByRole('button', { name: 'プレビューを更新' });
      await update.click();
      await expect(update).toBeEnabled();
      await expect(
        previewFrame(page).contentFrame().getByRole('heading', { name: '安全' }),
      ).toBeVisible();

      const frame = previewFrame(page).contentFrame();
      await expect(frame.locator('a')).toHaveCount(payload.expectedResidual.links);
      await expect(frame.locator('button')).toHaveCount(payload.expectedResidual.buttons);
      await expect(frame.locator('form')).toHaveCount(payload.expectedResidual.forms);

      for (let index = 0; index < payload.expectedResidual.links; index += 1) {
        await frame.locator('a').nth(index).click({ force: true });
      }
      for (let index = 0; index < payload.expectedResidual.buttons; index += 1) {
        await frame.locator('button').nth(index).click({ force: true });
      }
      if (payload.expectedResidual.forms > 0) {
        await frame.locator('form').evaluateAll((forms) => {
          forms.forEach((form) => {
            if (form instanceof HTMLFormElement) form.requestSubmit();
          });
        });
      }

      expect(await observeStableTopUrl(page, originalUrl)).toBe(true);
      expect(externalRequests, 'evil.testへのrequestを発生させない').toEqual([]);
      expect(popups, 'learner payloadからpopupを開かない').toEqual([]);
      expect(page.url()).toBe(originalUrl);
      expect(
        await page.evaluate(() => ({
          pwned: document.body.dataset.pwned ?? null,
          canary: document.body.dataset.securityCanary ?? null,
          storage: localStorage.getItem('tsumucode-security-canary'),
        })),
      ).toEqual({ pwned: null, canary: 'intact', storage: 'intact' });
      if (payload.expectedResidual.forms > 0) {
        const expectedSandboxRefusals = takeConsoleErrors(page);
        expect(expectedSandboxRefusals).toHaveLength(browserName === 'chromium' ? 2 : 0);
        expect(
          expectedSandboxRefusals.every(
            (message) =>
              /form/iu.test(message) && /sandbox/iu.test(message) && /allow-forms/iu.test(message),
          ),
        ).toBe(true);
      }
    } finally {
      await Promise.all(popups.map((popup) => popup.close().catch(() => undefined)));
    }
  });
}

test('有効なtokenでもtop window sourceのsnapshotを無視する', async ({ page }) => {
  await installPreviewSourceProbe(page);
  const validate = page.getByRole('button', { name: /^判定(?:する|しています)$/u });
  await validate.click();
  const response = await captureStrictSnapshotResponse(page);
  expect(response.payload.viewport).toEqual({ id: 'desktop', width: 1280, height: 720 });
  await expect(validate).toHaveText('判定しています');
  await respondFromTopWindow(page, response);

  try {
    expect(await observeValidationBusy(validate)).toBe(true);
  } finally {
    if ((await validate.textContent())?.trim() === '判定しています') {
      await respondFromPreviewFrame(page, response).catch(() => undefined);
    }
  }
  await expect(validate).toHaveText('判定する');
  await expect(validate).toBeEnabled();
});

test('Exercise UIにCriticalまたはSeriousのaxe違反がない', async ({ page }) => {
  const result = await new AxeBuilder({ page }).analyze();
  expect(
    result.violations.filter(({ impact }) => impact === 'critical' || impact === 'serious'),
  ).toEqual([]);
});
