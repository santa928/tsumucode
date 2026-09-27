// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { checkHomeJavaScriptBudget } from './homeJavaScriptBudget';
import { loadPerformanceManifest } from './manifest';

const manifest = await loadPerformanceManifest();
const budget = {
  maximumBytes: manifest.bundle.homeInitialJavaScriptGzipMaxBytes,
  baselineBytes: manifest.slideLibrary.baselineHomeInitialJavaScriptGzipBytes,
  growthWarningBytes: Math.min(
    manifest.slideLibrary.addedHomeInitialJavaScriptGzipMaxBytes,
    manifest.learningPath.addedHomeInitialJavaScriptGzipMaxBytes,
  ),
};

describe('Home JSの停止と警告', () => {
  it('過去の失敗実測値（増分20,905 bytes）は停止せず警告する', () => {
    expect(checkHomeJavaScriptBudget(178_967, budget)).toEqual([
      expect.stringContaining('20905 > 20480'),
    ]);
  });

  it('現行の成功実測値は警告せず、絶対上限超過は引き続き拒否する', () => {
    expect(checkHomeJavaScriptBudget(175_066, budget)).toEqual([]);
    expect(() => checkHomeJavaScriptBudget(256_001, budget)).toThrow('256001 > 256000');
  });
});
