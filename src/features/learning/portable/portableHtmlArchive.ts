import { downloadArchive } from './downloadArchive';
/** 代表HTML/CSSの表示中ソースだけを、サイト外で開く固定構成のZIPへまとめる。 */
import { strToU8, zipSync } from 'fflate';

export const PORTABLE_HTML_SOURCE_BYTE_LIMIT = 256 * 1024;

const README = `# TsumuCode HTML/CSS はじめの一歩

対象: html-css-ch00-l01-e01「内容と見た目を1箇所ずつ変える」
これはボタンを押した時点のソースです。合格や保存完了の証明ではありません。

## 開き方

1. ZIPを展開します。
2. index.htmlとstyles.cssを同じフォルダーに置いたまま、index.htmlをブラウザで開きます。
3. 見出しと背景色を確認します。教材の完成例は「わたしの学習ノート」と背景色 #fffaf0 です。
   途中のコードでは、自分が書いた内容が表示されます。

必要なファイルはindex.htmlとstyles.cssの2つです。この教材に追加Asset、外部依存、
インストール、開発サーバーは必要ありません。文字コードはUTF-8です。

## サイトとの違い

通常ブラウザのローカルHTMLはTsumuCodeの隔離プレビューと実行条件が異なります。
フォント・表示はブラウザや端末によって変わります。自分で外部参照等を追加した場合は
その参照先やブラウザ環境に依存します。
採点、自動保存、学習の進捗や判定履歴は含まれません。
持ち出したファイルを編集しても、TsumuCodeの下書きへは反映されません。
学習を別の端末へ移す場合は、サイトの「全コースの進捗と下書きを書き出す」を使ってください。
`;

/** 固定名の2ソースをUTF-8で保持し、未知のFileや保存情報をZIPへ混入させない。 */
export function createPortableHtmlArchive(
  files: Readonly<Record<string, string | undefined>>,
): Uint8Array<ArrayBuffer> {
  const html = Object.hasOwn(files, 'index.html') ? files['index.html'] : undefined;
  const css = Object.hasOwn(files, 'styles.css') ? files['styles.css'] : undefined;
  if (typeof html !== 'string' || typeof css !== 'string') {
    throw new Error('index.htmlとstyles.cssがそろっていません。画面を開き直して確認してください。');
  }
  const tooLarge = 'ソースが256 KiBを超えています。小さくしてから持ち出してください。';
  if (html.length + css.length > PORTABLE_HTML_SOURCE_BYTE_LIMIT) throw new Error(tooLarge);
  const htmlBytes = strToU8(html);
  const cssBytes = strToU8(css);
  if (htmlBytes.byteLength + cssBytes.byteLength > PORTABLE_HTML_SOURCE_BYTE_LIMIT) {
    throw new Error(tooLarge);
  }
  return new Uint8Array(
    zipSync(
      { 'index.html': htmlBytes, 'styles.css': cssBytes, 'README.md': strToU8(README) },
      { level: 0 },
    ),
  );
}

/** HTML/CSSの固定ファイル名でBrowserへ渡す。 */
export function downloadPortableHtmlArchive(archive: Uint8Array<ArrayBuffer>): void {
  downloadArchive(archive, 'tsumucode-html-intro.zip');
}
