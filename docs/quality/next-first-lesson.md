# Next.jsの最初の通常Lesson（Issue #132）

Local Docker学習版の入口から `next-ch01-l01` の説明4スライドと通常演習へ進む。
Courseはdraftで、正式公開や後続Lessonの実装は含めない。Pagesは静的配信であり、
説明・読書と端末データJSON移行を提供する。Pagesからlocalhostを探索しない。

## 実行と教材

固定profileは `next-project-v1`、Workspaceは `next-ch01-l01-e01`。
既存作者pilotのlockを再利用し、Node 24.18.0、Next 16.3.8、React/React DOM 19.2.7、
TypeScript 6.0.3を固定する。DockerのLinux arm64/amd64を対象とし、ホストNode/npmは不要。
学習者のpackage.json、Next設定、依存導入、任意コマンドを受け付けない。
Sourceはlayout/page/CSS/GET Route Handlerの固定4ファイル、合計UTF-8 100 KiB。
教材ではpageとRouteを編集し、layoutとCSSは読書用にする。

説明はpage、Route Handler、requestとquery、開発時の応答、buildでの事前生成、
Pagesの静的配信を区別する。教材コードは隔離されたNodeサーバーで実行される。
これはBrowser内だけの実行ではない。Node標準APIへのアクセスを完全禁止する保証はせず、
隔離コンテナの非root・mount・network・資源制約を境界にする。

1. 環境へ明示接続し、下書きを保存して起動する。
2. 実pageと2つのquery別JSONをPreviewの応答選択で確認する。
3. 実行中の編集は保存して反映する。固定Sourceを入れ替え、Next子プロセスを再起動する。
4. 実HTTP準備と保存版・反映版の一致後、独立Browserで判定する。
5. 停止・再開・画面移動では下書き/進捗とSourceを保持し、対象runを回収する。

Nextの開発HMRは固定WS経路で接続するが、明示反映はプロセス再起動とiframe再読込を使う。
反映・停止中は旧iframeを閉じ、終了中serverへのchunk要求を避ける。通常Lessonの共通Shellで説明・コース・完了への導線を提供する。
Source markerは版照合のための記録であり、敵対的Nodeコードへの暗号的実行証明ではない。

## 承認済みの限定境界

learnerはCPU 1、RAM/swap合計512 MiB、PID 64、非root、readonly rootfs、
cap drop、network:none。workspace/tmpのtmpfsは各64 MiB。host repo/home/管理socket/
Source volumeはmountせず、自分のrunのsealed transportだけをmountする。
Vite/Closureや管理画面の資源・CSPは変更しない。

Next開発の固定JS/CSS chunkのみ応答上限2 MiBとする。page/APIは512 KiBのまま。
許可HTTP経路はpage、固定GET `api/question`、query `mode=second`、固定JS/CSS chunk。
chunk名のNext固定encodingのみ許可し、未知encoding、dot segment、source map、
内部API、image最適化、任意queryは拒否する。WSは固定 `_next/hmr?id=...` のみ。
Cookie/Authorization/管理tokenは転送せず、Set-Cookie/redirectを抑止する。

Nextのrun専用Previewだけに開発用 `unsafe-eval` を付ける。
[公式CSPガイド](https://nextjs.org/docs/app/guides/content-security-policy)の開発要件に従う。
管理/Vite/他Courseへ広げない。Cookie、Server Action、POST、外部通信は本Lessonで扱わない。
後続Issueで別途必要なOrigin/Host/Cookie/Action契約を確認する。

## 判定と検証

既存の独立Chromium graderを再利用し、同じrunの可視 `h1#message` と
GET `api/question` の2応答を実測する。期待値はtrusted graderに固定し、learnerの自己申告を採用しない。
保存版/run/hashを前後に照合し、HTTP/JavaScriptエラー、編集後・停止後の後着結果を合格へ採用しない。
通常Lessonの必須Ruleは3観測をまとめた1件で、スライド既読と現行編集版の合格で完了する。

作者専用imageに正負6Fixtureを置く。learner/web/graderへSolutionやFixture原稿を含めない。
`next-project-acceptance.mjs`は実page/query判定、資源/回収、停止・Source保持・再起動を検証する。
`next-project-browser-acceptance.mjs`は通常Lesson、編集/反映/保存、Hint、小画面、keyboard/axeを確認する。
両診断はLocal Runtime CIで実行し、PR HEADとmerge後mainを照合する。
診断ログ・スクリーンショット・作業記録は非公開の作者保存先へ置く。
