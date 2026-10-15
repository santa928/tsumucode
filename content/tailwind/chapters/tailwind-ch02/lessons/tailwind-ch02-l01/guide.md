## 共有する範囲を決める

1. styles.cssの@themeでbrand・paper・cardを変更し、文字・枠・背景・間隔への反映を見ます。
2. .note-cardの@applyへp-cardを使い、2枚目の個別Utility列を共通classへ置き換えます。
3. 親が並びとgapを、buttonがfocusとhoverを担うことを確かめます。

この実習ではindex.htmlとstyles.cssだけを使います。CSSは固定のtailwindcss取込、3token、.note-cardの@applyを扱います。
色は6桁の#hex、cardは0〜64px（小数2桁まで）です。@applyは教材の余白・枠・色・角丸を使います。
追加のselectorやplugin等を使う制作は、サイト外の通常のTailwind環境で行います。

## buildして表示する

「制作Sourceを持ち出す」は、クリック時点の原文と固定manifest・lockfile・Vite設定・READMEをZIPにします。
サイトの下書き・進捗を書き換えず、ZIPにも含めません。途中でも、実習の対応範囲のSourceを持ち出せます。

ZIPは新しい作業フォルダーへ展開します。Docker（作業環境をコンテナにまとめるツール）が使える場合は、READMEの固定Nodeコンテナーで依存取得・build・表示を順に行います。
Node 24.18.0を用意した別環境では、npm ci --ignore-scripts、npm run build、npm run previewの順で確認できます。
初回のimage取得やnpm ciには通信が必要です。固定依存を取得し、外部へ作品を公開する操作は行いません。

build後のdistはHTMLと生成CSSです。Play CDNやブラウザー内compilerを本番用の手順として使いません。
brandを別の濃い色へ変えてbuildし、2枚とボタンへの反映、360/767/768/800px、Tabの輪郭を確かめます。
編集後はbuildしてからpreviewします。最後にサイトへ戻り、元の下書きと進捗を再開できます。
