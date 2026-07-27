// @vitest-environment node
import type { PlaywrightTestConfig } from '@playwright/test';
import { isAbsolute, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import e2eConfig from '../../../playwright.config';
import performanceConfig from '../../../playwright.performance.config';

/** Playwright設定からJSON reporterの出力先だけを取得する。 */
function jsonReporterOutput(config: PlaywrightTestConfig): string | undefined {
  const reporters =
    typeof config.reporter === 'string' ? [config.reporter] : (config.reporter ?? []);
  const jsonReporter = reporters.find(
    (reporter) => Array.isArray(reporter) && reporter[0] === 'json',
  );

  if (!Array.isArray(jsonReporter)) return undefined;

  const options = jsonReporter[1] as { readonly outputFile?: string } | undefined;
  return options?.outputFile;
}

/** filePathがdirectory配下またはdirectory自身を指すかを判定する。 */
function isWithin(directory: string, filePath: string): boolean {
  const relativePath = relative(directory, filePath);
  return relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath));
}

describe('Playwright output isolation', () => {
  it('通常E2Eと性能検証のartifactとJSON summaryを別々の場所へ出力する', () => {
    expect(e2eConfig.outputDir).toBe('test-results/e2e-artifacts');
    expect(performanceConfig.outputDir).toBe('test-results/performance-artifacts');
    expect(e2eConfig.outputDir).not.toBe(performanceConfig.outputDir);

    const e2eSummary = jsonReporterOutput(e2eConfig);
    const performanceSummary = jsonReporterOutput(performanceConfig);

    expect(e2eSummary).toBe('test-results/e2e-summary.json');
    expect(performanceSummary).toBe('test-results/performance-summary.json');
    expect(isWithin(performanceConfig.outputDir!, e2eSummary!)).toBe(false);
    expect(isWithin(e2eConfig.outputDir!, performanceSummary!)).toBe(false);
  });
});
