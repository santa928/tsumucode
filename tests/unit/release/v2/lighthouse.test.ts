// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readLighthouseCoverage } from '../../../../scripts/release/v2/lighthouse';

const context = {
  urls: ['http://localhost:4174/site/#/', 'http://localhost:4174/site/#/lesson'],
  runs: 2,
  startedAt: '2026-11-02T10:00:00.000Z',
  now: '2026-11-02T10:01:00.000Z',
};
function reports() {
  return context.urls.flatMap((requestedUrl, index) =>
    [0, 1].map((run) => ({
      requestedUrl,
      fetchTime: `2026-11-02T10:00:0${index * 2 + run + 1}.000Z`,
      lighthouseVersion: '12.8.2',
      audits: {
        'largest-contentful-paint': { numericValue: 1200 },
        'cumulative-layout-shift': { numericValue: 0 },
        'resource-summary': {
          details: { items: [{ resourceType: 'script', transferSize: 1000 }] },
        },
      },
    })),
  );
}

describe('Lighthouseの実測出力', () => {
  it('成功時の空の失敗一覧を、全URL・全回数の新しい実測がある場合に受け付ける', () => {
    const result = readLighthouseCoverage(reports(), [], context);
    expect(result.assertions).toEqual([]);
    expect(result.measurements).toHaveLength(4);
    expect(result.measurements[0]).toMatchObject({ lcpMs: 1200, cls: 0, scriptBytes: 1000 });
  });
  it.each([
    'empty',
    'missing',
    'unknown',
    'duplicate',
    'stale',
    'future',
    'runtime',
    'metric',
    'script',
  ])('%sの実測を空の失敗一覧で成功にしない', (failure) => {
    const changed = reports();
    if (failure === 'empty') changed.length = 0;
    if (failure === 'missing') changed.pop();
    if (failure === 'unknown') changed[0]!.requestedUrl = 'http://localhost:4174/unknown';
    if (failure === 'duplicate') changed[1] = structuredClone(changed[0]!);
    if (failure === 'stale') changed[0]!.fetchTime = '2026-11-02T09:59:59.000Z';
    if (failure === 'future') changed[0]!.fetchTime = '2026-11-02T10:01:01.000Z';
    if (failure === 'runtime') Object.assign(changed[0]!, { runtimeError: { code: 'FAILED' } });
    if (failure === 'metric')
      changed[0]!.audits['largest-contentful-paint'].numericValue = Number.NaN;
    if (failure === 'script') changed[0]!.audits['resource-summary'].details.items.length = 0;
    expect(() => readLighthouseCoverage(changed, [], context)).toThrow();
  });
  it('実測が揃っていてもerror予算違反と壊れた失敗一覧を拒否する', () => {
    expect(() =>
      readLighthouseCoverage(reports(), [{ level: 'error', passed: false }], context),
    ).toThrow();
    expect(() => readLighthouseCoverage(reports(), {}, context)).toThrow();
  });
  it('従来のwarn扱いを維持し、独立した対象URLの追加にも同じ契約を使う', () => {
    expect(
      readLighthouseCoverage(reports(), [{ level: 'warn', passed: false }], context).measurements,
    ).toHaveLength(4);
    expect(() =>
      readLighthouseCoverage(reports(), [], {
        ...context,
        urls: [...context.urls, context.urls[0]!],
      }),
    ).toThrow();
  });
});
