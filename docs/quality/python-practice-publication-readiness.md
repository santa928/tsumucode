# Python実践Courseの公開受入対応（#147・#16）

2026-11-06時点の対象は `python-practice`、3章・5 Lesson・11概念Slide・標準4演習・Guided Project1件、設定95分である。学習前提はPython基礎のList・for・Function・例外。Courseは `draft`、Python Pathは基礎Courseだけを掲載している。以下は公開準備の対応表であり、公開完了記録ではない。

既存の教材・採点・保存処理を再実装しない。本人の2026-11-03の指示に従い、旧Issueの実人条件には承認済みAIペルソナ受入を使う。新教材がない本対応で、過去に確認した教材を3役全員が最初から再観察する条件は追加しない。実人の理解・物理端末性能は未測定のまま保持する。

## 教材と既存証拠

| 対象                            | 教材・受入元                                                                                                                        | 確認済みの範囲と限界                                                                                                                                                                                                                                           |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 内包表記・Iterator・Generator   | #144 / [PR201](https://github.com/santa928/tsumucode/pull/201)、ch01-l01〜l03                                                       | 両実Engine各28作者Fixture。空入力、同じIteratorの消費・枯渇・再生成、Generatorの生成・中断・終了と全消費を確認。学習者提出の採点はSourceの値の流れと実stdoutであり、提出ごとの内部object直接観測ではない。                                                     |
| with・終了処理                  | #145 / [PR202](https://github.com/santa928/tsumucode/pull/202)、ch02-l01                                                            | 両実Engine各14作者Fixture。実StringIOの正常・例外close、終了後の利用拒否、空・再closeを確認。手動closeや使われないwithを正解にせず、ホスト・他Workspace・禁止importを負例に含む。                                                                              |
| 型注釈・dataclass・値検証・Test | #146 / [PR203](https://github.com/santa928/tsumucode/pull/203)、ch03-l01                                                            | 両実Engine各16作者Fixture。生成initとfield、注釈が値を強制しないこと、int変換と負値拒否、正常・不正・空データ、stream終了を確認。固定assert失敗、構文・実行エラー、system error／未採点を分ける。                                                              |
| 保存・Reset・復帰               | 上記3PRと[公開前技術受入](python-practice-course-acceptance.md)                                                                     | 通常UIで旧revision移行、Source・履歴・成功Snapshot保持、reload、Reset、JSON移送を確認。Pages／Localは別originで、端末間の自動同期を意味しない。                                                                                                                |
| 読書・Accessibility・配信境界   | [PR205](https://github.com/santa928/tsumucode/pull/205)、公開前技術受入                                                             | PC／390pxで全11Slide、図の実読込、axe違反0、横overflowなし、本文末尾・Pager到達。Home／Path／読書のPython core取得0、subpath・chunk分離・静的Artifact検査。実VoiceOver・物理touchの検証ではない。                                                              |
| 初見・回復・狭幅の代替受入      | [PR220](https://github.com/santa928/tsumucode/pull/220)、[共通CUA記録](python-computer-use-acceptance.md#pr220で完了した影響再操作) | 新規独立3名の影響再操作を親が直接受入。初回演習の説明・直接再開・Source保持、保存reload、開始直後停止後の再実行・合格、合格後編集の案内、390×844のProject本文と戻り・keyboard／focusが対象。全Lessonを3名が完了した記録、全Project実装、人間の理解度ではない。 |

各最終HEAD・mergeとCIは上記PRと既存受入を参照する。#144〜#146はCLOSED、#147と親#16はOPEN。Python入力#196／#140、Python基礎改訂#259、React#260、HTML/CSS#108、Course横断#153〜#155とは別の範囲である。それらの未完条件を本Courseの完了や逆方向の依存へ置き換えない。

## 旧入力と現候補の照合

PR220受入Sourceは `6b06d58530a57a5bda7c6c1a8b0eb3d95fce7931`、treeは `85b143b26b35aaeb68ce11df1b8b16729a6ab966`、固定dist tree SHA-256は `285276bd94e3a32dcc4ef81914fa2a50500e34dc1aafe02d34773e2b5062ef4f`。CUA担当は画面からSHAを検証しておらず、進行担当が対応を確認した。保存された受入報告は親の直接報告であり、子原画像の直接閲覧を意味しない。

公開候補基点 `9821a4eb16b7395ccf94bfbb59f467507bca97b3` とPR220の `content/python-practice` は、ともにGit subtree `36829dae17cb50ddaedf4fdeb0d3b0697c7531a8`。Docker内で現Compilerに両方の教材を入力し、次を確認した。

- 両教材のrelease v2 inventoryは完全一致。単独Course inventoryの `hashValue` は `26d90e2f5e105b9e4187beb027962497d3a9e0796faa0438815ba129f815bf38`。
- 内容レビューは5 Lesson、stale hash 0、rejected 0。Course revisionは `2026-10-14.1`、publicationStatusは `draft`。
- この照合ではBrowser、Pyodide、CPython、公開サイトを実行していない。現在のdistや配信bytesの一致を確認した値ではない。

独立した原本監査でも、PR220最終snapshotに含まれる教材111ファイルと保護された固定dist 564ファイルを実bytesのSHA-256で再照合し、不一致・欠落0を確認した。これは旧固定成果物の保全確認であり、新候補のdist再buildや子CUA原画像の直接検査ではない。現行の内容台帳5件はPR220時点と同一で、基点Sourceのcontent policyに本Courseの明示撤回は0件である。

後続の共通UI・Worker・Local client変更は教材treeと別入力である。旧受入の元Source・対象操作・限界を保持し、今回の技術差分は統合候補の関連検証／公開Gateで確認する。教材不変だけを理由に現アプリの全操作、全Engine、保存互換、セキュリティの成功を宣言しない。

## 性能と実行能力

固定CPython 3.14.2／Pyodide 314.0.7を使う既存Runtimeを再利用する。任意pip、外部DB、新サービス、ホストfileへのアクセス、汎用Context manager／decorator実装は到達点に含めない。[実行契約](python-runtime-contract.md)と[Local境界](local-python-runtime.md)の対応範囲・期限・資源制限を維持する。

[旧cold20標本](python-practice-performance.md)は20秒取得期限で失敗した。一方、承認済み90秒取得分離後の[正式cold20標本](python-cold-preparation-acceptance.md)は20成功・失敗0、遷移から現在Console成功までのp95は70,435.157msである。後者は既知Solution・root配信・fresh Context・固定の帯域／遅延／page CPU条件の観測で、旧Starter／subpath標本との改善率には使わない。90秒は安全期限であり数値SLAではない。Pages実配信や物理低端末の性能保証、現在候補の再測定とは扱わない。[warm限定診断](python-practice-preparation-diagnosis.md)も別条件のまま保持する。

## 現行公開Gateへ渡すもの

正式入口は [開発・公開方針](development-testing.md)の同一run候補方式である。旧文書の「python-basicsまでのallowlist」は当時の公開契約の履歴であり、現行方式の対象選択には使わない。初期状態の `python-practice-release-preparation.yaml` は空の草稿記録で、旧受入が未実施だったことや公開承認済みであることの証拠にはならない。

既存 `inspectContentOriginal` は、元SourceのLesson inventory、learnerDigest、役割・担当・session/context、観測方式、内容条件、原本bytes、独立照合を確認する。まず実在する旧原本をその範囲で対応付ける。旧3名CUAの部分観測から5 Lesson×3役の新しい完了承認を作ったり、親の受入報告を取得していない子画像の直接検査へ変換したりしない。

不足する原本・scopeは統合担当へ具体的に渡す。専用原本の不足を埋める目的で共通digest・schema・受付条件を緩めず、旧受入を未公開のまま公開済みbaselineへ登録しない。必要な共有受付の変更は統合担当の所有範囲で行う。私有ログ、画像、Source seed、学習者コードを公開pushに含めない。

## 公開後確認とclose条件

統合担当が最終Sourceを固定し、そのSourceの必要CI・公開Gate・既存許可を確認してからCourseを公開対象とする。Python Pathへの追加は、既存の `python-basics` Path ID／URLを保ち、`python-basics` の後に `python-practice`、前提Courseを `python-basics` とする。Pathの名称・説明は実際の掲載範囲と対応能力に合わせる。基礎の到達点・別担当の公開条件を同時に完了扱いにしない。

公開候補は一度buildし、同一runの資格・現在main・実際の親配信・固定publisher・保護Environmentの検査を通す。通常PRのCI成功、dispatch受付、旧草稿checker成功だけでは公開完了にしない。

配信後は専用の合成学習データを使い、次を記録する。実行前の項目をチェック済みにしない。

- [ ] 公開run、最終Source SHA、deployment ID、候補／配信artifact digest、実配信URL・確認時刻、全公開bytesの対応を記録する。
- [ ] Home→Python Path→実践Courseへ進み、基礎→実践の順序・前提案内・最初のLessonの開始を確認する。
- [ ] 代表の初回演習とデータProjectで実Pyodideの判定・Source編集後の再判定、Course往復・reload後のSource／履歴／成功版を確認する。実行成功と採点合格、Test失敗とcode/system errorを区別する。
- [ ] 代表演習でReset後のstarter復帰と再実行、Export→別のfresh状態へのImportを確認し、既存の別Course保存を保持する。
- [ ] 狭幅で読書・Project案内へ到達し、keyboard／focus／ラベル・状態表示・横overflowを代表確認する。Home／Path／読書でcoreを先読みしない。
- [ ] 公開後の自動操作が同じPython capabilityの基礎演習だけを選ぶ場合、実践Course固有の確認を別途記録する。共通capability代表の成功を実践の全確認へ広げない。
- [ ] 未確認・既知制限と必要な是正を記録し、blocking findingがあれば対象だけを修正・再検証する。

Local CPythonの成功は同SourceのLocal／Native証拠で確認する。Pagesからlocalhostへ自動接続しない。公開サイトの操作だけをLocal CPythonの実行成功へ数えない。

#147は上記の公開前対応・必要検証・独立レビューと公開後確認が揃ってから閉じる。親#16は#144〜#147の全必須条件と要件／概念対応を確認して閉じる。未公開の段階では両IssueをOPENに保つ。
