# Python固定coreの保持と競合の検証

Issue #147のcore再取得削減について、現行の準備20秒・初期化15秒・実行1.5秒を変更せず、Docker内の実Chromiumで以下を確認しました。90秒案の実装・承認や、新Pages公開の受入ではありません。

| 境界                 | 確認した結果                                                                                                                                      |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| cold準備中の取消     | abortを無視する旧loaderの完了を、新run成功後に返しても登録・実行しない。                                                                          |
| 新runによる旧run失効 | 新runだけが成功し、旧core後着後の次runも成功coreを再利用する。                                                                                    |
| disposeと完了の競合  | 完了Promiseの再開前にdisposeするとframeを作らず、破棄済み実行器は再実行しない。新しい実行器はloaderを呼んで成功する。                             |
| 準備期限切れ         | fake clockや短縮期限を使わず、現行20秒で環境エラーになる。期限後coreの後着を捨て、再試行と次runは成功する。                                       |
| 不完全・不正asset    | 製品factoryのloaderでWASMの長さ/hash、Worker metadata、Worker hashの不正を拒否する。失敗時frameは0、再試行で取り直し、成功後の追加取得は0。       |
| 通常UIのcold停止     | reload後の自動Preview取得を拒否して未保持状態を作り、手動判定の実要求を保留してから停止する。Source・採点履歴を保持し、解除後の再試行が合格する。 |

競合4件は信頼loaderの完了順だけを制御し、実frame／Workerと固定生成物で新runを実行します。不正asset4件は製品loaderの実fetch・bytes/hash照合を使います。通常UI停止1件と合わせて9件の対象確認が成功し、成功証拠にretryやflakyはありません。Source・判定identityとstdoutも照合しています。既存の停止試験はwarm core取得を遅らせるだけだったため、cold要求の実発生を待つ形へ修正しました。

これは当該Browser・順序での回帰証拠です。任意の競合順序、GCの即時回収、Browser全体のメモリ上限／OOM隔離、物理端末での安全性を保証しません。GCによる解放は動的に計測せず、disposeの参照解放をコードレビューで確認します。低速coldの性能未達、成功cold p95、実初心者・物理端末・公開後受入の残件は変わりません。

試験は `tests/e2e/python-core-cache.spec.ts` と `tests/e2e/python-data-project.spec.ts` の停止ケースです。前者はVite開発配信の信頼moduleを使う作者用境界試験、後者は生成済み製品画面のUI試験です。通常のPlaywright設定のChromium対象で実行でき、試験結果・添付JSON・失敗原本は私有証跡に保持します。
