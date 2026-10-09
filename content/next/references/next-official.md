# 固定環境と公式仕様

Next16.3.8 / Node24.18.0 / React・ReactDOM19.2.7 / TypeScript6.0.3。PR83の固定作者Starterのmanifest/lockを再利用し、最新版を理由に更新しない。LocalのLinux/arm64とCIのLinux/amd64を確認する。

- https://nextjs.org/docs/app/getting-started/installation
- https://nextjs.org/docs/app/api-reference/file-conventions/page
- https://nextjs.org/docs/app/api-reference/file-conventions/route
- https://nextjs.org/docs/app/guides/content-security-policy

最初のLessonはpage表示・GETのquery別JSONだけ。Nodeのserver moduleは固定Docker内で動き、外部通信・ホストmount・依存導入・Cookie・POST・Terminalは提供しない。開発Previewだけunsafe-evalを許可し、管理画面とViteの契約を保つ。

以降は#133 App Router/Link/layout、#134 rendering/data、#135 Action/Cookie、#136 styling、#137品質確認の依存順。初回の目標3つは説明3画面、2編集工程、固定独立Browser/HTTPの合成必須Ruleへ対応する。build時の事前生成とrequest時の処理を区別し、Pages staticをserver処理と呼ばない。今回の採点は実DOM/HTTPとruntime errorを対象にし、TypeScriptの静的型検査の合格を主張しない。

- [Layouts and Pages](https://nextjs.org/docs/app/getting-started/layouts-and-pages): page/layout、nested route、Promiseのparams。
- [Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components): use clientの境界、直列化できるprops、状態とイベント。
- [Linking and Navigating](https://nextjs.org/docs/app/getting-started/linking-and-navigating): Next Linkのprefetch/soft navigationと文書遷移の区別。今回は通常aの実動作を検証する。

## データと失敗画面（固定実測版16.3.8）

- [fetch](https://nextjs.org/docs/app/api-reference/functions/fetch)：no-store/force-cache/next.revalidate、dev HMRとno-cacheの例外。
- [Caching Previous Model](https://nextjs.org/docs/app/guides/caching-without-cache-components)：Data Cacheと期限後の背景更新。
- [loading](https://nextjs.org/docs/app/api-reference/file-conventions/loading)：待機中の区間とLink後の表示。
- [error](https://nextjs.org/docs/app/api-reference/file-conventions/error)：retryは再取得、resetは再描画のみ。retryの安定化は16.3.0。
- [not-found](https://nextjs.org/docs/app/api-reference/file-conventions/not-found)：送信開始後はHTTP200のまま対象なしのUIを返す場合がある。
- [Turbopack disk cache](https://nextjs.org/docs/app/api-reference/config/next-config-js/turbopackFileSystemCache)：本教材ではdev disk cacheを無効にし、固定tmpfs内で動かす。fetchのData Cacheとは別。

公式サイトの現表示16.4.0と実測版16.3.8を同一視しない。公開前は固定版の実Fixtureと実画面の結果を正とする。

## FormとServer Action

2026-10-09に[Next Forms](https://nextjs.org/docs/app/guides/forms)、[React form](https://react.dev/reference/react-dom/components/form)、[Server Actions設定](https://nextjs.org/docs/app/api-reference/config/next-config-js/serverActions)を確認しました。公式Next文書は16.4.0の表示ですが、教材と実行imageは16.3.8を固定しています。

ClientのHTML制約とServer側validationを区別し、useActionStateの戻り値とAction引数を分けて説明します。非制御入力のリセットに依存せず、失敗後の入力はcontrolled inputで保持します。FormのHTTP400/503/200と、HTTP200にも結果状態を含むServer Actionを区別します。

限定2教材のPOSTは現在runのHost/Originを照合し、JSON API1経路または固定Action rootだけを許可します。documentの末尾slash付きrootとcanonical rootの2表記を同じpageとして扱い、queryや他のpathは許可しません。Cookie・Authorization・管理tokenは転送しません。本文64KiBは全量受信後に送信し、応答512KiB・30秒を維持します。練習用履歴は同じlearner内だけに保持され、Source反映と停止再開で初期化されます。採点専用の短命な相関IDはServer helperへだけ渡し、Previewの履歴を消さずに採点します。制御APIをBrowserへ公開しません。同じlearnerの編集可能なServerコードが自分のloopbackへ接続できる境界は変わりません。

## 制作と持ち出し（固定実測版16.3.8）

- [Metadata](https://nextjs.org/docs/app/api-reference/functions/generate-metadata)：Server page/layoutの静的titleとdescription。
- [Image](https://nextjs.org/docs/app/api-reference/components/image)：alt、寸法、unoptimized。本教材は固定SVGを元画像のまま表示します。
- [page](https://nextjs.org/docs/app/api-reference/file-conventions/page)：Promiseのparams/searchParamsとGET選択。

公式サイトの最新版表示は16.4.0ですが、教材のmanifest/lockは16.3.8を維持します。制作2教材はGET選択だけで、保存や新しいActionを追加しません。固定SVGと9Sourceだけを持ち出し、端末JSONの進捗移送と分けます。学習用Nativeの固定5教材は承認済み576MiB/追加swapなし、持ち出しproductionは同梱Composeの512MiBです。Courseはdraftを維持します。
