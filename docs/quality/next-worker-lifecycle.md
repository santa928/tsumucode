# Nextのstatic paths Workerと資源checkpoint

この文書は[#204](https://github.com/santa928/tsumucode/issues/204)で確認したWorkerの回収経路と、固定Next設定の検証範囲を説明します。

## 確認した生成・終了・回収経路

固定Next 16.3.8の`next/dist/server/dev/next-dev-server.js`では、static pathsを`jest-worker`の1 Workerで処理します。`getStaticPaths()`の`finally`は`staticPathsWorker.end()`を呼びますが、その終了Promiseをawaitしていません。

Data starterの実採点では、同じlearner namespaceで次を観測しました。

1. bootstrap PID7がCLI PID31を起動し、CLIがNext server PID43をforkします。
2. server PID43のfork初期化IPCが、対象moduleを`static-paths-worker`として識別しました。子PID83／91／99／107／115／123が該当します。
3. 同じ子のNode exit eventの後、親が既に呼び出したwaitの直前に`/proc/<pid>/stat`の実Z状態とPPID43を読みました。
4. 親43による実`waitpid`成功、その後のNode exit callbackを確認しました。bootstrapやinitがこの生存中の親に代わって回収した記録ではありません。

別の観測では、子のNode exit eventから親の実waitpidまで約6〜40msでした。exit eventはkernel上の死亡時刻そのものではありません。wait直前statと実waitpidは、親が回収した同じ子に対応しています。観測器の読取・記録には実行時間がかかるため、この数値を無計測CIや別architectureの時間へ流用しません。

Node 24.18.0に含まれる[libuv 1.52.1の実装](https://github.com/libuv/libuv/blob/v1.52.1/src/unix/process.c)も、waitpid成功後にexit callbackを呼ぶ順序です。Docker initは孤児processの回収に使います。生存中のNext serverが所有する子を、initが先に回収するという契約にはしません。

採点器は別containerで実DOM／HTTPを観測し、controllerはそのcontainerの終了・結果・回収を確認して応答します。この完了通知を、learner内の全Worker回収完了とは扱いません。作者検査の`resources(true, learner.Id)`は独立した初回checkpointとして、厳格なZombie0を維持します。

## 過去CIとの対応と未確定事項

PR #205の[Runtime 38334267847](https://github.com/santa928/tsumucode/actions/runs/38334267847)では、Routing 8・Client 9 Fixtureの完了後、Dataの最初のcheckpointでPID163／PPID55／state Zを検出しました。工程順とFixture順はstarterに対応しますが、失敗JSON自身にはFixture名がありません。114ms後の診断は0でも、初回FAILのまま保持します。

このCIのPID163にはmodule識別がないため、ローカルで特定したstatic paths Workerと同じ生成元だったかは直接確認できていません。#142のData solution、#146のRouting detail-errorも、すべて同じ根因だったとは断定しません。

## 修正候補と維持する境界

固定のNext configで`experimental.workerThreads: true`を選び、static pathsの短命なOS childをThreadへ置き換えます。Worker終了の非同期性を、資源取得の固定sleep・取得遅延・後続0への置換・成功までの再試行で隠す変更はしません。APIから実行方式や設定を選ばせません。

Data starterと再起動solutionでは、同じstatic paths moduleのThread初期化を直接観測し、対応するforkの消失を確認しました。各Threadの実V8 `heap_size_limit`は140MiBで、Next CLI／serverの実値と一致します。`resourceLimits`表示値はold generation 288MiB／young generation 27MiBでしたが、[固定Nodeの仕様](https://nodejs.org/download/release/v24.18.0/docs/api/worker_threads.html)では`--max-old-space-size`／`--max-semi-space-size`が優先します。表示値だけを実heap上限と誤認しません。

Threadはserverと同じprocessを使うため、終了・環境・値の転送がforkと異なります。既存のheap起動flags、CPU1、RAM／swapの512・576・896MiB各tier、PID64、tmpfs各64MiB、非root、readonly、network:none、cap drop、期限を維持した標準imageで回帰を確認します。cgroup全体のOOM判定も必要です。

## 検証の状態

観測器付きのData 8 Fixtureは、通常採点・初回Zombie0・資源・旧版拒否・Source保持・停止／再起動を成功しました。これを原因解消の証拠や標準imageの成功へ読み替えません。修正候補のData限定観測も初回Zombie0を維持しています。

観測file・hook・環境変数を含まない標準候補imageで、全9教材81 Fixtureを成功しました。全初回checkpointのZombieは0、memory eventsのmax／oom／oomKillも0でした。最大memory peakは697,548,800 bytes、PID数は39でした。既存検査のgrader回収・旧版拒否・Source保持・停止／再起動も成功しました。

通常Lesson UIは全9教材で成功しました。実DOM／HTTP、編集・Source反映、構文／境界エラーからの復旧、保存・再読込・再起動、JSON／ZIP移行、キーボード、390px表示、axeの違反0を確認しました。代表画面の画像も確認しています。

準備中の停止と、実graderのRunningを確認した採点中の停止も成功しました。後着結果と旧runを拒否し、Sourceを保持して新runを再採点できました。正常／異常controller再起動の各検証でも、保持Sourceで新runを開始し、ready・旧run拒否・実採点・停止／回収まで成功しました。他ownerの検証containerを保持し、自ownerのlearner／graderとtransportを回収しました。

結果は私有引継ぎへ対応付けます。必要な独立レビューと最終HEAD／マージSHAのCIを完了するまでは、統合済み・恒常的Zombie0・#204完了とは報告しません。

準備時のimage／module／subnet／観測器ABIの失敗、初回CI FAIL、観測原本は私有領域に保持します。生ログ、Source、argv、秘密値や個人pathを公開差分へ含めません。
