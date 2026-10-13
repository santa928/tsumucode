# Python初回取得90秒分離の検証

2026-10-13の承認範囲は、固定assetの取得・照合90秒分離、取得量と段階、取消・再試行の案内です。Source hash20秒を並列に維持し、Worker初期化15秒、ready後の解析・Source反映・実行1.5秒、親の応答回収18秒は変更しません。サイト公開は含みません。

Docker内の実Chromiumで17件の対象境界が初回成功し、retry・flakyは0件でした。取得90秒の実時計、Source hash20秒の実時計、取消・旧run後着・dispose競合、不正なWASM長さ/hash・metadata・Worker hash、製品stream途中の取消と進捗拒否、初期化15秒・実行1.5秒、通常UIのSource／履歴保持と再試行を確認しています。timer callbackが遅れる場合のSource照合・asset照合・cache登録直前の拒否は、試験realmの単調clock読取だけを進めた別ケースです。実時計の標本や性能統計へは混ぜません。

取得90秒の初回終了は約90.003秒、初期化は約15.088秒、実行は約1.576秒でした。これらは限界停止の回帰証拠で、成功性能やp95ではありません。取消後は旧runの通知とframe作成を拒否し、新runを実Workerで成功させています。cache登録は完全な固定bytes、Source hash、現在世代、未取消、登録直前の絶対期限を満たす場合だけです。小さなstream chunkは64 KiB刻みで画面へ通知し、進捗で期限を延長しません。

取得中の状態・indeterminate progress・停止操作を実画面で確認し、Enterによる取消、axe違反0件、画像の実読取を確認しました。取得中はコード未実行と示し、初期化と実行を分けます。固定assetの読込／hash／stream破棄はadapterの`loadPythonCore.ts`が担い、画面はController所有とSource revisionが一致する通知だけを表示します。Home／Path／読書での先読みは追加しません。

低速coldは既知Solutionと正規schemaを保存したfresh Context、HTTP cache disabled、1280×720、page CPU4x、RTT150ms、下り1.6Mbps／上り750Kbps、Docker production previewで観測します。一時workspace leaseをseedへ持ち込まず、現在runの実Worker・成功出力・履歴に残る採点成功を確認します。失敗表示時間を成功標本へ数えず、成功標本のみnearest-rank p95を計算します。正式20標本の結果は測定後に追記します。pilotと過去の失敗20標本は別に保持します。

Worker／frameの実CPU倍率、物理端末、実初心者、公開配信は未確認です。任意の競合順序、GCの即時回収、Browser全体のメモリ上限／OOM隔離は保証しません。配信圧縮は変更しておらず、既存Pages HEAD由来の32.265秒は理論値のままです。性能受入・公開binding／許可・配信後受入は、実装の統合とは別の条件として残します。
