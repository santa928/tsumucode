/* global process, URL */
const { readFileSync } = require('node:fs');
const { chromium } = require('@playwright/test');
const { parse } = require('yaml');

const manifest = parse(readFileSync('content/html-css/performance.yaml', 'utf8'));
const body = (process.env.BASE_PATH || '/repository-name/').trim().replace(/^\/+|\/+$/gu, '');
if (body.split('/').some((segment) => segment === '..' || segment === '.')) {
  throw new Error('不正なBASE_PATHです');
}
const basePath = body.length === 0 ? '/' : `/${body}/`;

/** Hash routeをGitHub Pages subpath配下の絶対計測URLへ変換する。 */
const pageUrl = (route) => new URL(`${basePath}${route}`, 'http://localhost:4174/').href;

module.exports = {
  ci: {
    collect: {
      chromePath: chromium.executablePath(),
      startServerCommand: 'npm run preview -- --host 0.0.0.0 --port 4174',
      startServerReadyPattern: 'Local',
      url: [
        pageUrl('#/'),
        pageUrl('#/courses/html-css'),
        pageUrl('#/courses/html-css/lessons/html-css-ch01-l01/slides/html-css-ch01-l01-s01'),
        pageUrl('#/courses/html-css/lessons/html-css-ch01-l01/exercises/html-css-ch01-l01-e01'),
      ],
      numberOfRuns: 3,
      settings: {
        chromeFlags: '--no-sandbox --disable-dev-shm-usage',
        formFactor: 'mobile',
        screenEmulation: {
          mobile: true,
          width: manifest.webVitals.viewport.width,
          height: manifest.webVitals.viewport.height,
          deviceScaleFactor: 1,
          disabled: false,
        },
        throttling: {
          cpuSlowdownMultiplier: manifest.webVitals.cpuSlowdownMultiplier,
          downloadThroughputKbps: manifest.webVitals.downloadKbps,
          uploadThroughputKbps: manifest.webVitals.uploadKbps,
          requestLatencyMs: manifest.webVitals.rttMs,
          rttMs: manifest.webVitals.rttMs,
          throughputKbps: manifest.webVitals.downloadKbps,
        },
      },
    },
    assert: {
      aggregationMethod: 'pessimistic',
      assertions: {
        'largest-contentful-paint': ['error', { maxNumericValue: manifest.webVitals.lcpMaxMs }],
        'cumulative-layout-shift': ['error', { maxNumericValue: manifest.webVitals.clsMax }],
        'resource-summary:script:size': [
          'error',
          { maxNumericValue: manifest.bundle.homeInitialJavaScriptGzipMaxBytes },
        ],
      },
    },
    upload: { target: 'filesystem', outputDir: './lhci-report' },
  },
};
