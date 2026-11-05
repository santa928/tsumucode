import assert from 'node:assert/strict';
import { URL } from 'node:url';
import { expect } from '@playwright/test';

/** 選択値の更新とPreview文書の到達を分け、前の文書を基準値にしない。 */
export async function selectNextDataResponse(page, rootUrl, path) {
  assert.ok(['', 'data/fresh', 'data/cached'].includes(path));
  const handle = await page.getByTitle('Next.jsの実サーバーPreview').elementHandle();
  assert.ok(handle);
  try {
    const frame = await handle.contentFrame();
    assert.ok(frame);
    const expectedUrl = new URL(path, rootUrl).href;
    const [response] = await Promise.all([
      page.waitForResponse(
        (reply) =>
          reply.frame() === frame &&
          reply.request().isNavigationRequest() &&
          reply.request().method() === 'GET' &&
          reply.url() === expectedUrl,
      ),
      page.getByLabel('表示する応答').selectOption(path),
    ]);
    assert.equal(response.status(), 200);
    assert.equal(await response.finished(), null);
    await frame.waitForURL(expectedUrl, { waitUntil: 'domcontentloaded' });
    await expect(frame.locator('#message')).toHaveText(
      path ? `取得と保持: ${path.slice('data/'.length)}` : '取得と保持を比べる',
    );
  } finally {
    await handle.dispose();
  }
}
