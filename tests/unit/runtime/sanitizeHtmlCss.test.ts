import { describe, expect, it } from 'vitest';
import type { ResolvedPreviewAsset } from '../../../src/core/runtime/contracts';
import { sanitizeCss } from '../../../src/adapters/runtime/html-css/sanitizeCss';
import { sanitizeHtml } from '../../../src/adapters/runtime/html-css/sanitizeHtml';

const assets: readonly ResolvedPreviewAsset[] = [
  { id: 'hero', mediaType: 'image', url: 'blob:https://tsumucode.test/hero' },
  { id: 'icon', mediaType: 'image', url: 'data:image/png;base64,AAAA' },
  { id: 'font', mediaType: 'font', url: 'data:font/woff2;base64,BBBB' },
  { id: 'other', mediaType: 'other', url: 'blob:https://tsumucode.test/other' },
  { id: 'bad-data', mediaType: 'image', url: 'data:text/html;base64,PHNjcmlwdD4=' },
  { id: 'bad-network', mediaType: 'image', url: 'https://evil.test/image.png' },
];

/** Security diagnosticsを発生順のcode配列へ縮約する。 */
function codes(result: { readonly diagnostics: readonly { readonly code: string }[] }): string[] {
  return result.diagnostics.map(({ code }) => code);
}

describe('CSS sanitizer', () => {
  it('全@importと未許可URLを除き、asset IDだけを信頼済みURLへ解決する', () => {
    const result = sanitizeCss(
      '@import "https://evil.test/x.css" layer(base) supports(display:grid) screen;\n' +
        '.a{background:url(https://evil.test/x)}\n' +
        '.b{background:URL("asset:hero");mask:url(asset:icon)}\n' +
        '@font-face{src:url(asset:font)}',
      assets,
    );

    expect(result.css).not.toMatch(/@import|evil\.test/iu);
    expect(result.css).toContain('url("blob:https://tsumucode.test/hero")');
    expect(result.css).toContain('url("data:image/png;base64,AAAA")');
    expect(result.css).toContain('url("data:font/woff2;base64,BBBB")');
    expect(codes(result)).toEqual(['CSS_IMPORT_REMOVED', 'CSS_URL_REMOVED']);
  });

  it.each([
    ['@IMPORT "https://evil.test/a.css";', '\n.safe{color:green}'],
    ['@\\69mport "https://evil.test/b.css";', '\n.safe{color:green}'],
    ['@im\\70 ort url("https://evil.test/c.css") layer(theme) print;', '\n.safe{color:green}'],
    ['@import/**/url("https://evil.test/d.css") supports(display:flex);', '\n.safe{color:green}'],
    ['@import url("https://evil.test/e;still.css") screen;', '\n.safe{color:green}'],
    ['@import "https://evil.test/unclosed.css"', ''],
  ])('case・escape・comment・条件に関係なくImport rule全体を除く: %s', (source, expected) => {
    const result = sanitizeCss(`${source}\n.safe{color:green}`, assets);
    expect(result.css).toBe(expected);
    expect(codes(result)).toEqual(['CSS_IMPORT_REMOVED']);
  });

  it('comment・string内の@importとurlは文字として保持し、診断しない', () => {
    const source =
      '/* @import url(https://comment.test); */\n' +
      '.label::before{content:"@import url(https://literal.test)"}';
    const result = sanitizeCss(source, assets);
    expect(result.css).toBe(source);
    expect(result.diagnostics).toEqual([]);
  });

  it.each(['\n', '\r', '\f'])('bad stringを終端する%s後の外部URLを見逃さない', (newline) => {
    const result = sanitizeCss(
      `.broken{content:"${newline}}.evil{background:url(https://evil.test/x)}.tail{content:"}`,
      assets,
    );

    expect(result.css).not.toContain('evil.test');
    expect(codes(result)).toEqual(['CSS_URL_REMOVED']);
  });

  it('CSS stringのescaped CRLFを継続行として読み、Asset IDを解決する', () => {
    const result = sanitizeCss('.hero{background:url("asset:\\\r\nhero")}', assets);

    expect(result.css).toContain('url("blob:https://tsumucode.test/hero")');
    expect(result.diagnostics).toEqual([]);
  });

  it('escaped url functionとescaped asset IDを解決し、直接URL・型不一致を拒否する', () => {
    const duplicateAssets: readonly ResolvedPreviewAsset[] = [
      ...assets,
      { id: 'duplicate', mediaType: 'image', url: 'blob:https://tsumucode.test/one' },
      { id: 'duplicate', mediaType: 'image', url: 'blob:https://tsumucode.test/two' },
    ];
    const result = sanitizeCss(
      '.ok{a:u\\72l(\\61sset\\3a hero)}' +
        '.direct{a:url(blob:https://tsumucode.test/hero);b:url(data:image/png;base64,AAAA)}' +
        '.invalid{a:url(asset:other);b:url(asset:bad-data);c:url(asset:bad-network);d:url(asset:duplicate)}',
      duplicateAssets,
    );

    expect(result.css).toContain('a:url("blob:https://tsumucode.test/hero")');
    expect(result.css.match(/url\(""\)/gu)).toHaveLength(6);
    expect(codes(result)).toEqual(Array.from({ length: 6 }, () => 'CSS_URL_REMOVED'));
  });

  it('未閉じurlをfail-closedで空URLへ置換し、同一入力へ決定的な結果を返す', () => {
    const source = '.broken{background:url("https://evil.test/image.png"';
    const first = sanitizeCss(source, assets);
    const second = sanitizeCss(source, assets);
    expect(first).toEqual(second);
    expect(first.css).toBe('.broken{background:url("")');
    expect(codes(first)).toEqual(['CSS_URL_REMOVED']);
  });
});

describe('HTML sanitizer', () => {
  it('bodyの安全なclass・data属性を保持し、予約属性は除く', () => {
    const result = sanitizeHtml(
      '<body class="course" data-profile-page data-tsumucode-forged="true"><main>本文</main></body>',
      [],
    );

    expect(result.document.body.getAttribute('class')).toBe('course');
    expect(result.document.body.hasAttribute('data-profile-page')).toBe(true);
    expect(result.document.body.hasAttribute('data-tsumucode-forged')).toBe(false);
  });

  it('charset metaだけを安全な文書情報として保持し、active metaを除く', () => {
    const result = sanitizeHtml(
      '<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>HTMLの練習</title>' +
        '<meta http-equiv="refresh" content="0;url=https://evil.test"></head><body></body>',
      assets,
    );

    expect(result.document.head.innerHTML).toContain('<meta charset="UTF-8">');
    expect(result.document.head.innerHTML).toContain(
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
    );
    expect(result.document.head.innerHTML).toContain('<title>HTMLの練習</title>');
    expect(result.document.head.innerHTML).not.toContain('http-equiv');
    expect(codes(result)).toContain('HTML_UNSAFE_NODE_REMOVED');
  });

  it('active node・foreign namespace・event属性をsubtreeごと除き、安全なrootと本文を再構築する', () => {
    const result = sanitizeHtml(
      '<!doctype html><html lang="ja" dir="ltr" onclick="alert(1)"><head>' +
        '<title>安全な題名</title><meta http-equiv="refresh" content="0;url=https://evil.test">' +
        '<base href="https://evil.test"><script>parent.localStorage.clear()</script></head><body>' +
        '<iframe src="https://evil.test"><p>iframe fallback</p></iframe>' +
        '<object data="https://evil.test"><p>object fallback</p></object>' +
        '<template><img src=x onerror=alert(1)></template>' +
        '<svg><a href="javascript:alert(1)">svg link</a></svg>' +
        '<math><mtext>math text</mtext></math>' +
        '<main><h1>積む</h1></main></body></html>',
      assets,
    );
    const html = result.document.documentElement.outerHTML;

    expect(html).toContain('<html lang="ja" dir="ltr">');
    expect(html).toContain('<title>安全な題名</title>');
    expect(html).toContain('<main><h1>積む</h1></main>');
    expect(html).not.toMatch(
      /onclick|<meta|<base|<script|localStorage|<iframe|iframe fallback|<object|object fallback|<template|<svg|svg link|<math|math text/iu,
    );
    expect(codes(result)).toContain('HTML_EVENT_REMOVED');
    expect(codes(result).filter((code) => code === 'HTML_UNSAFE_NODE_REMOVED')).toHaveLength(8);
  });

  it('Link URL許可表を守り、navigation・送信attributeとcontrol文字schemeを除く', () => {
    const result = sanitizeHtml(
      '<main>' +
        '<a id="https" href="https://example.com/docs" target="_blank" ping="https://evil.test">https</a>' +
        '<a id="fragment" href="#part">fragment</a>' +
        '<a id="relative" href="guide/page.html?x=1#part">relative</a>' +
        '<a id="javascript" href="java&#x09;script:alert(1)">bad</a>' +
        '<a id="vbscript" href="vbscript:msgbox(1)">bad</a>' +
        '<a id="data" href="data:text/html,evil">bad</a>' +
        '<a id="file" href="file:///etc/passwd">bad</a>' +
        '<a id="protocol-relative" href="//evil.test/path">bad</a>' +
        '<a id="root-relative" href="/admin">bad</a>' +
        '<a id="parent" href="../secret.html">bad</a>' +
        '<form action="https://evil.test" method="post"><button formaction="https://evil.test">送信</button></form>' +
        '</main>',
      assets,
    );
    const document = result.document;

    expect(document.querySelector('#https')?.getAttribute('href')).toBe('https://example.com/docs');
    expect(document.querySelector('#fragment')?.getAttribute('href')).toBe('#part');
    expect(document.querySelector('#relative')?.getAttribute('href')).toBe(
      'guide/page.html?x=1#part',
    );
    for (const id of [
      'javascript',
      'vbscript',
      'data',
      'file',
      'protocol-relative',
      'root-relative',
      'parent',
    ]) {
      expect(document.querySelector(`#${id}`)?.hasAttribute('href')).toBe(false);
    }
    expect(document.querySelector('#https')?.hasAttribute('target')).toBe(false);
    expect(document.querySelector('#https')?.hasAttribute('ping')).toBe(false);
    expect(document.querySelector('form')?.hasAttribute('action')).toBe(false);
    expect(document.querySelector('form')?.hasAttribute('method')).toBe(false);
    expect(document.querySelector('button')?.hasAttribute('formaction')).toBe(false);
  });

  it('stylesheet相対pathとimage Asset IDだけを解決し、直接・型違いURLを除く', () => {
    const result = sanitizeHtml(
      '<head>' +
        '<link id="css" rel="stylesheet" href="styles/main.css">' +
        '<link id="external" rel="stylesheet" href="https://evil.test/x.css">' +
        '<link id="preload" rel="preload" href="styles/main.css">' +
        '</head><body>' +
        '<img id="hero" src="asset:hero" alt="hero">' +
        '<img id="bare" data-tsumucode-asset-id="hero" src="hero" alt="bare">' +
        '<img id="direct" src="blob:https://tsumucode.test/hero" alt="direct">' +
        '<img id="font" src="asset:font" alt="font">' +
        '<img id="external-img" src="https://evil.test/image.png" alt="external">' +
        '</body>',
      assets,
    );
    const document = result.document;

    expect(document.querySelector('#css')?.getAttribute('href')).toBe('styles/main.css');
    expect(document.querySelector('#external')).toBeNull();
    expect(document.querySelector('#preload')).toBeNull();
    expect(document.querySelector('#hero')?.getAttribute('src')).toBe(
      'blob:https://tsumucode.test/hero',
    );
    expect(document.querySelector('#hero')?.getAttribute('data-tsumucode-asset-id')).toBe('hero');
    expect(document.querySelector('#bare')?.hasAttribute('data-tsumucode-asset-id')).toBe(false);
    for (const id of ['bare', 'direct', 'font', 'external-img']) {
      expect(document.querySelector(`#${id}`)?.hasAttribute('src')).toBe(false);
    }
  });

  it('style elementとinline styleを同じCSS境界で処理し、診断をすべて伝播する', () => {
    const result = sanitizeHtml(
      '<style>@import "https://evil.test/x.css";.hero{background:url(asset:hero)}' +
        '.label::before{content:"url(https://literal.test)"}</style>' +
        '<main><div id="hero" style="background:url(asset:icon);mask:url(https://evil.test/mask)">Hero</div></main>',
      assets,
    );
    const styleText = result.document.querySelector('style')?.textContent ?? '';
    const inlineStyle = result.document.querySelector('#hero')?.getAttribute('style') ?? '';

    expect(styleText).not.toContain('@import');
    expect(styleText).toContain('url("blob:https://tsumucode.test/hero")');
    expect(styleText).toContain('content:"url(https://literal.test)"');
    expect(inlineStyle).toContain('url("data:image/png;base64,AAAA")');
    expect(inlineStyle).toContain('url("")');
    expect(codes(result)).toEqual(['CSS_IMPORT_REMOVED', 'CSS_URL_REMOVED']);
  });

  it('安全な構造・ARIA・data属性を保持し、同一入力へ決定的な新規Documentを返す', () => {
    const source =
      '<main id="main" class="stack" aria-label="教材" data-step="1"><section><h2>章</h2>' +
      '<form novalidate><label for="name">名前</label><input id="name" name="name" required></form>' +
      '<table><thead><tr><th scope="col">見出し</th></tr></thead><tbody><tr><td>値</td></tr></tbody></table>' +
      '</section></main>';
    const first = sanitizeHtml(source, assets);
    const second = sanitizeHtml(source, assets);

    expect(first.document).not.toBe(second.document);
    expect(first.document.documentElement.outerHTML).toBe(
      second.document.documentElement.outerHTML,
    );
    expect(first.diagnostics).toEqual(second.diagnostics);
    expect(first.document.querySelector('main')).toMatchObject({
      id: 'main',
      className: 'stack',
    });
    expect(first.document.querySelector('main')?.getAttribute('aria-label')).toBe('教材');
    expect(first.document.querySelector('main')?.getAttribute('data-step')).toBe('1');
    expect(first.document.querySelector('input')?.hasAttribute('required')).toBe(true);
    expect(first.document.querySelector('th')?.getAttribute('scope')).toBe('col');
    expect(first.diagnostics).toEqual([]);
  });
});
