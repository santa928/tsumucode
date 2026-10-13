# Python実践のcold準備期限の切り分け

現行20秒のcore保持について、[取消・後着・dispose競合と不正asset拒否の動的検証](python-core-cache-acceptance.md)を別に確認しました。期限変更や性能達成の証拠とは分けます。

Issue #147の初回20標本はそのまま保持し、再取得していません。基準はローカルcommit `9bad284`で記録した[未達の補足観測](python-practice-performance.md)です。追加診断は同じ固定Browser／Docker内loopback／production distで条件を1つずつ分け、製品の準備20秒・初期化15秒・実行1.5秒を維持しました。新サイト公開、Home／Path追加、Browser対話入力、PR205本文変更は行っていません。

## 失敗した段階と計時境界

`PythonExecutionService.execute`は不正なbackend・profile・Source／入力を拒否した後、準備timerを開始します。固定coreの読込と、そのrunのSource snapshotのSHA-256計算を並行して待ち、両方が完了して世代が有効ならtimerを解除してframeを作ります。navigation、教材／Editorの読込、前runの停止待ちは、この20秒の外です。

loaderは第1段階でcore.wasm／stdlib.zip／lock.jsonを並列にstream読込し、それぞれのbytes・hashを照合します。その後worker.json、worker.jsの順に取得・hash照合します。今回はWASMとstdlibのstreamが20秒で中止され、第1段階を終えていません。worker metadata／bundle取得とWorker作成へ進んでいないため、Worker内のWASM compile、Pyodide初期化、学習Sourceの実行速度が今回のcold失敗を起こしたとは判断しません。

core取得後は、frameの初期化15秒と、Workerがreadyになってからの実行1.5秒で別々に制限します。親には初期化＋実行＋応答回収の外側期限もあります。準備失敗まで約20秒のController Measureと、navigationから障害表示まで約24秒の値を混同しません。どちらも成功時の性能ではありません。

## 条件を分けた追加観測

各行は代表1件の切り分けであり、承認された性能標本やp95の達成判定ではありません。新規Context／HTTP cache無効、CPUはpage CDPの設定です。物理端末やWorkerの実CPU倍率は未確認です。

| 条件                                               | 観測結果                                                                                                                        |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| page CPU4x、RTT0、帯域制限なし                     | navigationから4,729.237 ms、Controller 3,532.100 msで正しいStarterのTest失敗に到達。Worker作成1回。                             |
| page CPU4x、RTT150ms、帯域制限なし                 | navigationから6,437.051 ms、Controller 3,900.100 msで正しいStarter結果に到達。Worker作成1回。                                   |
| page CPU1x、RTT150ms、down1.6Mbps／up750Kbps       | 準備20,005.500 msで失敗。Worker作成0回。CPU倍率を外しても失敗した。                                                             |
| 固定file転送だけ、page CPU4x、同じ低速回線         | loaderと同じ順で、転送・bytes/hash照合に63,146.453 ms。製品executeは呼ばず診断側を100秒で制限。製品期限を変更した成功ではない。 |
| 修正前、通常回線で取得後に同じContextの低速Preview | coreを再取得し、20,009.900 msで準備失敗。画面の前回Consoleを今回の結果へ流用しない。                                            |
| 修正候補、同じ取得済み実行器の低速Preview          | core再取得0件、新Workerを作成し、Controller 3,890.800 msで新しいStarter結果に到達。cold初回の成功ではない。                     |

候補の暖機診断はsmoke実行と時間帯が重なり、他containerの競合も制御していません。速度の精密比較に使わず、通信の再取得有無・新Worker作成・実結果への到達を確認する原本として扱います。通常回線の事前取得を、低速coldの合格へ置き換えていません。

## cold cacheと実転送量

previewの実responseを確認すると、WASMとstdlibは非圧縮、lock.jsonとworker.jsはgzipでした。file sizeだけで転送量を推測せず、CDPの実response headerとdataReceivedを保存しました。

| 固定file    | 展開後bytes | 実response body転送bytes |
| ----------- | ----------: | -----------------------: |
| core.wasm   |   9,598,218 |                9,598,218 |
| stdlib.zip  |   2,545,637 |                2,545,637 |
| lock.json   |     119,077 |                   25,748 |
| worker.json |          78 |                       78 |
| worker.js   |   1,688,884 |                  306,278 |
| 合計        |  13,951,894 |               12,475,959 |

down1.6Mbpsを200,000 bytes/sに設定しており、このpayloadだけでも名目上約62.380秒必要です。遅延・hash・UIを除いても20秒へ収まりません。帯域制限なし／遅延だけの条件では準備を終え、低速回線ではCPU等倍でも失敗したため、このpreview配信とcold条件の不両立が主因です。

CPU等倍の低速標本では、coreとstdlibがそれぞれ約1.969MBを転送した時点で、開始約20.005秒後に`net::ERR_ABORTED`となりました。lockの取得は約0.558秒で完了しています。固定20秒のAbortController中止と一致します。

これはDocker内Vite previewの配信特性です。初期390pxがPC案内画面だった設定誤りは別原本に隔離してあり、今回のPC失敗へ流用していません。

測定環境との不整合を分けるため、既存Pagesの[固定WASM](https://santa928.github.io/tsumucode/python-runtime/314.0.7/core.wasm)と残る4fileへ、本文取得なしのHEADを送りました。既存PagesではWASMがgzipで3,582,449 bytes、stdlibは2,545,637 bytes、worker.jsはgzipで298,065 bytes、lockはgzipで26,858 bytes、worker metadataは78 bytes、各cache headerはmax-age=600でした。合計6,453,087 bytesなので、同じ名目帯域でも約32.265秒です。

したがって、previewの非圧縮WASMとcache headerを、そのまま既存Pagesの実性能へ流用することはできません。一方、このHEADが示すpayloadでも20秒へ収まらない計算です。HEADだけで本文hashや実Browserのcold時間を検証したとは主張しません。公開済みの旧候補に対する読み取りであり、保留中の新候補の公開や実践Projectの配信受入ではありません。

オフラインのgzip9／Brotli5サイズ比較では、WASMは約3.593／3.227MB、stdlibは約2.504／2.501MBでした。復号後のbytes一致も確認しています。この確認で配信設定やvendorを変更していません。圧縮だけで今回の固定20秒と低速条件の両立を達成したとは扱いません。

## 期限を維持した小さな修正

同じ実行器が成功後のPreview／採点ごとに全固定assetを再取得していたため、照合済み`PythonCore`だけを`PythonExecutionService`内で保持します。グローバルcache、永続保存、Home／Path／読書での先読みは追加しません。dispose時に参照を解放します。

cacheに入れるのはloader成功、Source hash完了、世代有効の確認後だけです。失敗・中止したPromiseは保持しません。各runのSource／入力／identity／hashは毎回確定し、frame・Worker・Pyodide interpreterを新しく作ります。Python globals、module state、学習者Source、実行結果は再利用しません。既存のstructured cloneでbytesを渡し、保持したbufferをtransferでdetachしません。

この修正は取得済み実行器の不要な転送を解消します。新規実行器のcold転送量、固定core、期限、安全条件は変わらず、cold20標本の未達を解決したとは扱いません。Workerの初期化も毎run必要なままです。

故障試験は、取得済みcoreでも変更した不正Sourceを実行して構文エラーを返し、前回の成功へ置き換えないことを追加しました。さらにreloadで新実行器を作り、cache-missの503、Source／履歴保持、解除後の再試行を維持します。ネットワーク障害の期待を削除・緩和していません。

## 検証・原本と記録統合

固定Dockerで対象Prettier／Lint、既存の不正要求拒否test、型／production buildが成功しました。Chromium／Firefox／WebKitのPython smokeはretry0で7件成功、全10Fixtureは既存どおりChromiumで実行し、他2Engineのその集合だけをskipしています。保存／JSON移送、Source変更、cold取得障害からの再試行、Home／Path／読書のcore取得0、axe0を確認しました。実践Projectの通常Solution／採点／Preview／Keyboard／axeも代表1件がretry0で成功し、実画像を確認しました。これらは低速cold受入の代替ではありません。

私有原本は`.release-issue147-checks/diagnosis/`です。基準dist、CPU／回線／遅延／転送／旧候補warmのJSON・全通信、capture時の観測器、候補のSource／dist／課題hash、build／smoke／Projectの原本を保持します。元20標本と9bad284の4文書も保持し、失敗や未達を上書きしていません。最初のLint失敗も保持し、変更Sourceの観測追加後に必要範囲だけを再確認しました。

公開済みリポジトリへの記録統合は、9bad284とこの修正の専用branch差分を独立レビューし、必要なexact HEAD CI、通常PR merge、merge SHAのmain CIを確認する順です。生Source／ログ／画像／基準distは公開pushへ含めません。新しい公開承認・候補Source／tree／dist／品質bindingは別に必要で、旧公開承認やPR205本文を更新して代用しません。

Issue #147は、cold受入方法・配信と固定期限の整合、性能予算・標本、実人受講、必要な物理端末観察、公開候補の原本照合と公開後受入が残るためOpenです。WASM圧縮などの配信是正、固定core変更、期限の変更は対象・安全性・配信先への影響を整理して別に判断し、先にしきい値を変えて通しません。
