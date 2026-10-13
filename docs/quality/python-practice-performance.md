# Python実践Projectの低速環境での補足観測

2026-10-13、Issue #147の未充足条件を確認するため、草稿の実践データProjectをDocker内loopbackで実測しました。これは性能受入の合格記録ではありません。Issue原本にはPerformance確認が必要とありますが、Python実践専用の性能予算・測定方法・標本数の承認は未完です。既存のReact用性能予算を流用せず、製品の準備・初期化・実行期限も変更していません。

## 条件と区間

- 基準Source: `e18b2975743558c6f67ef511469382990684f278`、tree: `22df5879212c60e1fba2b2929db51c70bfc06e63`。
- 課題: `python-practice-ch03-l01-e01`。新しいproduction buildを`BASE_PATH=/tsumucode/`で生成し、固定Pyodide 314.0.7を同originから配信。
- 固定Browser image: `tsumucode-issue196-browser:local`、image ID: `59858950e1af7223d97bf394712e54d0f7b75ef0e8af8a1a7d19fb9f0bf4c52c`。実Chromium: `149.0.7827.0`。
- Docker: CPU2／RAM2 GiB／PID256、network none、単独の作者用Browser／server container。管理socket・外部通信・公開なし。他のcontainerの停止やDocker Desktopの構成変更はしていません。
- Desktop 1280×720。CDPのpage CPU4x、RTT150ms、down1.6Mbps／up750Kbps、HTTP cache無効、各初回でContext／IndexedDBを新規作成。
- 既存`tests/acceptance/react-performance.spec.ts`の初回20 Context、暖機1回と操作20回、nearest-rank p95の手法を参考にした補足観測。対象・Browser・Runtimeが異なるため、Reactの受入完了や承認済みPython性能Gateとは扱いません。
- 初回はnavigation直前からStarterの実Console結果とControllerの`tsumucode:preview-update`完了まで。操作は同じContextのSolutionでPreview／採点の実完了Measureと通常UIの結果を照合する計画です。
- 製品期限: 準備20秒、初期化15秒、実行1.5秒。観測側の待機上限60秒は、製品期限を延長する処理ではありません。

CPU4xはpageに指定したエミュレーションです。opaque frame／Workerの実CPU倍率や物理低性能端末相当を証明しません。Docker Desktopと他containerの競合も制御していません。実人・実機での確認は未実施です。

## 実測結果

| 観測                                  | 標本／結果                                                                 |
| ------------------------------------- | -------------------------------------------------------------------------- |
| 初回の予定／取得                      | 20／20                                                                     |
| 正しいStarter結果への到達             | 0／20                                                                      |
| 環境障害                              | 20／20。「Python実行準備が時間内に完了しませんでした。採点していません。」 |
| navigationから障害表示までのp95       | 24,398.143 ms。失敗までの時間であり、成功時の操作性能ではない。            |
| Controllerの準備失敗までの完了Measure | 最小20,004.100 ms、最大20,017.800 ms、中央値20,011.250 ms                  |
| 成功した初回のp95                     | 算出不可。成功標本0件。                                                    |
| 暖機用の別Context                     | 同じ低速条件で準備期限へ到達。完了Measure20,011 ms。                       |
| 暖機後Preview／採点                   | 0／予定20。暖機が成立せず、操作p95は未測定。                               |

最初の有効標本では、`core.wasm`と`stdlib.zip`の要求が開始から約20.012秒で`net::ERR_ABORTED`になりました。`lock.json`の要求は完了しています。固定distのfile sizeはcore 9,598,218 bytes、stdlib 2,545,637 bytesです。これらは配信fileの大きさであり、失敗した要求で転送し終えたbyte数ではありません。

実装では`PythonExecutionService`が固定20秒のtimerでAbortControllerを中止し、core読込完了後に実行frameを作ります。今回の通信中止と準備失敗は、この期限に一致する観測です。今回の条件で準備を完了できなかったことをblocking findingとして残し、Worker内のPython実行速度や採点性能を測れたとは主張しません。予算の緩和、無制限待機、低速条件を外した暖機への置換は行っていません。

初期の390px設定では、仕様どおり「PCで演習を開く」案内画面となり実行へ到達しませんでした。その作者側の設定誤りは停止し、無効原本を別に保持しています。390pxの待機timeoutは上表や製品障害の標本に含めていません。PC測定では実Editor表示を前提として確認し、最初の準備障害画像を直接確認しました。

## 入力と私有原本の対応

観測開始前に入力とharnessのdigestを固定しました。Lesson内容台帳・この追加文書だけの変更は測定入力へ含めません。公開候補の最終Source／tree／dist／品質への承認bindingは、別途取り直す必要があります。

| 入力                                   | SHA-256                                                            |
| -------------------------------------- | ------------------------------------------------------------------ |
| distのpath順・path NUL bytes連結digest | `7a855cf2c8eea837bd9d00111f4d3073fd14b0d3829fbfc93277a33b907eeee2` |
| srcの同方式digest                      | `cb4d3260fa564a9679e8bc3c1009fe804abd824087220cf4d157718d84e05e8e` |
| package-lock.json                      | `191461e31bb2d50d9be7b6fd91e2a63e14e7eee00634461bb4bc32bac0b7f0c8` |
| vendor/python/314.0.7の同方式digest    | `ea7a7fa6110ab196c85687cea40258356008b8a5647b55456bf3ec3ddeec0a55` |
| Project Lesson directoryの同方式digest | `3f16beb86b1a67f652b4c053d2440dfb3a67ff6ad0fcab7c6471c3fd072254a5` |
| performance-probe.mjs                  | `4fb5247bf4805bc2a2749ea36a2dbbfc98527718392b28d8571616d4fc5bacfc` |
| capture-binding.json                   | `58b6be54c5664aa0d0617b6820eea71ed51747d3523024f82385899f6267d158` |
| performance-observation.json           | `b2386524dbfabd4e5939701913c8eff9d3da958b53a7d4ef48cf382d6951f536` |

原本・観測器・protocol・通信・障害画像は専用worktreeの`.release-issue147-checks/`に保持し、公開pushへ含めません。結果は生標本からp95を再計算し、全20件の障害表示とharness digest一致を照合しました。測定失敗を除いた成功値だけで合格へ変換していません。

## 次に必要な判断

Python実践の承認された性能測定方法・予算と、この準備障害の是正方針が必要です。固定期限・安全条件を緩和する判断は今回行いません。対策後に同条件の初回・暖機・操作を測定し、承認条件と照合するまで性能受入は未完です。初心者の実受講や物理端末の観察は、この実測と分けて実施する必要があります。公開・Home／Path追加・配信後受入も引き続き保留です。
