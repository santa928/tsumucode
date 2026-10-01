/** 持ち出す内容の境界と、失敗時にも残らないDownload資源を検証する。 */
import { strFromU8, unzipSync } from 'fflate';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createPortableHtmlArchive,
  downloadPortableHtmlArchive,
  PORTABLE_HTML_SOURCE_BYTE_LIMIT,
} from './portableHtmlArchive';

afterEach(() => {
  vi.useRealTimers();
});

describe('代表HTML/CSSのソースZIP', () => {
  it('日本語・改行を保持し、未知のFileや学習情報・Traversalを含めない', () => {
    const files = {
      'index.html': '<h1>わたしの学習ノート 🌱</h1>\r\n',
      'styles.css': 'body { background-color: #fffaf0; }\n',
      '../private.json': '他Workspace',
      'progress.json': '進捗と履歴',
      'solution.html': '教材の解答',
    };
    const entries = unzipSync(createPortableHtmlArchive(files));
    expect(Object.keys(entries).sort()).toEqual(['README.md', 'index.html', 'styles.css']);
    expect(strFromU8(entries['index.html']!)).toBe(files['index.html']);
    expect(strFromU8(entries['styles.css']!)).toBe(files['styles.css']);
    expect(strFromU8(entries['README.md']!)).toContain('index.htmlをブラウザで開きます');
    expect(strFromU8(entries['README.md']!)).toContain('隔離プレビューと実行条件が異なります');
  });

  it('欠けたソースや継承されたFileを有効な成果物にしない', () => {
    expect(() => createPortableHtmlArchive({ 'index.html': '<h1>途中</h1>' })).toThrow(
      'そろっていません',
    );
    const inherited = Object.create({ 'index.html': '<h1>別のデータ</h1>' }) as Record<
      string,
      string
    >;
    inherited['styles.css'] = '';
    expect(() => createPortableHtmlArchive(inherited)).toThrow('そろっていません');
  });

  it('文字数ではなくUTF-8合計で制限し、境界内のソースを残す', () => {
    const boundary = {
      'index.html': 'x'.repeat(PORTABLE_HTML_SOURCE_BYTE_LIMIT),
      'styles.css': '',
    };
    expect(unzipSync(createPortableHtmlArchive(boundary))['index.html']).toHaveLength(
      PORTABLE_HTML_SOURCE_BYTE_LIMIT,
    );
    expect(() => createPortableHtmlArchive({ ...boundary, 'styles.css': 'x' })).toThrow('256 KiB');
    expect(() =>
      createPortableHtmlArchive({ 'index.html': 'あ'.repeat(100_000), 'styles.css': '' }),
    ).toThrow('256 KiB');
  });
});

describe('ZIPのBrowser Download', () => {
  for (const fails of [false, true]) {
    it(`${fails ? 'Click失敗' : '成功'}でもAnchorを除去し、次のタスクでURLを解放する`, () => {
      vi.useFakeTimers();
      const create = vi.fn(() => 'blob:portable-test');
      const revoke = vi.fn();
      vi.stubGlobal('URL', { createObjectURL: create, revokeObjectURL: revoke });
      const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
        this: HTMLAnchorElement,
      ) {
        expect(this.download).toBe('tsumucode-html-intro.zip');
        expect(this.isConnected).toBe(true);
        expect(revoke).not.toHaveBeenCalled();
        if (fails) throw new Error('Click failed');
      });
      try {
        const download = () => {
          downloadPortableHtmlArchive(new Uint8Array([1, 2]));
        };
        if (fails) expect(download).toThrow('Click failed');
        else download();
        expect(click).toHaveBeenCalledOnce();
        expect(document.querySelector('a[download]')).toBeNull();
        expect(revoke).not.toHaveBeenCalled();
        vi.runAllTimers();
        expect(revoke).toHaveBeenCalledWith('blob:portable-test');
      } finally {
        vi.unstubAllGlobals();
      }
    });
  }
});
