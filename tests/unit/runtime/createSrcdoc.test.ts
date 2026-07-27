import { describe, expect, it, vi } from 'vitest';
import { createBridgeSource } from '../../../src/adapters/runtime/html-css/bridgeSource';
import { createPreviewSrcdoc } from '../../../src/adapters/runtime/html-css/createSrcdoc';
import { sanitizeHtml } from '../../../src/adapters/runtime/html-css/sanitizeHtml';

interface SrcdocOverrides {
  readonly css?: string;
  readonly nonce?: string;
  readonly exerciseSessionId?: string;
  readonly executionRevision?: number;
  readonly bootstrapToken?: string;
  readonly viewport?: {
    readonly id: string;
    readonly width: number;
    readonly height: number;
    readonly reducedMotion?: 'reduce';
  };
}

/** 安全な既定値へ差分を重ねてsrcdocを生成する。 */
function createSrcdoc(source: string, overrides: SrcdocOverrides = {}): string {
  const sanitized = sanitizeHtml(source, []);
  return createPreviewSrcdoc({
    sanitizedDocument: sanitized.document,
    css: overrides.css ?? 'main{display:block}',
    nonce: overrides.nonce ?? 'abc123',
    exerciseSessionId: overrides.exerciseSessionId ?? 'session-1',
    executionRevision: overrides.executionRevision ?? 3,
    bootstrapToken: overrides.bootstrapToken ?? 'bootstrap-token',
    viewport: overrides.viewport ?? { id: 'desktop', width: 1280, height: 720 },
  });
}

describe('secure srcdoc', () => {
  it('reduce Viewportではprefers-reduced-motion Ruleを検証用Overrideへ展開する', () => {
    const parsed = new DOMParser().parseFromString(
      createSrcdoc('<main class="motion-card">Motion</main>', {
        css: '@media (prefers-reduced-motion: reduce) { .motion-card { animation-duration: 0.001s; } }',
        viewport: { id: 'mobile-reduced', width: 390, height: 844, reducedMotion: 'reduce' },
      }),
      'text/html',
    );
    const bridge = parsed.querySelector('script')?.textContent ?? '';

    expect(bridge).toContain('"reducedMotion":"reduce"');
    expect(bridge).toContain('prefers-reduced-motion');
    expect(bridge).toContain('instanceof CSSMediaRule');
  });

  it('CSPを先頭へ置き、trusted Bridgeだけにnonceを付けて安全な本文を構築する', () => {
    const srcdoc = createSrcdoc(
      '<html lang="ja"><head><title>教材</title><link rel="stylesheet" href="styles/main.css">' +
        '<script>alert(1)</script><meta http-equiv="refresh" content="0;url=https://evil.test"></head>' +
        '<body class="course" data-profile-page><main onclick="alert(1)"><link rel="stylesheet" href="styles/nested.css">' +
        '<h1>積む</h1></main></body></html>',
    );
    const parsed = new DOMParser().parseFromString(srcdoc, 'text/html');
    const csp = parsed.head.firstElementChild;
    const scripts = [...parsed.querySelectorAll('script')];

    expect(srcdoc.startsWith('<!doctype html>')).toBe(true);
    expect(csp?.tagName).toBe('META');
    expect(csp?.getAttribute('http-equiv')).toBe('Content-Security-Policy');
    expect(csp?.getAttribute('content')).toContain("default-src 'none'");
    expect(csp?.getAttribute('content')).toContain("script-src 'nonce-abc123'");
    expect(csp?.getAttribute('content')).toContain("connect-src 'none'");
    expect(csp?.getAttribute('content')).toContain("form-action 'none'");
    expect(scripts).toHaveLength(1);
    expect(scripts[0]?.getAttribute('nonce')).toBe('abc123');
    expect(parsed.querySelector('link')).toBeNull();
    expect(srcdoc).toContain('styles/main.css');
    expect(parsed.body.getAttribute('class')).toBe('course');
    expect(parsed.body.hasAttribute('data-profile-page')).toBe(true);
    expect(parsed.querySelector('main')?.outerHTML).toBe('<main><h1>積む</h1></main>');
    expect(srcdoc.indexOf('Content-Security-Policy')).toBeLessThan(srcdoc.indexOf('<main>'));
  });

  it('BridgeをDOM ready後・learner DOM限定観測・navigation抑止で構成する', () => {
    const parsed = new DOMParser().parseFromString(createSrcdoc('<main>本文</main>'), 'text/html');
    const bridge = parsed.querySelector('script')?.textContent ?? '';

    expect(bridge).toContain('DOMContentLoaded');
    expect(bridge).toMatch(/addEventListener\(["']click["']/u);
    expect(bridge).toMatch(/addEventListener\(["']auxclick["']/u);
    expect(bridge).toMatch(/addEventListener\(["']submit["']/u);
    expect(bridge).toContain('document.body.querySelectorAll');
    expect(bridge).toContain('document.head.querySelectorAll');
    expect(bridge).not.toMatch(/document\.querySelectorAll\(/u);
  });

  it('Bridge runtimeがready後に安全なrootとbodyを観測し、再送tokenとnavigationを拒否する', async () => {
    const frame = document.createElement('iframe');
    document.body.append(frame);
    const childWindow = frame.contentWindow!;
    const parentWindow = childWindow.parent;
    const messages: unknown[] = [];
    const postMessage = vi.spyOn(parentWindow, 'postMessage').mockImplementation((message) => {
      messages.push(message);
    });
    try {
      const source = createBridgeSource({
        exerciseSessionId: 'session-1',
        executionRevision: 3,
        bootstrapToken: 'bootstrap-token',
        viewport: { id: 'desktop', width: 1280, height: 720 },
        stylesheetReferences: [
          {
            attributes: [
              ['rel', 'stylesheet'],
              ['href', 'styles.css'],
            ],
          },
        ],
      });
      Object.defineProperty(childWindow.document, 'readyState', {
        configurable: true,
        get: () => 'loading',
      });
      childWindow.document.open();
      // eslint-disable-next-line @typescript-eslint/no-deprecated -- parser中のBridge実行とDOMContentLoaded前状態を再現するTest専用fixture。
      childWindow.document.write(
        '<!doctype html><html><head><style>' +
          '.primary:focus-visible{outline-width:3px;outline-style:solid;outline-offset:4px}' +
          '.contact:focus-visible{outline-width:5px;outline-style:dashed;outline-offset:6px}' +
          '</style>' +
          '<script id="trusted" type="application/json">secret</script>' +
          `<script>document.documentElement.dataset.bridgeExecuted="true";document.documentElement.dataset.bridgeReadyState=document.readyState;${source}</script></head><body><main id="lesson">` +
          '<nav><a class="primary" id="guide" href="https://example.com">Guide</a>' +
          '<a class="contact" id="contact" href="https://example.com/contact">Contact</a></nav>' +
          '<img id="preview-image" alt="Preview" src="data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3C%2Fsvg%3E">' +
          '</main></body></html>',
      );

      expect(childWindow.document.documentElement.dataset.bridgeExecuted).toBe('true');
      expect(childWindow.document.documentElement.dataset.bridgeReadyState).toBe('loading');
      expect(messages).toEqual([]);
      Reflect.deleteProperty(childWindow.document, 'readyState');
      let finishImageDecode: (() => void) | undefined;
      const image = childWindow.document.querySelector<HTMLImageElement>('#preview-image')!;
      const decode = vi.fn(
        () =>
          new Promise<void>((resolve) => {
            finishImageDecode = resolve;
          }),
      );
      Object.defineProperty(image, 'decode', { configurable: true, value: decode });
      childWindow.document.dispatchEvent(new Event('DOMContentLoaded'));
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(decode).toHaveBeenCalledOnce();
      expect(messages).toEqual([]);
      finishImageDecode?.();
      await vi.waitFor(() => {
        expect(messages[0]).toMatchObject({
          type: 'bridge.ready',
          oneTimeToken: 'bootstrap-token',
        });
      });

      const anchor = childWindow.document.querySelector('a')!;
      const click = new MouseEvent('click', { bubbles: true, cancelable: true });
      const auxclick = new MouseEvent('auxclick', { bubbles: true, cancelable: true });
      anchor.dispatchEvent(click);
      anchor.dispatchEvent(auxclick);
      expect(click.defaultPrevented).toBe(true);
      expect(auxclick.defaultPrevented).toBe(true);

      const request = {
        version: 1,
        type: 'snapshot.request',
        exerciseSessionId: 'session-1',
        executionRevision: 3,
        requestId: 'request-1',
        oneTimeToken: 'one-time-token',
        payload: {
          selectors: [
            'script',
            'link[rel="stylesheet"][href="styles.css"]',
            'html',
            'main',
            'nav',
            'a',
          ],
          attributes: ['id', 'href', 'rel'],
          computedStyles: ['display'],
          focusVisibleSelectors: ['.primary', '.contact'],
          focusVisibleComputedStyles: ['outline-width', 'outline-style', 'outline-offset'],
          includeAllElements: false,
        },
      };
      childWindow.dispatchEvent(
        new MessageEvent('message', { source: parentWindow, data: request }),
      );
      const response = messages[1] as {
        readonly type: string;
        readonly payload: {
          readonly nodes: readonly {
            readonly tagName: string;
            readonly text: string;
            readonly accessibleName: string;
            readonly matchedSelectors: readonly string[];
            readonly focusVisibleComputedStyles: Readonly<Record<string, string>>;
          }[];
        };
      };
      expect(response.type).toBe('snapshot.response');
      expect(response.payload.nodes.map(({ tagName }) => tagName)).toEqual([
        'html',
        'head',
        'link',
        'html',
        'body',
        'main',
        'nav',
        'a',
        'a',
      ]);
      expect(
        response.payload.nodes.some(
          ({ tagName, matchedSelectors }) =>
            tagName === 'html' && matchedSelectors.includes('html'),
        ),
      ).toBe(true);
      expect(response.payload.nodes.every(({ text }) => !text.includes('secret'))).toBe(true);
      expect(
        response.payload.nodes.every(({ accessibleName }) => !accessibleName.includes('secret')),
      ).toBe(true);
      expect(response.payload.nodes.find(({ tagName }) => tagName === 'nav')?.accessibleName).toBe(
        '',
      );
      expect(
        response.payload.nodes.find(({ tagName }) => tagName === 'a')?.focusVisibleComputedStyles,
      ).toMatchObject({
        'outline-width': '3px',
        'outline-style': 'solid',
        'outline-offset': '4px',
      });
      expect(
        response.payload.nodes.find(({ accessibleName }) => accessibleName === 'Contact')
          ?.focusVisibleComputedStyles,
      ).toMatchObject({
        'outline-width': '5px',
        'outline-style': 'dashed',
        'outline-offset': '6px',
      });

      childWindow.dispatchEvent(
        new MessageEvent('message', {
          source: parentWindow,
          data: {
            ...request,
            requestId: 'request-repeat',
            oneTimeToken: 'repeat-token',
          },
        }),
      );
      const repeatedResponse = messages[2] as typeof response;
      expect(
        repeatedResponse.payload.nodes.find(({ accessibleName }) => accessibleName === 'Guide')
          ?.focusVisibleComputedStyles,
      ).toMatchObject({
        'outline-width': '3px',
        'outline-style': 'solid',
        'outline-offset': '4px',
      });
      expect(
        repeatedResponse.payload.nodes.find(({ accessibleName }) => accessibleName === 'Contact')
          ?.focusVisibleComputedStyles,
      ).toMatchObject({
        'outline-width': '5px',
        'outline-style': 'dashed',
        'outline-offset': '6px',
      });

      childWindow.dispatchEvent(
        new MessageEvent('message', {
          source: parentWindow,
          data: {
            ...request,
            requestId: 'request-root',
            oneTimeToken: 'root-token',
            payload: { ...request.payload, selectors: ['html'] },
          },
        }),
      );
      expect(messages[3]).toMatchObject({
        type: 'snapshot.response',
        payload: { nodes: [{ tagName: 'html', matchedSelectors: ['html'] }] },
      });

      childWindow.dispatchEvent(
        new MessageEvent('message', { source: parentWindow, data: request }),
      );
      expect(messages).toHaveLength(4);

      childWindow.dispatchEvent(
        new MessageEvent('message', {
          source: parentWindow,
          data: {
            ...request,
            requestId: 'request-2',
            oneTimeToken: 'one-time-token-2',
            payload: { ...request.payload, unknown: true },
          },
        }),
      );
      expect(messages[4]).toMatchObject({
        type: 'bridge.error',
        requestId: 'request-2',
        payload: 'Snapshot policy schema error',
      });
    } finally {
      childWindow.document.close();
      postMessage.mockRestore();
      frame.remove();
    }
  });

  it('external CSSのraw-text終了列を無害化してlearner markupを復活させない', () => {
    const srcdoc = createSrcdoc('<main>安全</main>', {
      css: 'main{color:red}</style><script data-learner>parent.postMessage("pwned","*")</script>',
    });
    const parsed = new DOMParser().parseFromString(srcdoc, 'text/html');

    expect(parsed.querySelectorAll('script')).toHaveLength(1);
    expect(parsed.querySelector('[data-learner]')).toBeNull();
    expect(parsed.body.textContent).toContain('安全');
  });

  it.each([
    ['nonce', { nonce: 'bad; script-src *' }],
    ['session', { exerciseSessionId: '' }],
    ['token', { bootstrapToken: 'bad token' }],
    ['revision', { executionRevision: -1 }],
    ['viewport width', { viewport: { id: 'desktop', width: Infinity, height: 720 } }],
    ['viewport height', { viewport: { id: 'desktop', width: 1280, height: 0 } }],
  ] satisfies readonly [string, SrcdocOverrides][])(
    '%sの不正configをsrcdocへ埋め込まない',
    (_name, value) => {
      expect(() => createSrcdoc('<main/>', value)).toThrow('Invalid preview configuration');
    },
  );
});
