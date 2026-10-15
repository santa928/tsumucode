# TsumuCode 読書カードの制作

このZIPは、持ち出すボタンを押した時点の `index.html` と `styles.css` を保持します。
途中のコードも含められます。合格や保存完了を証明するものではありません。
追加の画像・フォントなどのAssetは使いません。

## 固定Nodeのコンテナーでbuildと表示を確認する

ZIPを新しいフォルダーへ展開し、そのフォルダーで実行します。

```sh
docker run --rm \
  --publish 127.0.0.1:4173:4173 \
  --mount "type=bind,source=$PWD,target=/app" \
  --mount type=volume,target=/app/node_modules \
  --workdir /app \
  node:24.18.0-bookworm-slim@sha256:cb4e8f7c443347358b7875e717c29e27bf9befc8f5a26cf18af3c3dec80e58c5 \
  sh -c 'npm ci --ignore-scripts --no-audit --no-fund && npm run build && npm run preview -- --host 0.0.0.0'
```

ブラウザーで、Viteが端末に表示するLocalのURLを開きます。
上の例ではホスト側に公開したポート4173を使います。終了はCtrl+Cです。
この例はmacOS/Linux等のshell用です。Docker内のNodeで依存取得・build・表示を順に行います。
Dockerの初回image取得と `npm ci` は通信します。
Nodeの公式imageとnpm registryから、固定versionとlockfileの依存を取得します。
`npm ci --ignore-scripts` で依存のinstall scriptは実行しません。
依存はコンテナー専用のvolumeへ置き、終了時に削除します。`dist/` は展開先へ生成します。
Sourceを編集した後は終了し、同じコマンドでbuildし直してください。
HTML/CSSを外部へアップロードする操作や公開は含みません。

## 固定Node環境で直接確認する場合

Node.js 24.18.0がある別の作業環境では、展開先で次を実行できます。
`npm ci` の依存取得には通信が必要です。学習サイト本体のフォルダーでは実行しません。

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run build
npm run preview
```

開発中の確認は `npm run dev` です。`dev` は編集元を配信し、`preview` はbuild後の
`dist/` を配信します。Viteのpreviewは生成物をローカルで確かめる機能です。
公開先の選定や本番配信の設定は、この制作の範囲に含みません。

## Sourceと生成物

- `index.html`：カード固有の内容と配置、画面幅に応じた並び、ボタンの操作状態。
- `styles.css`：テーマ値と `.note-card` の共通の見た目。
- `vite.config.mjs`：Tailwind Vite Pluginを登録する固定設定。
- `package.json` / `package-lock.json`：Vite 8.2.0、Tailwind CSSとPlugin 4.3.2、および依存の固定情報。
- `dist/`：`npm run build` が作るHTMLと生成CSS。元のファイルへ編集を戻す機能はありません。

production buildではCSSをあらかじめ生成します。Play CDNやブラウザー内compilerは使いません。
確認用の静的配信では、依存の取得やCSSのコンパイルをブラウザーで繰り返しません。

## 確かめること

1. `--color-brand` を変えると、2枚のカードの文字・枠とボタンの色が一緒に変わります。
2. `.note-card` の `@apply` を変えると、共通classを使う2枚へ同じ見た目が反映されます。
   内容やカードの並べ方はHTMLに残します。HTML構造を自動で複製するcomponentではありません。
3. 360pxでは縦、800pxでは横に並びます。ボタンへTabで移動すると輪郭が見えます。
4. 途中のSourceを持ち出しても、サイトへ戻れば元の下書きと進捗を続けられます。

学習サイトの採点、自動保存、進捗、判定履歴はZIPに含みません。
持ち出したファイルを編集してもサイトへは反映されません。
別端末へ学習の続きを移すときは、サイトの進捗と下書きの書き出し・読み込みを使います。
制作の途中では、まだ上記の確認結果にならない場合があります。
