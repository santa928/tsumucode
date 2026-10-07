# 常駐Workspace（Issue #124）

状態: 実装・ローカル境界検証・最終独立レビューを完了。remote CIは確認中。

## 対象と依存

固定Projectは Node 24.18.0 / Vite 8.2.0 の小さなWebページ1つとする。
既存 `package-lock.json` の依存をDocker build内で固定し、実行中の依存導入や
任意のcommand・image・package・port指定をAPIで受け付けない。
Viteを選ぶ理由は、後続 #125 で本物のHTTPとHMR/WebSocketを検証するためである。
Next.js、Server Action、任意npm/pip、PTY、公開マルチテナントは対象外。

#124では保存とサーバーの実行制御だけを追加する。Preview originと通信は #125、
学習画面・演習・採点は #126 で接続する。今回の成功だけで一般学習者向け機能を
公開済みと表示しない。既存Closureの使い捨てNode実行・採点は維持する。

## 受入条件と責務

| ID           | 受入条件                                      | 実装境界・検証                                                                             |
| ------------ | --------------------------------------------- | ------------------------------------------------------------------------------------------ |
| LOCAL-124-01 | 停止・失敗・再起動でSourceを保持する          | controller専用volumeの版付きSource。実controller再起動とSource全文/hash照合                |
| LOCAL-124-02 | 保存失敗・古い更新を成功表示しない            | 固定file集合、100 KiB上限、期待版によるCAS、直列化と原子的置換。保存失敗・競合の回帰       |
| LOCAL-124-03 | 起動中・ready・失敗・停止・idle終了を区別する | run ID / Source版/hash付き状態。固定Docker execの実HTTP probeだけでreadyへ遷移             |
| LOCAL-124-04 | learnerへ秘密・管理権・永続領域を渡さない     | socketは既存controllerだけ。learner非root/read-only/network none/host mountなしの実inspect |
| LOCAL-124-05 | 資源・出力・同時実行を制限する                | CPU1 / 256 MiB / PID64 / 出力64 KiB。既存one-shotと同じ1実行枠、起動期限とidle回収         |
| LOCAL-124-06 | 中断・異常終了・再起動・孤児を回収する        | run IDを指定して停止。実コンテナの起動中中断・強制終了・子プロセス・controller再起動       |
| LOCAL-124-07 | 他Workspace/ownerの実行を止めない             | 所有ラベルと実行ID、旧runの停止拒否。独立ownerのsentinel実コンテナを保持                   |
| LOCAL-124-08 | Resetの破壊範囲を確認する                     | Sourceの期待版と明示確認を必要とし、実行中Resetを拒否。進捗や別Workspaceは対象外           |
| LOCAL-124-09 | 再現可能な検証と独立レビューを残す            | 対象Unit/API、既存Node受入、実Docker受入、Docker build/Compose、exact CI、main CI          |

保存、固定Projectの入力契約、Docker操作、状態制御はそれぞれ小さなmoduleへ分ける。
HTTP controllerは既存のHost/Origin/session token検査と応答への接続を担当する。
汎用Workspace frameworkや将来の全言語分岐は作らない。

## Sourceと実行の契約

- profileは `vite-project-v1`。固定4fileは `index.html`、`main.js`、`message.js`、
  `styles.css`。設定ファイル、`.env`、絶対path、追加file、symlink指定は拒否する。
- Workspace IDは64文字以下のASCII英小文字・数字・hyphen、保存件数は16件以下とする。
  Source JSONにはschema/profile、Source revision、全file、SHA-256と最終run情報を保存する。
- 保存は期待Source revisionを検証して直列化し、一時fileのflushと同一directory内renameで
  全fileを原子的に置換する。Sourceを消すvolume pruneやdown `--volumes`は行わない。
- 最終run記録の更新も保存/Resetと同じ直列化経路を通す。更新時に最新Sourceを読み、
  run情報だけを書き換える。古いrunの終了通知は新run記録を上書きしない。
  旧run終了と保存が競合してもSource/版/hashが巻き戻らない回帰を追加する。
- learnerは起動時のSourceを自身の破棄可能なtmpfsへ受け取る。永続volume・repo・home・
  `.env`・token・Docker socketをmountしない。依存は専用image内のread-only領域に置く。
- #124の実行中保存は次の起動用である。現在runのSource revision/hashと保存された最新版を
  分け、更新を実サーバーへ反映済みとは表示しない。実HMR反映は #125 で実証する。
- 起動要求は期待Source版を持ち、controllerが新しいUUIDのrun IDを発行する。停止は対象run IDを持ち、
  遅れて届いた旧runの停止要求で新しいrunを止めない。
- `starting` → 実HTTP 200確認 → `ready`。起動失敗/異常終了は `failed`、
  明示停止は `stopped`、idle回収は `idle`。回収不能は `failed` の理由を保持し、
  コンテナ削除済みと断定しない。Sourceは各状態で保持する。
- 停止要求から回収確認までは `stopping` とする。Docker createの応答だけが失われた場合も
  run ID/ownerのラベルで孤児を照合する。削除・照合を確認できない場合は回収障害を保持し、
  共有のrecovery barrierを通るまでresident/one-shotの新規実行を拒否する。
- 起動中断も同じrunの作成/起動/回収完了まで排他枠を保持する。
  Source保存は実行枠と独立して行う。既存Node runとresident runは同時起動しない。
- 正常controller停止と異常終了後の再起動で自己ownerのlearnerだけを回収する。
  永続Sourceと最終run記録から、再起動後に古いreadyを再利用しない。
- Resetは `confirmReset: true` と期待Source版が必要。対象4fileをStarterへ戻して版を
  進める操作だけで、学習進捗・JSON Export・別Workspace・依存を削除しない。

## Dockerと公開境界

管理controllerは既存内部networkとsocket権限を使う。保存volumeはcontroller専用。
learnerは既存固定Node imageと同じnon-root・read-only rootfs・cap drop・seccomp・
資源上限を保ち、#124では `network none` のまま起動する。
HTTP readinessはlearner内部で固定Node probeを実行し、実際の応答をboundedに確認する。
起動待ちのpoll間隔は成功条件ではない。Viteのstart完了後から実HTTP readinessまでの期限は20秒、1 probe全体は2秒、
idleは10分、最大run寿命は60分とする。既存one-shotの5秒上限は変更しない。
idleを延長する操作は起動、Source保存、対象run ID付きの明示的activityだけである。
事前のimage確認・孤児回収とcreate/startなどのDocker要求は、それぞれ20秒以内で失敗を返す。
起動準備中も実行枠は保持し、create応答喪失後の回収は独立した失敗状態として扱う。
statusのpollは延長しない。最大寿命はactivityでも延長しない。
Viteがreadyとは実サーバー応答が確認できた意味であり、学習コードの正解を意味しない。

ViteのHTTP portは固定し、UI originへ直接配信しない。#125でCookie/資格情報/許可経路を
分離してからPreviewを接続する。Pages buildへLocal接続の探索を追加しない。

## 実装と検証順

1. 設計の独立レビュー。入力・保存・状態の契約を確認する。
2. Source store、固定profile/protocol、resident lifecycleを実装し、CAS・保存失敗・
   中断・古いrun・排他・idle・回収失敗の回帰を追加する。
3. 専用learner imageとcontroller-only volumeをComposeへ追加し、既存controllerへ接続する。
4. 専用owner/Composeで実HTTP readiness、Source保持、異常終了、起動中中断、idle、
   controller再起動、自己孤児・他owner sentinel、既存one-shotを実証する。
5. 実体と差分を独立レビュー。必要lint/type/build/Unit/実Docker結果を記録し、
   exact PR HEAD CI成功後にmerge、main CI成功後に #124 をcloseする。
6. #125の最新仕様と照合し、Preview隔離/HMRを別差分で実装する。

## 作者用API

既存 `/api/session` のtokenを使い、すべて既存のHost/Origin検査付きJSON POSTで呼ぶ。
新しいAPIは既存Closure capabilityの形を変更しない。

| path                            | body・結果                                                               |
| ------------------------------- | ------------------------------------------------------------------------ |
| `/api/workspaces/capabilities`  | `{}`。profile、固定Starter、制限、controllerでの有効化状態               |
| `/api/workspaces/<id>`          | `{}`。Source全文/版/hashとlastRun。pollでidleを延長しない                |
| `/api/workspaces/<id>/source`   | `expectedSourceRevision` と `files`。新規は期待版0、成功後は版を進める   |
| `/api/workspaces/<id>/start`    | `expectedSourceRevision`。controller発行run IDとstartingを202で返す      |
| `/api/workspaces/<id>/stop`     | `runId`。対象runの回収を待ち、確定状態を返す                             |
| `/api/workspaces/<id>/activity` | `runId`。現在runのidleだけ延長する                                       |
| `/api/workspaces/<id>/reset`    | `expectedSourceRevision` と `confirmReset: true`。実行中/回収未確認は409 |

最終状態の保存が失敗した場合、メモリの `state-save-failed` を状態応答へ残し、
次の実行前に永続記録の修復を試みる。旧readyを成功として返さない。
Sourceが壊れた場合や保存に失敗した場合、既存SourceをStarterで黙って上書きしない。
起動準備中の正常shutdownも終了promiseを待ち、新しいcreateを行わない。

Viteの `strictPort`、明示した `allowedHosts`、`cors: false`、固定filesystem範囲を使う。
設定の根拠は[公式server options](https://vite.dev/config/server-options)を参照。

## 再現手順

専用Composeを起動し、対象controller内で以下の診断scriptをstdin実行する。
`node --input-type=module < script` のNode実行は必ず `docker exec -i` の内側に置く。

- `scripts/local/resident-acceptance.mjs`: 実web/controller/learner、Source/停止/異常/子プロセス/他ownerと回収。
  idleだけ内部診断で2秒へ短縮する。製品APIの10分idleを変更できる入口はない。
- `scripts/local/acceptance.mjs`: 既存Nodeの実実行・5秒/メモリ/出力/中止等の回帰。
- `scripts/local/resident-restart-acceptance.mjs`: `TSUMUCODE_RESTART_PHASE=prepare` → 対象controllerの
  restartまたはKILL/start → `verify`。`TSUMUCODE_RESTART_MODE` は `normal`/`abnormal`。
  Source全文/hash、古いreadyの無効化、自己孤児回収、他owner保持を照合する。
- `scripts/local/output-fault-acceptance.mjs`: socketをmountしない別の診断containerで実controllerをforkする。
  Docker HTTP doubleの出力障害と準備中shutdownを確認する。learner実測として数えない。

`.github/workflows/local-runtime.yml` は関連Docker/runtime変更のPRとmainで、この境界検証を実施する。
診断のSource volumeは通常のdownで保持し、他のサービスやvolumeをpruneしない。

## 検証記録

2026-10-07、専用owner `tsumucode-learning-issue124` のarm64 Dockerで確認。
実行Sourceはcontroller image内の7 moduleとworktreeのhashを照合した。
controllerの最終Source hashは `13fe193c393e1e40fbb2de98eacd148bbda7a1350b6a8012a3a6a85f602126dc`。

| 検証                 | 結果・範囲                                                                                                                                                                   |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 対象Unit             | 16件成功（既存14件と、residentの回収/image準備中shutdown 2件）。Source CAS/上限/symlink/保存障害、旧run終了と保存、停止/probe競合、回収失敗/Reset、idle、旧ID、readiness期限 |
| 実resident           | 代表6項目成功。実HTTP/fixed inspect、共有枠、保存版とrun版、子プロセスを含む停止、異常終了、確認Reset、他Workspace/owner、起動中断                                           |
| 実idle               | 同じEngine/profileで内部診断idleを2秒へ短縮し、ready→idleと実体回収/Source保持を確認。製品10分の通し待機は未実施                                                             |
| 正常controller再起動 | Source全文/版/hash保持、終了理由controller-stopped、自己孤児回収、別owner sentinel保持                                                                                       |
| 強制controller再起動 | KILL/start後に同じSource保持、controller-restartedで古いready無効化、自己孤児回収、別owner sentinel保持                                                                      |
| 既存Node             | 実Docker12項目成功。auth/Closure/computed promise/syntax/isolation/共有枠/5秒timeout/cancel/output/memory/child/cleanup                                                      |
| HTTP障害境界         | Docker HTTP doubleで実controllerの出力障害を15.1秒で確定し、次run成功・準備中shutdownのcreate防止。learner証拠とは区別                                                       |
| 静的確認             | 関連Lint、対象format、shell構文、diff check成功。固定Dockerfile buildで型確認・学習用production build成功                                                                    |

使用image（このarm64実測のIDであり、他platformの配布digestではない）:

- controller: `sha256:564f5f4970b84026ad48727c967ddffa6bf12969f77453dbb2bd734a239f11c3`
- project: `sha256:c327453540329a988ffc8f9e3942deac270d4d69e94cb3ed9d5e7ee1c8cf23f8`
- web: `sha256:d0cf059c1d782d580ca8f12f9a01871ffcc16583d72e6052340820b0a6b0508a`

環境上のcredential helper待ちを空の作業用CLI設定で回避し、診断だけ旧builderを使用した。
自動subnet枠不足は非公開の専用Compose overrideで未使用subnetを指定した。
既存network/service、Docker/global設定、host port4173は変更していない。
HTTP double診断の初回はstdinの `--input-type=module` がforkへ継承されて失敗した。
診断のforkに `execArgv: []` を指定して再検証し、実装の成功証拠と失敗記録を分けて保持した。

最終独立レビューは mandatory 0 で承認済み。準備中shutdownの追加指摘を修正し、
回収待ち/image確認待ちの両方でcreate/start 0件と共有枠解放を確認した。
exact PR HEAD/main CIの結果は確定後に確認し、Issueをcloseする。
Preview origin/HMR/browser攻撃と学習画面/採点は未検証であり、それぞれ #125/#126 の受入条件とする。
