import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createTailwindCompilerLoader,
  TAILWIND_COMPILER,
} from '../../../src/adapters/runtime/tailwind/compilerAsset';
import {
  validateTailwindSource,
  restrictTailwindClasses,
} from '../../../src/adapters/runtime/tailwind/validateSource';
import { validateHtmlCssPreviewInput } from '../../../src/adapters/runtime/preview-kernel/prepareHtmlCssPreview';
import type { RunnerInput } from '../../../src/core/runtime/contracts';
import { TailwindRunnerAdapter } from '../../../src/adapters/runtime/tailwind/TailwindRunnerAdapter';

/** Source保存に使う原文と、compilerへ渡すDOMの制約を別々に確認する。 */
function input(source: string, overrides: Partial<RunnerInput> = {}): RunnerInput {
  return {
    languageId: 'tailwind',
    exerciseSessionId: 'tailwind-test',
    executionRevision: 1,
    files: { 'index.html': source },
    assets: [],
    viewport: { id: 'desktop', width: 1280, height: 720 },
    options: {},
    ...overrides,
  };
}

/** 演習と同じ入力境界へ原文を渡す。 */
function validate(source: string, overrides: Partial<RunnerInput> = {}) {
  const value = input(source, overrides);
  return validateTailwindSource(validateHtmlCssPreviewInput(value, 'tailwind'), value);
}

afterEach(() => vi.unstubAllGlobals());

describe('有限Tailwind Source', () => {
  it('対象外Sourceには具体的な診断を返し、compiler取得とiframe更新を始めない', async () => {
    const fetchAsset = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetchAsset);
    const runner = new TailwindRunnerAdapter();
    const frame = document.createElement('iframe');
    document.body.append(frame);
    const source = '<div style="padding:16px"></div>';
    try {
      await runner.prepare(frame);
      const result = await runner.render(input(source));
      expect(result.diagnostics).toMatchObject([
        {
          code: 'TAILWIND_INPUT_UNSUPPORTED',
          severity: 'error',
        },
      ]);
      expect(result.diagnostics[0]?.learnerMessage).toContain('style属性');
      expect(fetchAsset).not.toHaveBeenCalled();
      expect(frame.srcdoc).toBe('');
      expect(source).toBe('<div style="padding:16px"></div>');
      await expect(
        runner.requestSnapshot({
          exerciseSessionId: 'tailwind-test',
          executionRevision: 1,
          requestId: 'unsupported',
          policy: {
            selectors: [],
            attributes: [],
            computedStyles: [],
            includeAllElements: false,
            focusVisibleSelectors: [],
            focusVisibleComputedStyles: [],
          },
        }),
      ).rejects.toThrow('not current');
    } finally {
      await runner.dispose();
      frame.remove();
    }
  });
  it('小数数値別解を許可し、未知classを原文から消さずcompilerからだけ除外する', () => {
    const source = '<div id="cards" class="flax gap-[16.00px] p-[1.00rem]"></div>';
    expect(validate(source)).toMatchObject([
      { code: 'TAILWIND_CLASS_UNSUPPORTED', severity: 'warning' },
    ]);
    const documentValue = new DOMParser().parseFromString(source, 'text/html');
    restrictTailwindClasses(documentValue);
    expect(documentValue.getElementById('cards')?.className).toBe('gap-[16.00px] p-[1.00rem]');
    expect(source).toContain('flax');
  });

  it.each([
    '<style>#cards{display:flex}</style>',
    '<div style="padding:16px"></div>',
    '<script>alert(1)</script>',
    '<link rel="stylesheet" href="x.css">',
    '<div onclick="alert(1)"></div>',
    '<div class="gap-[url(x)]"></div>',
    '<div class="hover:flex"></div>',
    '<div class="[padding:1rem]"></div>',
    '<div class="gap-[129px]"></div>',
    '<div class="p-[8.01rem]"></div>',
    '<div class="gap-[1.001px]"></div>',
    '<iframe></iframe>',
    '<html class="text-lg"><body><div></div></body></html>',
    '<div id="cards"></div><div id="cards"></div>',
    '<div class="' + 'flex '.repeat(65) + '"></div>',
    '<div class="' + 'a'.repeat(65) + '"></div>',
    '<div>' + 'あ'.repeat(6_000) + '</div>',
    '<div></div>'.repeat(126),
    '<div class="' + Array.from({ length: 65 }, (_, i) => `x${String(i)}`).join(' ') + '"></div>',
  ])('危険・対象外・巨大入力をiframe更新前に拒否する: %#', (source) => {
    expect(() => validate(source)).toThrow();
  });

  it('学習者の未知通常classを実compilerへ渡さない', () => {
    const source = '<div class="animate-spin bg-red-500 flax gap-4 p-4"></div>';
    expect(validate(source)).toHaveLength(3);
    const documentValue = new DOMParser().parseFromString(source, 'text/html');
    restrictTailwindClasses(documentValue);
    expect(documentValue.querySelector('div')?.className).toBe('gap-4 p-4');
  });

  it('別CSSファイルや公開assetを取得しない', () => {
    expect(() =>
      validate('<div></div>', { files: { 'index.html': '<div></div>', 'x.css': '' } }),
    ).toThrow();
  });
});

describe('固定compiler Loader', () => {
  const url = new URL('/tsumucode/' + TAILWIND_COMPILER.path, location.origin).href;

  /** fetchが実際に返す最終URLとbodyを再現する。 */
  function response(bytes: Uint8Array, responseUrl: string = url): Response {
    const value = new Response(bytes as BodyInit);
    Object.defineProperty(value, 'url', { value: responseUrl });
    return value;
  }

  it('取得先・redirect拒否・全bytes/hashと成功後だけのcacheを確認する', async () => {
    vi.stubGlobal('crypto', webcrypto);
    const bytes = new Uint8Array(await readFile('public/' + TAILWIND_COMPILER.path));
    const fetchAsset = vi.fn<typeof fetch>().mockResolvedValueOnce(response(bytes));
    const load = createTailwindCompilerLoader('/tsumucode/', fetchAsset);
    const result = await load(new AbortController().signal);
    expect(new TextEncoder().encode(result).length).toBe(TAILWIND_COMPILER.bytes);
    expect(await load(new AbortController().signal)).toBe(result);
    expect(fetchAsset).toHaveBeenCalledTimes(1);
    expect(fetchAsset.mock.calls[0]?.[0]).toEqual(new URL(url));
    expect(fetchAsset.mock.calls[0]?.[1]).toMatchObject({
      mode: 'same-origin',
      credentials: 'omit',
      redirect: 'error',
    });
  });

  it('異なるbytesと巨大bodyを拒否し、失敗をcacheしない', async () => {
    vi.stubGlobal('crypto', webcrypto);
    const fetchAsset = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response(new Uint8Array(TAILWIND_COMPILER.bytes)))
      .mockResolvedValueOnce(response(new Uint8Array(TAILWIND_COMPILER.bytes + 1)))
      .mockResolvedValueOnce(response(new Uint8Array(1)));
    const load = createTailwindCompilerLoader('/tsumucode/', fetchAsset);
    await expect(load(new AbortController().signal)).rejects.toThrow('内容');
    await expect(load(new AbortController().signal)).rejects.toThrow('容量');
    await expect(load(new AbortController().signal)).rejects.toThrow('容量');
    expect(fetchAsset).toHaveBeenCalledTimes(3);
  });

  it('最終URLの差異と取得前の取消を拒否する', async () => {
    const fetchAsset = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response(new Uint8Array(1), 'https://other.invalid/x'));
    const load = createTailwindCompilerLoader('/tsumucode/', fetchAsset);
    await expect(load(new AbortController().signal)).rejects.toThrow('読み込めません');
    const controller = new AbortController();
    controller.abort();
    await expect(load(controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchAsset).toHaveBeenCalledTimes(1);
  });

  it('digest待機中の取消で後着をcacheせず、次回取得をやり直す', async () => {
    const bytes = new Uint8Array(await readFile('public/' + TAILWIND_COMPILER.path));
    const realDigest = await webcrypto.subtle.digest('SHA-256', bytes);
    let finish: ((value: ArrayBuffer) => void) | undefined;
    const digest = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<ArrayBuffer>((resolve) => {
            finish = resolve;
          }),
      )
      .mockResolvedValue(realDigest);
    vi.stubGlobal('crypto', { subtle: { digest } });
    const fetchAsset = vi.fn<typeof fetch>().mockImplementation(async () => response(bytes));
    const load = createTailwindCompilerLoader('/tsumucode/', fetchAsset);
    const controller = new AbortController();
    const pending = load(controller.signal).catch((error: unknown) => error);
    await vi.waitFor(() => {
      expect(digest).toHaveBeenCalledTimes(1);
    });
    controller.abort();
    finish!(realDigest);
    expect(await pending).toMatchObject({ name: 'AbortError' });
    expect(await load(new AbortController().signal)).toContain('tailwindcss');
    expect(fetchAsset).toHaveBeenCalledTimes(2);
  });
});
