# ローカルPreview境界（Issue #125）

固定profile `vite-project-v1`（Node 24.18.0 / Vite 8.2.0）のHTTPとHMRを実サーバーへ接続する。
Source保存と常駐runの前提は [常駐Workspace](local-resident-workspace.md) を参照。
Local専用代表課題の画面・採点への接続は [Workspace学習の契約](local-workspace-learning.md) に記載する。Pages版へlocalhostの自動探索は追加しない。

## Originと資格情報

| 用途              | 接続先・権限                                                                                                |
| ----------------- | ----------------------------------------------------------------------------------------------------------- |
| 管理画面          | `http://127.0.0.1:4173`。既存Host/Origin/session token検査付きJSON POST                                     |
| Preview           | `http://<run UUID>.localhost:4175/w/<workspace>/<run UUID>/`                                                |
| HMR               | 同じrun hostのWebSocket、固定`hmr?token=...`と`vite-hmr` protocol                                           |
| control           | trusted controller/proxyだけが共有するUnix socket。bodyなし`GET /active`で現在runの非秘密metadataだけを読む |
| learner transport | learnerのrun専用Subpathに置くUnix socket。管理API/token/Sourceのlistenerとは共有しない                      |

UUIDはcontrollerが生成し、停止・再開で再利用しない。異なるportだけではCookieが分離されないため、
管理はIP host、Previewはrun専用hostとする。host Cookie・localStorage・IndexedDBは新runへ引き継がない。
Preview URL/control応答には管理tokenやSourceを含めない。Cookie、Authorization、管理token、Forwarded等を
learnerへ転送せず、learnerのSet-Cookie、redirect、CORS、CSP応答で境界を緩和させない。

proxyは現在runのHostとraw pathを検査する。固定4file、Vite clientとその固定env module、
HMR、診断用`api/echo`だけを許可する。管理API、別Workspace、絶対URL、percent encoding、
backslash、dot segment、未知query/重複queryを拒否する。`@fs`全体を許可しない。
Origin付き要求は現在runの完全一致を必要とし、WebSocketでは省略も拒否する。

native formは`no-referrer`下で`Origin: null`になるため、固定`api/echo`の
form-urlencoded POST、`Sec-Fetch-Site: same-origin`、`Mode: navigate`、`Dest: iframe/document`の
組合せだけを許可する。純fetch、別Origin、管理/保存/別Workspaceの要求にはこの例外を適用しない。
これは認証の代用ではなく、資格情報や永続状態を扱わない固定echoのBrowser制約である。
根拠は [Fetch StandardのOrigin header手順](https://fetch.spec.whatwg.org/#append-a-request-origin-header)。

## BrowserとDockerの境界

直接表示にもproxyがCSPを付け、iframe属性だけに依存しない。
`sandbox allow-scripts allow-same-origin allow-forms`、管理originだけの`frame-ancestors`、
現在runだけのHTTP/WS接続、`form-action 'self'`、worker/object/base/frame禁止を固定する。
`Referrer-Policy: no-referrer`、nosniff、no-storeも固定する。
管理DOM、管理bootstrap/Source保存へのfetch、管理Cookieの上書き、Workerを代表攻撃として確認する。
iframe内の第三者Cookie制限とhostの分離は別であり、Cookie分離はPreviewの直接表示でも確認する。

learnerは非root、read-only rootfs、cap drop、CPU1 / 256 MiB / PID64、`network:none`を保つ。
Source/管理socket/Docker socket/host repo/home/.envをmountしない。
trusted ViteのHTTP/HMRをUnix socketへ接続し、proxyだけがBrowserとの通信を橋渡しする。
transportは8 MiB tmpfs volume、learnerへのmountは自分のUUID Subpathだけとする。
controllerがsocket作成後に親をroot所有0550へsealし、socketのtype/owner/dev/inoを照合する。
learnerによるunlink/rename/symlink差替えを拒否し、実コンテナ削除を確認してからunseal・回収する。
controller再起動は自己ownerのlearnerを先に回収し、残存transportを回収する。
control切断や停止時は古い接続先へfallbackしない。

HTTPは同時8、body64 KiB、応答512 KiB、転送30秒。WebSocketは同時2、handshake5秒、
方向ごと2 MiB、最大60分。現在run/controlを500ms間隔で照合し、停止・切断・run変更で接続を閉じる。
上限は小さな代表Projectのための制約で、汎用proxyの対応範囲ではない。

## 保存版と反映版

Source保存だけでは現在runの版を更新しない。
`POST /api/workspaces/<id>/apply` は `runId`、`expectedSourceRevision`、`expectedSourceHash`を要求する。
readyの同じrunだけへ、保存済みの固定4fileをshellなしのtrusted execで反映する。
未変更fileを触らず、message/CSSの変更を本物のVite HMRで反映する。
変更したfileごとのrenameであり、4file全体の原子性は主張しない。
状態は反映中`applying`、実HTTP metadataの版/hash一致後に`ready`へ戻す。
Preview/HMRはapplying中も表示されるが、採点可能と扱わない。
HMRのDOM反映確認とサーバーのmetadata一致は別の証拠である。

反映中の保存は新しいSource版を作れるため、保存版とrun反映版は一致しない場合がある。
Localの学習画面は編集版・保存版・反映版・run ID・Workspaceを照合してから採点を許可する。
停止はapply完了とコンテナ/transportの回収を待つ。途中失敗ではrunを失敗として回収し、
Sourceを保持する。保存待ち中の停止、readiness期限後のseal、部分prepareの回収失敗を回帰で確認する。

## Next教材 #14 への引継ぎ

[Issue #14](https://github.com/santa928/tsumucode/issues/14) のCookie/Server Actionは未対応・未実証。
現在の固定4file、Cookie非転送、Set-Cookie/redirect抑止、echoだけのPOST許可では対応を主張できない。
Next専用の固定image/command、必要なHTTP経路とbody上限、Server ActionのOrigin/Host/資格情報検査、
host-only Cookieの寿命/消去、forwarded headerの扱い、CSPを保った実フォームとAction通信を先に定義する。
管理token/Source/controlを共有せず、他runへCookieを渡さない実Browser/サーバー検証が必要である。
この条件が確定するまで、一般的なPOST/任意proxy/管理資格情報転送へ許可範囲を広げない。

## 検証と再現

Node/npm/BrowserはDocker内で実行する。`scripts/learn.sh`はweb/controller/previewと固定Projectを起動する。
公開PagesのbuildにはLocal接続を加えない。既存Source volumeは通常downでも保持する。

| 検証       | 診断                                                                                                                                                                                                 |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit       | Source/Engine/resident/preview-contract。対象25件にnative form限定Originの1件を追加                                                                                                                  |
| 実resident | `resident-acceptance.mjs`を対象controller内でstdin実行。実HTTP、socket改変/管理mount/ネットワーク拒否、保存版、停止/異常/子プロセス、他owner保持、起動中断の7項目                                    |
| 既存Node   | `acceptance.mjs`。auth、実Closure、共有枠、5秒timeout、cancel、出力/メモリ/子プロセス、回収の12項目                                                                                                  |
| 再起動     | `resident-restart-acceptance.mjs`のprepare→対象controller再起動→verify。Source保持、孤児回収、transport空、control503、他owner保持                                                                   |
| 実Browser  | `preview-browser-acceptance.mjs`。本物のComposeへBrowser内loopbackを橋渡しし、iframe/直接表示、DOM/CSS HMRと入力保持、native form、管理/保存攻撃、Cookie/Storage、同一run WS再接続、停止/新runを確認 |
| CI         | `local-runtime.yml`。固定Browser専用stageで上記Browserを実行してから既存境界/再起動診断を実行。PR HEADとmerge後mainの成功を照合する                                                                  |

Browser専用imageはPlaywright 1.61.1のimmutable multiarch digestと既存lockfileの3つのPlaywright packageを使う。
trusted checkerには固定Node24をコピーし、Browserを製品imageへ追加しない。
Screenshotと診断Source/ログは非公開の作者用記録に置き、公開pushへ作業ログを含めない。
製品idle10分の通し待機、全Browser、Next、一般学習UI/採点は本Issueの実証範囲に含めない。

2026-10-07〜08、専用ownerのarm64 Dockerで対象26 Unit（先行25件と変更したOrigin契約4件を照合）、
実resident7項目、既存Node12項目、正常/強制再起動、実Chromium149.0.7827.0の6項目が成功した。
Browser checkerもNode24.18.0で実行し、CI用固定imageのbuild・同じ実診断が成功した。
HMR後のDOMと入力保持のScreenshotを目視した。対象Lint/formatと学習用production buildも成功した。
静的独立レビューと限定Origin追加後の追レビューはいずれも必須指摘0。
PR HEADとmerge後mainのremote CIは、別途そのcommitに対する結果を照合してからIssueをcloseする。
