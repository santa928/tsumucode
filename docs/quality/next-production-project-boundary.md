# 制作2教材とSourceの持ち出し（Issue #136）

Next CourseのGuided `next-ch05-l01` とCapstone `next-ch06-l01`を追加する。
旅行と読書会は独立したWorkspace・Source・工程達成・下書きを持つ。
Courseは6章9教材・draftで、公開は#137の受入ゲートで判定する。

## 教材と工程

Guidedは一覧と2つの詳細、GET選択、metadata/Imageを3工程で制作する。
Capstoneは残席3/0という別条件へ応用する。GETはURLの選択であり永続保存ではない。
全概念の強制使用や、Server Action・DB・認証・外部サービスは追加しない。
各教材の3 Guide、Brief、工程、Hint、Solution、正負Fixtureを対応させる。
CapstoneのGuideは答えの修正コードを提示しない。

固定Sourceは9ファイル。3つのpageだけを編集し、layout、CSS、固定データ、
catalog helper、API、SVGは読み取り専用にする。catalogは同じ隔離内のloopbackから
実HTTPで取得する。画像は固定SVGを`Image`の`unoptimized`で表示する。
外部画像や画像最適化サービスの正式対応を意味しない。

採点は実文書・応答完了・URL・Keyboard操作を工程ごとに確認する。

| 工程         | 観測                                             |
| ------------ | ------------------------------------------------ |
| structure    | 入口→一覧→異なる2詳細→一覧、題名と条件           |
| filter       | 2種類の実GET選択、不正値の案内・空一覧・回復     |
| presentation | title/description、実画像、alt・320×160、main/h1 |

3個の固定goalと順序・booleanをcontrollerでも検査し、総合passには全工程を要求する。
コードエラーや観測欠落を達成へ補完しない。部分達成を工程別Progressへ保存し、
後から壊れた工程は現在の達成から外す。合格版と現在の下書きが違えば完了にしない。

## 実行と公開Previewの境界

本人承認の上限1,000,000,000 bytes以内で、制作2 WorkspaceだけRAMを
896 MiB（939,524,096 bytes）へ固定する。MemorySwapは同値で追加swapはない。
既存7教材は旧3教材576 MiB・旧4教材512 MiBのまま。要求から上限を指定できない。
CPU1・PID64・network:none・非root・readonly・tmpfs各64 MiBを維持する。
固定Node24.18.0/Next16.3.8/React19.2.7、Turbopack、Next child heap128 MiBを再利用する。
Next readiness15秒、controller startup/apply20秒、採点10秒を延長しない。

公開する文書は各教材の固定10経路のみ。GET/HEADだけを許可し、RSC、Action、
router tree、prefetch、未知queryを拒否する。既存chunk・CSS・HMRの有限経路と
応答量、Host/Origin、資格情報除外、Source/run照合、socket sealを維持する。
capstoneからGuidedや管理APIへ到達できる経路は追加しない。

## ZIPと端末JSON

`制作Sourceを持ち出す`はクリック時点のSourceを非同期Import前に固定する。
未保存・未合格の編集もそのまま持ち出し、元DraftやSource保存版、合格記録を書き戻さない。
100 KiB以下・固定ファイル名・読み取り専用Source一致を検査し、Source/Assetと
固定manifest/lockfile、tsconfig、Next設定、Dockerfile、Compose、READMEだけをZIPにする。
管理token・実行ID・他Workspace・学習履歴・作者の解答は包装から追加しない。

ZIPは実Next/Nodeを起動するSourceで、静的exportや合格証明ではない。
READMEのDocker/Compose手順で依存取得・production build・起動・変更後の再build・
エラー確認・停止・subpathを案内する。持ち出したコードの自分の編集はそのまま保持する。
サイトの進捗JSONは別の移送操作であり、2教材の下書きと合格記録を独立して保存・復元する。

制作用Nativeの896 MiBと、ZIPのproductionサーバーの512 MiBは別環境の実測である。
production buildの作業資源を、学習Nativeの上限内でのbuild成功とは扱わない。
ZIP復元は採点外の制作工程で、metadataや実画像の判定を置き換えない。

## 検証とレビュー

`next-project-acceptance.mjs`はGuided11/Capstone12 Fixtureの工程別期待値、
metadata/画像/labelの負例、部分達成、後工程破損、偽navigation、構文エラー、
同じSource/run、旧版409、停止・再開、grader回収、資源の実値を確認する。

`next-production-browser-acceptance.mjs`は通常Guide/演習から編集・反映・3行の判定、
後工程の破損と回復、Tab/Enter・GET選択・実2詳細、不正値からの回復、axe、
狭幅のPC案内、停止/reload/再起動を確認する。実ZIPを展開し全Source/包装を比較し、
未反映の編集とSource保存版の分離、元Draft保持、独立2教材のJSON export/importも確認する。

内容・初心者・運用の独立レビューは作者の実行証拠と区別して記録する。
AIペルソナレビューは人間初心者の受講観察ではない。
資源受入、通常Journey、独立レビュー、正確なHEAD/main CIが揃うまでマージ・Issue完了にしない。

作者の学習Native全23 Fixtureは承認済み896 MiBで成功した。
Guidedのmemory peakは678,424,576 bytes、Capstoneは624,803,840 bytes、
全採点完了checkpointのmax/OOM/kill/Zombieは0、PID最大39だった。
通常UIの追加監視では起動中の1 sampleでZombie1を観測し、次sampleから同run終了まで0。
これは「全瞬間でZombie0」の証拠ではなく、残存・蓄積なしという範囲の観測である。
独立運用レビューは製品の必須修正にせず、既存checkpointのZombie0条件を維持した。

JSON再読み込みで内部goalを含む採点履歴が厳格な保存契約から隔離される問題を修正した。
実観測goalは対応付けに使い、永続ValidationCheckは公開契約の項目だけへ変換する。
合格Snapshotと履歴が読み込み後も保持される回帰テストを追加した。
