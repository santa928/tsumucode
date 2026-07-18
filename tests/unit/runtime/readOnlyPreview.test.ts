import { afterEach, describe, expect, it, vi } from 'vitest';
import { HtmlCssReadOnlyPreviewAdapter } from '../../../src/adapters/runtime/read-only-html-css/HtmlCssReadOnlyPreviewAdapter';
import { createStaticPreviewSrcdoc } from '../../../src/adapters/runtime/preview-kernel/createStaticSrcdoc';
import { sanitizeHtml } from '../../../src/adapters/runtime/preview-kernel/sanitizeHtml';
import { ReadOnlyPreviewRegistry } from '../../../src/core/runtime/ReadOnlyPreviewRegistry';
import type { ReadOnlyPreviewAdapter, RunnerInput } from '../../../src/core/runtime/contracts';

/** 安全なread-only Preview入力へ差分を重ねる。 */
function previewInput(overrides: Partial<RunnerInput> = {}): RunnerInput {
  return {
    exerciseSessionId: 'session-readonly',
    executionRevision: 4,
    languageId: 'html-css',
    files: { 'index.html': '<main><h1>完成</h1></main>' },
    assets: [],
    viewport: { id: 'mobile', width: 390, height: 844 },
    options: { readOnly: true },
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe('ReadOnlyPreviewRegistry', () => {
  it('IDと最小port factoryだけで将来言語のadapterを生成できる', () => {
    const adapter: ReadOnlyPreviewAdapter = {
      languageId: 'fixture',
      prepare: vi.fn(async () => undefined),
      render: vi.fn(async () => undefined),
      dispose: vi.fn(async () => undefined),
    };
    const factory = vi.fn(() => adapter);
    const registry = new ReadOnlyPreviewRegistry();

    registry.register('fixture', factory);

    expect(registry.create('fixture')).toBe(adapter);
    expect(factory).toHaveBeenCalledTimes(2);
    expect(() => registry.create('unknown')).toThrow('not registered');
  });
});

describe('HtmlCssReadOnlyPreviewAdapter', () => {
  it('static経路だけで全Anchorの移動能力と操作可能semanticsを除き、入力Documentを変更しない', () => {
    const sanitized = sanitizeHtml(
      '<main>' +
        '<a id="https" href="https://example.com/docs" role="link" tabindex="0">HTTPS <strong>Guide</strong></a>' +
        '<a id="relative" href="guide/page.html?x=1#part">Relative</a>' +
        '<a id="fragment" href="#part">Fragment</a>' +
        '</main>',
      [],
    ).document;
    const before = sanitized.documentElement.outerHTML;
    expect(
      [...sanitized.querySelectorAll('a')].map((anchor) => anchor.getAttribute('href')),
    ).toEqual(['https://example.com/docs', 'guide/page.html?x=1#part', '#part']);

    const srcdoc = createStaticPreviewSrcdoc({ sanitizedDocument: sanitized, css: '' });
    const preview = new DOMParser().parseFromString(srcdoc, 'text/html');

    expect(sanitized.documentElement.outerHTML).toBe(before);
    for (const id of ['https', 'relative', 'fragment']) {
      const anchor = preview.querySelector(`#${id}`);
      expect(anchor?.tagName).toBe('A');
      expect(anchor?.hasAttribute('href')).toBe(false);
      expect(anchor?.hasAttribute('tabindex')).toBe(false);
      expect(anchor?.hasAttribute('role')).toBe(false);
      expect(anchor?.hasAttribute('aria-disabled')).toBe(false);
    }
    expect(preview.querySelector('#https')?.textContent).toBe('HTTPS Guide');
    expect(preview.querySelector('#https strong')?.textContent).toBe('Guide');
    expect(preview.querySelectorAll('script')).toHaveLength(0);
    expect(
      preview.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content'),
    ).toContain("script-src 'none'");
  });

  it('script権限とBridgeなしでsanitized HTML/CSSだけをopaque frameへ描画する', async () => {
    const frame = document.createElement('iframe');
    document.body.append(frame);
    const adapter = new HtmlCssReadOnlyPreviewAdapter();
    await adapter.prepare(frame);

    await adapter.render(
      previewInput({
        files: {
          'index.html':
            '<script>parent.postMessage("pwned", "*")</script>' +
            '<main onclick="alert(1)"><h1>完成</h1></main>' +
            '<link rel="stylesheet" href="styles/main.css">',
          'styles/main.css': 'main{color:green;background:url(https://evil.test/x)}',
        },
      }),
    );

    expect(frame.getAttribute('sandbox')).toBe('');
    expect(frame.srcdoc).toContain("script-src 'none'");
    expect(frame.srcdoc).not.toContain('<script');
    expect(frame.srcdoc).toContain('<main><h1>完成</h1></main>');
    expect(frame.srcdoc).not.toMatch(/pwned|onclick|evil\.test|data-tsumucode-preview-bridge/iu);
    expect(frame.srcdoc).not.toContain('<link');
    await adapter.dispose();
  });

  it('Assetを共有kernelでData URL化し、disposeでframeを冪等に解放する', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response('png', {
            headers: { 'content-type': 'image/png' },
          }),
      ),
    );
    const frame = document.createElement('iframe');
    document.body.append(frame);
    const adapter = new HtmlCssReadOnlyPreviewAdapter();
    await adapter.prepare(frame);

    await adapter.render(
      previewInput({
        files: { 'index.html': '<main><img src="asset:hero" alt="Hero"></main>' },
        assets: [{ id: 'hero', mediaType: 'image', url: '/assets/hero.png' }],
      }),
    );

    const preview = new DOMParser().parseFromString(frame.srcdoc, 'text/html');
    expect(preview.querySelector('img')?.getAttribute('src')).toBe('data:image/png;base64,cG5n');
    await adapter.dispose();
    await adapter.dispose();
    expect(frame.srcdoc).toBe('');
  });

  it('disposeはin-flight Asset取得をAbortし、stale srcdocを残さない', async () => {
    const fetchAsset = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> =>
        await new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => {
              reject(new DOMException('aborted', 'AbortError'));
            },
            { once: true },
          );
        }),
    );
    vi.stubGlobal('fetch', fetchAsset);
    const frame = document.createElement('iframe');
    document.body.append(frame);
    const adapter = new HtmlCssReadOnlyPreviewAdapter();
    await adapter.prepare(frame);
    const outcome = adapter
      .render(
        previewInput({
          assets: [{ id: 'hero', mediaType: 'image', url: '/assets/hero.png' }],
        }),
      )
      .catch((error: unknown) => error);
    await vi.waitFor(() => {
      expect(fetchAsset).toHaveBeenCalledOnce();
    });

    await adapter.dispose();

    await expect(outcome).resolves.toMatchObject({ name: 'AbortError' });
    expect(frame.srcdoc).toBe('');
  });
});
