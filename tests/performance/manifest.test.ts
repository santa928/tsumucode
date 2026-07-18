// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { loadPerformanceManifest, percentile95 } from './manifest';

describe('performance manifest', () => {
  it('固定10 Exerciseと公開性能予算をschema検証して読む', async () => {
    const manifest = await loadPerformanceManifest();

    expect(manifest).toEqual({
      schemaVersion: 1,
      browser: 'chromium',
      runsPerExercise: 20,
      warmupRuns: 3,
      previewP95Ms: 500,
      validationP95Ms: 300,
      exercises: [
        { id: 'html-css-ch00-l02-e01', category: 'simple' },
        { id: 'html-css-ch01-l02-e01', category: 'simple' },
        { id: 'html-css-ch03-l03-e01', category: 'median' },
        { id: 'html-css-ch04-l03-e01', category: 'median' },
        { id: 'html-css-ch05-l05-e01', category: 'geometry' },
        { id: 'html-css-ch08-l04-e01', category: 'layout' },
        { id: 'html-css-ch09-l03-e01', category: 'layout' },
        { id: 'html-css-ch10-l02-e01', category: 'responsive' },
        { id: 'html-css-ch11-l04-e01', category: 'accessibility' },
        { id: 'html-css-ch13-l01-e01', category: 'capstone' },
      ],
      webVitals: {
        viewport: { width: 390, height: 844 },
        cpuSlowdownMultiplier: 4,
        downloadKbps: 1600,
        uploadKbps: 750,
        rttMs: 150,
        lcpMaxMs: 2500,
        clsMax: 0.1,
        interactionMaxMs: 200,
      },
      bundle: {
        homeInitialJavaScriptGzipMaxBytes: 256000,
        editorLoadedOnHome: false,
      },
      content: {
        catalogGzipMaxBytes: 20480,
        courseManifestGzipMaxBytes: 393216,
        singleImageMaxBytes: 204800,
        totalImagesMaxBytes: 2097152,
        singleFontMaxBytes: 153600,
        totalFontsMaxBytes: 307200,
        authoringFieldsForbidden: ['solutionFiles', 'fixtures'],
      },
      draftPersistenceMaxMs: 500,
    });
  });

  it('nearest-rank方式でp95を入力順に依存せず返す', () => {
    expect(
      percentile95([1, 100, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19]),
    ).toBe(19);
  });

  it('空の測定値を拒否する', () => {
    expect(() => percentile95([])).toThrow('p95には1件以上の測定値が必要です');
  });
});
