// @vitest-environment node
import { describe, expect, it } from 'vitest';
import config, { resolveWorkerLimit } from '../../../vitest.config';

describe('fast CI worker limit', () => {
  it.each([
    [1, 1],
    [2, 1],
    [3, 2],
    [4, 2],
  ])('CPU %i は既定値を超えず %i workers', (cpus, expected) => {
    expect(resolveWorkerLimit('adaptive:2', () => cpus)).toBe(expected);
  });

  it.each([0, -1, 2.5, NaN, Infinity])('不明なCPU値 %s はVitest既定に戻す', (value) => {
    expect(resolveWorkerLimit('adaptive:2', () => value)).toBeUndefined();
  });

  it('解決した値を実際のVitest設定へ渡す', () => {
    expect(config.test?.maxWorkers).toBe(
      resolveWorkerLimit(process.env['TSUMUCODE_TEST_MAX_WORKERS']),
    );
  });

  it('CPU取得エラーはVitest既定に戻し、従来の数値指定を保つ', () => {
    expect(
      resolveWorkerLimit('adaptive:2', () => {
        throw Error('probe');
      }),
    ).toBeUndefined();
    expect(resolveWorkerLimit(undefined, () => 4)).toBeUndefined();
    expect(
      resolveWorkerLimit('3', () => {
        throw Error('must not probe');
      }),
    ).toBe(3);
    expect(resolveWorkerLimit('1', () => 4)).toBe(1);
    expect(() => resolveWorkerLimit('0', () => 4)).toThrow();
  });
});
