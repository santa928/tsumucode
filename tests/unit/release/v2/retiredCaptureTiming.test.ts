// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createRetiredCaptureTiming } from './retiredCaptureTiming';

describe('retired capture phase timing', () => {
  it('records fixed cumulative markers and does not record after timeout abort', () => {
    const meta: Record<string, unknown> = {};
    const abort = new AbortController();
    let time = 100;
    const mark = createRetiredCaptureTiming(meta, abort.signal, true, () => time);
    mark('setup');
    time = 105;
    mark('fixture-compile');
    time = 133;
    mark('capture-before');
    abort.abort();
    time = 150;
    mark('prepare');
    expect(meta['retiredCaptureTiming']).toEqual({
      phase: 'capture-before',
      marks: [
        { phase: 'setup', elapsedMs: 0 },
        { phase: 'fixture-compile', elapsedMs: 5 },
        { phase: 'capture-before', elapsedMs: 33 },
      ],
    });
  });

  it('caps elapsed values, ignores invalid phases, and bounds records', () => {
    const meta: Record<string, unknown> = {};
    let time = 0;
    const mark = createRetiredCaptureTiming(meta, new AbortController().signal, true, () => time);
    mark('setup');
    time = 999_999;
    mark('fixture-compile');
    for (let index = 0; index < 20; index += 1) mark('fixture-compile');
    mark('not-allowed' as 'setup');
    expect(meta['retiredCaptureTiming']).toEqual({
      phase: 'fixture-compile',
      marks: [
        { phase: 'setup', elapsedMs: 0 },
        { phase: 'fixture-compile', elapsedMs: 120_000 },
      ],
    });
  });

  it('does nothing when disabled or the clock/metadata write fails', () => {
    const meta: Record<string, unknown> = {};
    const disabled = createRetiredCaptureTiming(meta, new AbortController().signal, false, () => {
      throw Error('must not read clock');
    });
    expect(() => {
      disabled('setup');
    }).not.toThrow();
    const broken = createRetiredCaptureTiming(meta, new AbortController().signal, true, () => {
      throw Error('clock failure');
    });
    expect(() => {
      broken('setup');
    }).not.toThrow();
    const blockedMeta = Object.freeze({});
    const unwritable = createRetiredCaptureTiming(
      blockedMeta,
      new AbortController().signal,
      true,
      () => 100,
    );
    expect(() => {
      unwritable('setup');
    }).not.toThrow();
    expect(meta).toEqual({});
  });
});
