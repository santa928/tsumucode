# 固定環境と公式仕様

Next16.3.8 / Node24.18.0 / React・ReactDOM19.2.7 / TypeScript6.0.3。PR83の固定作者Starterのmanifest/lockを再利用し、最新版を理由に更新しない。LocalのLinux/arm64とCIのLinux/amd64を確認する。

- https://nextjs.org/docs/app/getting-started/installation
- https://nextjs.org/docs/app/api-reference/file-conventions/page
- https://nextjs.org/docs/app/api-reference/file-conventions/route
- https://nextjs.org/docs/app/guides/content-security-policy

最初のLessonはpage表示・GETのquery別JSONだけ。Nodeのserver moduleは固定Docker内で動き、外部通信・ホストmount・依存導入・Cookie・POST・Terminalは提供しない。開発Previewだけunsafe-evalを許可し、管理画面とViteの契約を保つ。

以降は#133 App Router/Link/layout、#134 rendering/data、#135 Action/Cookie、#136 styling、#137品質確認の依存順。初回の目標3つは説明3画面、2編集工程、固定独立Browser/HTTPの合成必須Ruleへ対応する。build時の事前生成とrequest時の処理を区別し、Pages staticをserver処理と呼ばない。今回の採点は実DOM/HTTPとruntime errorを対象にし、TypeScriptの静的型検査の合格を主張しない。
