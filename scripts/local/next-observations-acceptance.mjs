import assert from 'node:assert/strict';
import console from 'node:console';
import { createServer } from 'node:http';
import { chromium } from '@playwright/test';
import {
  NextLessonObservationError,
  observeNextLesson,
  watchDocumentVersion,
} from './next-project-observations.mjs';

// 採点器のHTTP契約を実Browserで検証する。Next教材の実行証拠とは別に扱う。
let mode = 'native';
const server = createServer((request, response) => {
  const path = request.url;
  let body;
  if (mode === 'event-navigation') {
    if (path !== '/' && path !== '/changed') {
      response.writeHead(404).end();
      return;
    }
    body = `
      <h1 id="message">ServerとClientの役割</h1>
      <p id="server-note">server-note.txt</p>
      <output id="count">${path === '/' ? '2' : '3'}</output>
      <button onclick="location.assign('/changed')">数を増やす</button>
    `;
  } else if (path === '/') {
    body = '<h1 id="message">旅行の入口</h1><a href="./trips">旅行一覧へ</a>';
  } else if (path === '/trips') {
    body = `
      <h2 id="trip-layout">旅行ノート</h2>
      <h1 id="message">旅行一覧</h1>
      <a href="./trips/forest">森の旅へ</a>
      <a href="./trips/sea">海の旅へ</a>
      ${
        mode === 'history-only'
          ? `<script>
              for (const link of document.querySelectorAll('a')) {
                link.addEventListener('click', (event) => {
                  event.preventDefault();
                  const url = new URL(link.href);
                  history.pushState(null, '', url);
                  document.querySelector('h1').textContent = '旅の詳細';
                  const slug = document.createElement('p');
                  slug.id = 'trip-slug';
                  slug.textContent = url.pathname.split('/').at(-1);
                  document.body.append(slug);
                });
              }
            </script>`
          : ''
      }
    `;
  } else if (path === '/trips/forest' || path === '/trips/sea') {
    body = `
      <h2 id="trip-layout">旅行ノート</h2>
      <h1 id="message">旅の詳細</h1>
      <p id="trip-slug">${path.slice('/trips/'.length)}</p>
      <a href="../trips">旅行一覧へ</a>
    `;
  } else {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  response.end(
    `<!doctype html><html lang="ja"><title>作者用採点契約</title><body>${body}</body></html>`,
  );
});
await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const identityPage = await browser.newPage();
  try {
    const version = watchDocumentVersion(identityPage);
    await identityPage.goto(origin + '/', { waitUntil: 'load' });
    const loaded = version();
    await identityPage.evaluate(() =>
      globalThis.history.replaceState(null, '', globalThis.location.href),
    );
    assert.equal(version(), loaded);
    await identityPage.reload({ waitUntil: 'load' });
    assert.ok(version() > loaded);
    const reloaded = version();
    await identityPage.evaluate(() => {
      globalThis.history.pushState(null, '', '/temporary');
      globalThis.history.replaceState(null, '', '/');
    });
    assert.ok(version() > reloaded);
    console.log('same-url history / reload / URL roundtrip: PASS');
  } finally {
    await identityPage.close();
  }
  for (const selected of ['native', 'history-only', 'event-navigation']) {
    mode = selected;
    const page = await browser.newPage();
    try {
      await page.goto(origin + '/', { waitUntil: 'networkidle' });
      if (mode === 'event-navigation') {
        await assert.rejects(
          observeNextLesson(page, origin, '/', 'server-client-counter'),
          NextLessonObservationError,
        );
      } else {
        const result = await observeNextLesson(page, origin, '/', 'nested-dynamic-navigation');
        assert.equal(result.passed, mode === 'native');
      }
      console.log(`${mode}: PASS`);
    } finally {
      await page.close();
    }
  }
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
