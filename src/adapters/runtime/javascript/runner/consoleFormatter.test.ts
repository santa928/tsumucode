import { describe, expect, it } from 'vitest';
import { CONSOLE_LIMITS, createConsoleFormatter, formatConsoleArguments } from './consoleFormatter';

describe('formatConsoleArguments', () => {
  it('primitiveを空白区切りのplain textへ変換する', () => {
    expect(formatConsoleArguments([1, 'x', true, null])).toBe('1 x true null');
  });

  it('HTMLらしい文字列をmarkupへ変換せず保持する', () => {
    expect(formatConsoleArguments([{ password: '<b>not html</b>' }])).toContain('<b>not html</b>');
  });

  it('循環・深さ・件数をboundedな表示へ変換する', () => {
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    const deepObject = { first: { second: { third: { fourth: true } } } };
    const manyItems = Array.from(
      { length: CONSOLE_LIMITS.collectionItems + 1 },
      (_, index) => index,
    );

    expect(formatConsoleArguments([cyclic])).toContain('[Circular]');
    expect(formatConsoleArguments([deepObject])).toContain('…');
    expect(formatConsoleArguments([manyItems])).toContain('…');
  });

  it('accessorを実行せず、例外を投げるProxyも安全な文字列へ変換する', () => {
    let getterCalls = 0;
    const throwingGetter = Object.defineProperty({}, 'secret', {
      enumerable: true,
      get() {
        getterCalls += 1;
        throw new Error('getter must not run');
      },
    });
    const unreadable = new Proxy(
      {},
      {
        ownKeys() {
          throw new Error('proxy failure');
        },
      },
    );

    expect(formatConsoleArguments([throwingGetter])).toContain('[Unreadable]');
    expect(getterCalls).toBe(0);
    expect(formatConsoleArguments([unreadable])).toContain('[Unreadable]');
  });

  it('1 recordをUTF-8で4 KiB以下へ切り詰める', () => {
    const formatted = formatConsoleArguments(['あ'.repeat(10_000)]);

    expect(new TextEncoder().encode(formatted).byteLength).toBeLessThanOrEqual(
      CONSOLE_LIMITS.recordBytes,
    );
    expect(formatted.endsWith('…')).toBe(true);
  });

  it('bootstrap時に捕捉したintrinsicを後続コードの改変から隔離する', () => {
    const format = createConsoleFormatter();
    const descriptor = Object.getOwnPropertyDescriptor(Object, 'getOwnPropertyDescriptors');
    if (descriptor === undefined) throw new Error('Object intrinsic descriptorがありません');
    const formatted = (() => {
      try {
        Object.defineProperty(Object, 'getOwnPropertyDescriptors', {
          ...descriptor,
          value: () => {
            throw new Error('learner mutation');
          },
        });

        return format([{ safe: 1 }]);
      } finally {
        Object.defineProperty(Object, 'getOwnPropertyDescriptors', descriptor);
      }
    })();

    expect(formatted).toBe('{safe: 1}');
  });
});
